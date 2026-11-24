import { z } from "zod";
import type { Category } from "./categories.js";
import type { Aggregates } from "./aggregate.js";
import type { EventGroup } from "./groups.js";
import type { JsonCompletion, LlmClient } from "./llm.js";

/** How many kinds of event the interpreter sees as possible evidence. */
export const MAX_GROUPS_FOR_EVIDENCE = 40;

const SYSTEM = `You are a sharp, kind time-management coach. You get a summary of one person's calendar
over recent weeks: hours per category, hours per weekday and category, patterns, and the kinds of
events behind them (each with a ref like "g3").

Write 3 or 4 insights that the person could not see from a simple total. Good insights connect two
facts (e.g. which weekday deep work disappears and which meetings cause it), notice what is working,
or spot a risk (back-to-back runs, out-of-hours work, focus time eaten by recurring meetings).

Rules:
- hoursByWeekdayAndCategory and events[].totalHours are totals over the whole period
  (patterns.weeks weeks), not per day or per week. Say "across the N Fridays" or similar.
- Be concrete: quote the relevant numbers from the data (hours, shares, counts) instead of
  words like "several" or "likely".
- Use only numbers that appear in the data. Do not calculate new numbers or percentages.
- Every insight cites 1 to 4 refs from "events" in its evidence field, and only refs that exist.
  Refs are internal: never write them in the summary, title, detail or suggestion; use event titles.
- Each suggestion is one specific action that names a real event or day, not generic advice.
- Include at least one positive insight if anything is going well.
- Do not judge personal events; treat them as time that is protected, not wasted.
- Plain, friendly English. Title under 70 characters; detail and suggestion one or two sentences each.`;

const Tone = z.enum(["warning", "positive", "neutral"]);

const ResponseSchema = z.object({
  summary: z.string().min(1).max(300),
  insights: z
    .array(
      z.object({
        tone: Tone,
        title: z.string().min(1).max(120),
        detail: z.string().min(1).max(600),
        suggestion: z.string().max(400),
        evidence: z.array(z.string()),
      }),
    )
    .min(1),
});

/** The evidence field only accepts refs that exist, so the model can't cite anything else. */
function jsonSchema(refs: string[]) {
  return {
  type: "object",
  additionalProperties: false,
  required: ["summary", "insights"],
  properties: {
    summary: { type: "string", description: "One sentence on where this person's time goes." },
    insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tone", "title", "detail", "suggestion", "evidence"],
        properties: {
          tone: { type: "string", enum: ["warning", "positive", "neutral"] },
          title: { type: "string" },
          detail: { type: "string" },
          suggestion: { type: "string" },
          evidence: {
            type: "array",
            description: "1 to 4 refs (like g3) of the events this insight is based on",
            items: { type: "string", enum: refs },
          },
        },
      },
    },
  },
  };
}

export type RawInsight = z.infer<typeof ResponseSchema>["insights"][number];

export interface InterpretResult {
  summary: string;
  insights: RawInsight[];
  /** Insights dropped because none of their evidence refs existed. */
  droppedInsights: number;
  /** The exact data the model saw, so numbers in its answer can be checked against it. */
  promptData: unknown;
  call: JsonCompletion;
}

export async function interpret(
  llm: LlmClient,
  aggregates: Aggregates,
  groups: EventGroup[],
  categoryByRef: Map<string, Category>,
  context: { periodDays: number; timeZone: string },
): Promise<InterpretResult> {
  const evidenceGroups = groups.slice(0, MAX_GROUPS_FOR_EVIDENCE).map((g) => ({
    ref: g.ref,
    title: g.title,
    category: categoryByRef.get(g.ref) ?? "other",
    occurrences: g.occurrences,
    totalHours: Math.round((g.totalMinutes / 60) * 10) / 10,
    weekdays: g.weekdays,
    typicalStartHour: g.typicalStartHour,
    recurring: g.recurring,
  }));

  const promptData = {
    periodDays: context.periodDays,
    timeZone: context.timeZone,
    totalHours: aggregates.totalHours,
    byCategory: aggregates.byCategory.map(({ label, hours, sharePercent, events, recurringHours, category }) => ({
      category,
      label,
      hours,
      sharePercent,
      events,
      recurringHours,
    })),
    hoursByWeekdayAndCategory: aggregates.byWeekday,
    patterns: aggregates.patterns,
    events: evidenceGroups,
  };

  const call = await llm.completeJson({
    step: "interpret_calendar",
    system: SYSTEM,
    user: JSON.stringify(promptData),
    schema: jsonSchema(evidenceGroups.map((g) => g.ref)),
    maxOutputTokens: 6000,
  });

  const parsed = ResponseSchema.parse(call.data);
  parsed.summary = stripRefs(parsed.summary);
  for (const i of parsed.insights) {
    i.title = stripRefs(i.title);
    i.detail = stripRefs(i.detail);
    i.suggestion = stripRefs(i.suggestion);
  }
  const known = new Set(evidenceGroups.map((g) => g.ref));
  const kept: RawInsight[] = [];
  let dropped = 0;
  for (const insight of parsed.insights) {
    const evidence = [...new Set(insight.evidence.filter((ref) => known.has(ref)))].slice(0, 4);
    // An insight we can't tie to real events might be made up, so we don't show it.
    if (evidence.length === 0) {
      dropped += 1;
      continue;
    }
    kept.push({ ...insight, evidence });
  }

  return { summary: parsed.summary, insights: kept.slice(0, 4), droppedInsights: dropped, promptData, call };
}

/** Removes internal refs ("g3", "(g1, g12)", "(g15 + g4)") if the model writes them anyway. */
export function stripRefs(text: string): string {
  return text
    .replace(/\s*\((?:\s*g\d+\s*(?:,|\+|&|and)?)+\s*\)/g, "")
    .replace(/\s*\bg\d+\b/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
