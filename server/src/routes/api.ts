import { createHash } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { clientForConnection } from "../auth/google.js";
import type { Config } from "../config.js";
import { CalendarApiError, fetchCalendarEvents } from "../connectors/googleCalendar.js";
import type { CalendarEvent } from "../connectors/types.js";
import { sampleEvents } from "../demo/sampleEvents.js";
import { UsageLimiter } from "../insights/limits.js";
import { LlmError, OpenAiClient, type LlmClient } from "../insights/llm.js";
import { generateInsights, type ProgressEvent } from "../insights/service.js";
import { computeStats } from "../insights/stats.js";
import { isValidTimeZone } from "../insights/time.js";
import { hasCalendarAccess, type GoogleConnection } from "../session.js";

function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) return res.status(401).json({ error: "not_signed_in" });
  next();
}

const RangeQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(28),
  tz: z.string().max(64).refine(isValidTimeZone, "Unknown time zone").default("UTC"),
});

const InsightsBody = RangeQuery.extend({ refresh: z.boolean().default(false) });

/** Calendar is usable if access was granted and we can still get a valid access token. */
function calendarUsable(connection: GoogleConnection | undefined): boolean {
  if (!hasCalendarAccess(connection)) return false;
  return Boolean(connection!.refreshToken) || (connection!.expiryDate ?? 0) > Date.now() + 60_000;
}

export function apiRouter(config: Config, llm: LlmClient | null = defaultLlm(config)): Router {
  const router = Router();
  const limiter = new UsageLimiter(config.INSIGHTS_PER_SESSION_PER_HOUR, config.INSIGHTS_PER_DAY);

  router.get("/me", (req, res) => {
    const { user, demo, google } = req.session;
    if (!user) return res.json({ user: null });
    res.json({
      user,
      demo: Boolean(demo),
      connections: { googleCalendar: Boolean(demo) || calendarUsable(google) },
      aiEnabled: Boolean(llm),
    });
  });

  /** Loads events for the signed-in user (or sample data in demo mode). */
  async function loadEvents(req: Request, days: number, timeZone: string): Promise<CalendarEvent[]> {
    if (req.session.demo) return sampleEvents(new Date(), timeZone);
    const connection = req.session.google;
    if (!connection || !calendarUsable(connection)) {
      throw new CalendarApiError("Google Calendar is not connected", 409);
    }
    const client = clientForConnection(config, connection, (updated) => {
      req.session.google = updated; // keep the refreshed access token
    });
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return fetchCalendarEvents(client, from, to);
  }

  router.get("/calendar/events", requireUser, async (req, res, next) => {
    try {
      const { days, tz } = RangeQuery.parse(req.query);
      const events = await loadEvents(req, days, tz);
      res.json({ events, stats: computeStats(events, tz), source: req.session.demo ? "demo" : "google" });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Everything that can fail before we call the model: validation, loading events, cache, limits.
   * Returns either a ready answer (an HTTP status and body) or what's needed to run the pipeline.
   */
  type Prepared =
    | { done: { status: number; body: object }; run?: undefined }
    | { done?: undefined; run: (onProgress?: (event: ProgressEvent) => void) => Promise<object> };

  async function prepareInsights(req: Request): Promise<Prepared> {
    if (!llm) return { done: { status: 503, body: { error: "ai_not_configured" } } };
    const { days, tz, refresh } = InsightsBody.parse(req.body ?? {}); // ZodError -> 400
    const events = await loadEvents(req, days, tz);
    if (events.filter((e) => !e.allDay).length === 0) return { done: { status: 422, body: { error: "no_events" } } };

    // Same events, same model: reuse the last answer instead of paying for a new one.
    const key = cacheKey(events, tz, days, llm.model);
    const cached = req.session.insightsCache;
    if (!refresh && cached?.key === key) {
      return { done: { status: 200, body: { ...(cached.result as object), cached: true } } };
    }

    const { history, blocked } = limiter.tryUse(req.session.insightsHistory ?? []);
    req.session.insightsHistory = history;
    if (blocked) return { done: { status: 429, body: { error: blocked } } };

    const run = (onProgress?: (event: ProgressEvent) => void) =>
      generateInsights({
        events,
        timeZone: tz,
        periodDays: days,
        llm,
        pricing: { inputUsdPerMillion: config.OPENAI_INPUT_USD_PER_MTOK, outputUsdPerMillion: config.OPENAI_OUTPUT_USD_PER_MTOK },
        onProgress,
      }).then((result) => {
        req.session.insightsCache = { key, result };
        return { ...result, cached: false };
      });
    return { run };
  }

  /** The model failed, timed out, or returned something that didn't match our schema. */
  function isModelFailure(err: unknown): boolean {
    const failed = err instanceof LlmError || err instanceof z.ZodError || err instanceof SyntaxError;
    if (failed) {
      console.error(JSON.stringify({ type: "insights_failed", error: err instanceof z.ZodError ? "schema_mismatch" : (err as Error).message }));
    }
    return failed;
  }

  // Plain JSON: waits for the whole pipeline. Simple to call from scripts and tests.
  router.post("/insights", requireUser, async (req, res, next) => {
    let prepared;
    try {
      prepared = await prepareInsights(req);
    } catch (err) {
      return next(err);
    }
    if (prepared.done) return res.status(prepared.done.status).json(prepared.done.body);
    try {
      res.json(await prepared.run());
    } catch (err) {
      if (isModelFailure(err)) return res.status(502).json({ error: "insights_failed" });
      next(err);
    }
  });

  // Streaming: one JSON object per line (NDJSON), sent as each stage finishes. The UI shows the
  // category breakdown after the first model call instead of waiting for the second.
  router.post("/insights/stream", requireUser, async (req, res, next) => {
    let prepared;
    try {
      prepared = await prepareInsights(req);
    } catch (err) {
      return next(err); // nothing sent yet, so normal error responses still work
    }
    if (prepared.done && prepared.done.status !== 200) {
      return res.status(prepared.done.status).json(prepared.done.body);
    }

    res.status(200).set({
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // ask proxies not to buffer the stream
    });
    res.flushHeaders();
    const send = (event: Record<string, unknown>) => {
      if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
    };

    try {
      if (prepared.done) {
        send({ type: "result", result: prepared.done.body });
      } else {
        const result = await prepared.run(send);
        send({ type: "result", result });
      }
    } catch (err) {
      // Headers are already sent, so the error travels as an event.
      if (!isModelFailure(err)) console.error(err);
      send({ type: "error", error: "insights_failed" });
    } finally {
      res.end();
    }
  });

  return router;
}

function defaultLlm(config: Config): LlmClient | null {
  return config.OPENAI_API_KEY ? new OpenAiClient({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL, baseUrl: config.OPENAI_BASE_URL }) : null;
}

function cacheKey(events: CalendarEvent[], tz: string, days: number, model: string): string {
  const hash = createHash("sha256");
  hash.update(`${model}|${tz}|${days}|`);
  for (const e of events) hash.update(`${e.id}|${e.title}|${e.start}|${e.end}|${e.attendeeCount}\n`);
  return hash.digest("hex");
}
