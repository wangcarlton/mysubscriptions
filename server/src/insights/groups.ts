import type { CalendarEvent } from "../connectors/types.js";
import { localParts } from "./time.js";

/**
 * Recurring meetings repeat the same title many times. We group events by title so the
 * model classifies each kind of event once (fewer tokens, consistent labels), and we give
 * each group a short reference ("g1") instead of Google's event IDs.
 */
export interface EventGroup {
  ref: string;
  title: string;
  eventIds: string[];
  occurrences: number;
  totalMinutes: number;
  typicalMinutes: number;
  typicalAttendees: number;
  recurring: boolean;
  organisedBySelf: boolean;
  weekdays: string[];
  typicalStartHour: number;
}

export const MAX_TITLE_LENGTH = 80;

export function normaliseTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function groupEvents(events: CalendarEvent[], timeZone: string): EventGroup[] {
  const byTitle = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (e.allDay) continue; // all-day events (holidays, birthdays) don't use time
    const key = normaliseTitle(e.title) || "(untitled)";
    const list = byTitle.get(key) ?? [];
    list.push(e);
    byTitle.set(key, list);
  }

  const groups = [...byTitle.values()].map((list) => {
    const locals = list.map((e) => localParts(new Date(e.start), timeZone));
    const weekdays = [...new Set(locals.map((l) => l.weekday))];
    return {
      ref: "",
      title: (list[0]!.title.trim() || "(untitled)").slice(0, MAX_TITLE_LENGTH),
      eventIds: list.map((e) => e.id),
      occurrences: list.length,
      totalMinutes: list.reduce((s, e) => s + e.durationMinutes, 0),
      typicalMinutes: median(list.map((e) => e.durationMinutes)),
      typicalAttendees: median(list.map((e) => e.attendeeCount)),
      recurring: list.some((e) => e.isRecurring),
      organisedBySelf: list.filter((e) => e.organisedBySelf).length * 2 >= list.length,
      weekdays,
      typicalStartHour: Math.floor(median(locals.map((l) => l.minutesOfDay)) / 60),
    };
  });

  // Biggest time sinks first, so if we ever have to truncate, we drop the least important.
  groups.sort((a, b) => b.totalMinutes - a.totalMinutes || a.title.localeCompare(b.title));
  groups.forEach((g, i) => (g.ref = `g${i + 1}`));
  return groups;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}
