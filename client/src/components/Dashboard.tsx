import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { Category, EventsResponse } from "../types";
import { AiInsights, type InsightsProgress, type InsightsState } from "./AiInsights";
import { EventList } from "./EventList";
import { StatsSummary } from "./StatsSummary";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: EventsResponse };

const INSIGHT_ERRORS: Record<string, string> = {
  ai_not_configured: "AI insights aren't configured on this server (no OpenAI API key).",
  session_limit: "You've generated insights several times in the last hour. Please try again later.",
  daily_limit: "The demo has reached today's AI limit. Please try again tomorrow.",
  insights_failed: "The AI couldn't produce insights this time. Please try again.",
};

const periodLabel = (days: number) => (days === 28 ? "four weeks" : `${days} days`);

export function Dashboard({ demo, aiEnabled, onDemo }: { demo: boolean; aiEnabled: boolean; onDemo: () => void }) {
  const [days, setDays] = useState(28);
  const [state, setState] = useState<State>({ status: "loading" });
  const [insights, setInsights] = useState<InsightsState>({ status: "loading", progress: { stage: "starting" } });
  // Categories arrive before the insights do; keep them so the event list can show labels early.
  const [earlyCategories, setEarlyCategories] = useState<Record<string, Category>>({});
  const running = useRef<AbortController | null>(null);

  const loadInsights = useCallback((refresh: boolean, forDays: number) => {
    running.current?.abort(); // a newer request replaces an older one
    const controller = new AbortController();
    running.current = controller;
    let progress: InsightsProgress = { stage: "starting" };
    let finished = false;
    setInsights({ status: "loading", progress });
    setEarlyCategories({});

    api
      .insightsStream({ refresh, days: forDays, signal: controller.signal }, (event) => {
        if (controller.signal.aborted) return;
        if (event.type === "stage") {
          progress = { ...progress, stage: event.stage, kindsOfEvent: event.kindsOfEvent };
          setInsights({ status: "loading", progress });
        } else if (event.type === "categories") {
          progress = { ...progress, categories: event.categories };
          setInsights({ status: "loading", progress });
          setEarlyCategories(event.eventCategories);
        } else if (event.type === "result") {
          finished = true;
          setInsights({ status: "ready", data: event.result });
        } else {
          finished = true;
          setInsights({ status: "error", message: INSIGHT_ERRORS[event.error] ?? INSIGHT_ERRORS.insights_failed! });
        }
      })
      .then(() => {
        // The connection closed without a result (e.g. the server restarted mid-run).
        if (!finished && !controller.signal.aborted) {
          setInsights({ status: "error", message: INSIGHT_ERRORS.insights_failed! });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const code = err instanceof ApiError ? err.code : "";
        if (code === "no_events") {
          return setInsights({
            status: "info",
            message:
              "Only all-day events were found. The AI looks at events with a start and end time, because those are what take up your day. Add a few timed events, or look at a longer period.",
          });
        }
        setInsights({ status: "error", message: INSIGHT_ERRORS[code] ?? "Something went wrong getting insights." });
      });
  }, []);

  useEffect(() => () => running.current?.abort(), []);

  useEffect(() => {
    setState({ status: "loading" });
    api
      .events(days)
      .then((data) => {
        setState({ status: "ready", data });
        if (data.events.length > 0) loadInsights(false, days);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof ApiError && err.status === 401
            ? "Your session has expired. Please sign in again."
            : err instanceof ApiError && err.status === 429
              ? "Google is limiting requests right now. Please try again in a minute."
              : "We couldn't load your calendar. Please try again.";
        setState({ status: "error", message });
      });
  }, [days, loadInsights]);

  if (state.status === "loading") return <p className="muted">Loading your last {periodLabel(days)}…</p>;
  if (state.status === "error") return <p className="error">{state.message}</p>;

  const { events, stats } = state.data;
  if (events.length === 0) {
    return (
      <section className="card">
        <h2>Nothing to analyse yet</h2>
        <p>
          Your calendar is connected, but it has no events in the last {periodLabel(days)}
          {days < 90 ? "." : ". Add a few events to your Google Calendar, or explore with sample data."}
        </p>
        <div className="actions">
          {days < 90 && (
            <button className="button primary" onClick={() => setDays(90)}>
              Look back 90 days
            </button>
          )}
          <button onClick={onDemo}>View sample data instead</button>
        </div>
        <p className="notice">Sample data signs you out of Google and shows a made-up calendar with real AI analysis.</p>
      </section>
    );
  }

  const categories: Record<string, Category> =
    insights.status === "ready" ? insights.data.eventCategories : earlyCategories;

  return (
    <div className="dashboard">
      {demo && <p className="notice">You are viewing sample data. The AI analysis is real.</p>}
      {aiEnabled ? (
        <AiInsights state={insights} onRegenerate={() => loadInsights(true, days)} />
      ) : (
        <AiInsights state={{ status: "error", message: INSIGHT_ERRORS.ai_not_configured! }} onRegenerate={() => undefined} />
      )}
      <StatsSummary stats={stats} period={periodLabel(days)} />
      <EventList events={events} categories={categories} />
    </div>
  );
}
