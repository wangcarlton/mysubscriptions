import { z } from "zod";
import { CATEGORIES, type Category } from "./categories.js";
import type { EventGroup } from "./groups.js";
import type { JsonCompletion, LlmClient } from "./llm.js";

/** At most this many kinds of event go to the model; the long tail is "other". */
export const MAX_GROUPS_TO_CLASSIFY = 150;

const SYSTEM = `You classify calendar events by what the time is spent on.
Categories:
- deep_work: focused solo work blocks (e.g. "Focus", "Heads-down", "Write spec", "PR review" alone)
- team_meeting: internal meetings with several colleagues (stand-ups, planning, reviews, all-hands)
- one_on_one: meetings between two people, e.g. "1:1", "catch-up with X"
- external: customers, clients, partners, vendors, sales or support calls
- hiring: interviews, debriefs, recruiting
- admin: expenses, email, planning your own week, paperwork
- learning: training, courses, talks, lunch-and-learns, reading
- personal: health, family, errands, exercise, social life
- other: anything that fits none of the above or is unclear
Use the title first; use attendees, duration, recurrence and time of day as hints
(e.g. 0 attendees and 2 hours is more likely deep work than a meeting).
Return one item for every ref you are given, and only those refs.`;

const ResponseSchema = z.object({
  items: z.array(z.object({ ref: z.string(), category: z.enum(CATEGORIES) })),
});

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "category"],
        properties: { ref: { type: "string" }, category: { type: "string", enum: [...CATEGORIES] } },
      },
    },
  },
};

export interface ClassifyResult {
  categoryByRef: Map<string, Category>;
  /** Refs the model skipped or invented, for the trace. */
  missingRefs: string[];
  unknownRefs: string[];
  call: JsonCompletion | null;
}

export async function classifyGroups(llm: LlmClient, groups: EventGroup[]): Promise<ClassifyResult> {
  const categoryByRef = new Map<string, Category>();
  const toClassify = groups.slice(0, MAX_GROUPS_TO_CLASSIFY);
  for (const g of groups.slice(MAX_GROUPS_TO_CLASSIFY)) categoryByRef.set(g.ref, "other");
  if (toClassify.length === 0) return { categoryByRef, missingRefs: [], unknownRefs: [], call: null };

  // Only what the model needs. No IDs, descriptions, locations or attendee emails.
  const input = toClassify.map((g) => ({
    ref: g.ref,
    title: g.title,
    occurrences: g.occurrences,
    typicalMinutes: g.typicalMinutes,
    typicalAttendees: g.typicalAttendees,
    recurring: g.recurring,
    organisedBySelf: g.organisedBySelf,
    typicalStartHour: g.typicalStartHour,
  }));

  const call = await llm.completeJson({
    step: "classify_events",
    system: SYSTEM,
    user: JSON.stringify({ events: input }),
    schema: JSON_SCHEMA,
    maxOutputTokens: 6000,
    reasoningEffort: "minimal", // a labelling task; thinking longer adds latency, not accuracy
  });

  const parsed = ResponseSchema.parse(call.data);
  const known = new Set(toClassify.map((g) => g.ref));
  const unknownRefs: string[] = [];
  for (const item of parsed.items) {
    if (known.has(item.ref)) categoryByRef.set(item.ref, item.category);
    else unknownRefs.push(item.ref);
  }
  const missingRefs = toClassify.filter((g) => !categoryByRef.has(g.ref)).map((g) => g.ref);
  for (const ref of missingRefs) categoryByRef.set(ref, "other");

  return { categoryByRef, missingRefs, unknownRefs, call };
}
