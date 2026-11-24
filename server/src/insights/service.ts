import type { CalendarEvent } from "../connectors/types.js";
import { aggregate, type Aggregates } from "./aggregate.js";
import { CATEGORY_LABELS, type Category } from "./categories.js";
import { classifyGroups } from "./classify.js";
import { groupEvents } from "./groups.js";
import { interpret } from "./interpret.js";
import type { JsonCompletion, LlmClient } from "./llm.js";
import { collectNumbers, unsupportedNumbers } from "./verify.js";

export interface Pricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface Insight {
  tone: "warning" | "positive" | "neutral";
  title: string;
  detail: string;
  suggestion: string;
  evidence: { ref: string; title: string; occurrences: number; category: Category }[];
  /** Numbers in the text that don't appear in the data the model was given. */
  unsupportedNumbers: number[];
}

export interface TraceStep {
  step: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface InsightsResult {
  generatedAt: string;
  summary: string;
  insights: Insight[];
  categories: Aggregates["byCategory"];
  patterns: Aggregates["patterns"];
  /** Category per event ID, so the UI can label the event list. */
  eventCategories: Record<string, Category>;
  trace: {
    model: string;
    totalLatencyMs: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    steps: TraceStep[];
    checks: { groupsClassified: number; missingClassifications: number; invalidRefs: number; insightsDropped: number };
  };
}

/**
 * Sent while the pipeline runs, so the UI can show verified results stage by stage instead
 * of waiting for everything. We stream stages, not model tokens: nothing reaches the user
 * before the code has checked it.
 */
export type ProgressEvent =
  | { type: "stage"; stage: "classifying" | "interpreting"; kindsOfEvent: number }
  | {
      type: "categories";
      categories: Aggregates["byCategory"];
      patterns: Aggregates["patterns"];
      eventCategories: Record<string, Category>;
    };

export async function generateInsights(opts: {
  events: CalendarEvent[];
  timeZone: string;
  periodDays: number;
  llm: LlmClient;
  pricing: Pricing;
  log?: (entry: Record<string, unknown>) => void;
  onProgress?: (event: ProgressEvent) => void;
}): Promise<InsightsResult> {
  const { events, timeZone, periodDays, llm, pricing } = opts;
  const log = opts.log ?? ((entry) => console.log(JSON.stringify(entry)));
  const started = Date.now();
  const steps: TraceStep[] = [];
  const record = (call: JsonCompletion, step: string) => {
    const costUsd =
      (call.inputTokens * pricing.inputUsdPerMillion + call.outputTokens * pricing.outputUsdPerMillion) / 1_000_000;
    const entry = { step, model: call.model, latencyMs: call.latencyMs, inputTokens: call.inputTokens, outputTokens: call.outputTokens, costUsd };
    steps.push(entry);
    // One structured log line per model call: no prompt or calendar content, just usage.
    log({ type: "llm_call", ...entry });
  };

  // 1. Group events by title (code).
  const groups = groupEvents(events, timeZone);

  const progress = opts.onProgress ?? (() => undefined);
  progress({ type: "stage", stage: "classifying", kindsOfEvent: groups.length });

  // 2. Classify each kind of event (AI).
  const classified = await classifyGroups(llm, groups);
  if (classified.call) record(classified.call, "classify_events");

  const categoryByEventId: Record<string, Category> = {};
  for (const g of groups) {
    const cat = classified.categoryByRef.get(g.ref) ?? "other";
    for (const id of g.eventIds) categoryByEventId[id] = cat;
  }

  // 3. Count (code).
  const aggregates = aggregate(events, (e) => categoryByEventId[e.id] ?? "other", timeZone, periodDays);

  // The breakdown is final at this point (every number is computed in code), so show it now.
  progress({ type: "categories", categories: aggregates.byCategory, patterns: aggregates.patterns, eventCategories: categoryByEventId });
  progress({ type: "stage", stage: "interpreting", kindsOfEvent: groups.length });

  // 4. Interpret (AI), then check its citations and numbers (code).
  const interpreted = await interpret(llm, aggregates, groups, classified.categoryByRef, { periodDays, timeZone });
  record(interpreted.call, "interpret_calendar");

  const allowed = collectNumbers(interpreted.promptData);
  const groupByRef = new Map(groups.map((g) => [g.ref, g]));
  const insights: Insight[] = interpreted.insights.map((i) => ({
    tone: i.tone,
    title: i.title,
    detail: i.detail,
    suggestion: i.suggestion,
    evidence: i.evidence.map((ref) => {
      const g = groupByRef.get(ref)!;
      return { ref, title: g.title, occurrences: g.occurrences, category: classified.categoryByRef.get(ref) ?? "other" };
    }),
    unsupportedNumbers: unsupportedNumbers(`${i.title} ${i.detail} ${i.suggestion}`, allowed),
  }));

  const sum = (k: "inputTokens" | "outputTokens" | "costUsd") => steps.reduce((s, x) => s + x[k], 0);
  return {
    generatedAt: new Date().toISOString(),
    summary: interpreted.summary,
    insights,
    categories: aggregates.byCategory,
    patterns: aggregates.patterns,
    eventCategories: categoryByEventId,
    trace: {
      model: llm.model,
      totalLatencyMs: Date.now() - started,
      inputTokens: sum("inputTokens"),
      outputTokens: sum("outputTokens"),
      costUsd: Math.round(sum("costUsd") * 1_000_000) / 1_000_000,
      steps,
      checks: {
        groupsClassified: groups.length,
        missingClassifications: classified.missingRefs.length,
        invalidRefs: classified.unknownRefs.length,
        insightsDropped: interpreted.droppedInsights,
      },
    },
  };
}

export { CATEGORY_LABELS };
