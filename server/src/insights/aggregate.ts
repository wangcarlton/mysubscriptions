import type { CalendarEvent } from "../connectors/types.js";
import { CATEGORIES, CATEGORY_LABELS, MEETING_CATEGORIES, type Category } from "./categories.js";
import { localParts, WEEKDAYS } from "./time.js";

/**
 * Numbers about the categorised calendar, computed in code. The model interprets
 * these; it never does arithmetic, so every figure it quotes can be checked.
 */
export interface CategoryTotal {
  category: Category;
  label: string;
  hours: number;
  sharePercent: number;
  events: number;
  recurringHours: number;
}

export interface Patterns {
  weeks: number;
  meetingHoursPerWeek: number;
  deepWorkHoursPerWeek: number;
  /** Days with a run of 3+ meetings with 5 minutes or less between them. */
  backToBackDays: number;
  longestBackToBackRun: number;
  /** Work (non-personal) hours that start before 8:00 or end after 18:00 local time. */
  outOfHoursWorkHours: number;
  /** Deep-work blocks of 90 minutes or more. */
  longFocusBlocks: number;
  busiestDay: { date: string; weekday: string; hours: number } | null;
}

export interface Aggregates {
  totalHours: number;
  byCategory: CategoryTotal[];
  byWeekday: Record<string, Partial<Record<Category, number>>>;
  patterns: Patterns;
}

export function aggregate(
  events: CalendarEvent[],
  categoryOf: (e: CalendarEvent) => Category,
  timeZone: string,
  periodDays: number,
): Aggregates {
  const timed = events.filter((e) => !e.allDay);
  const totalMinutes = timed.reduce((s, e) => s + e.durationMinutes, 0);

  const minutesByCat = new Map<Category, { minutes: number; events: number; recurring: number }>();
  const byWeekday: Record<string, Partial<Record<Category, number>>> = Object.fromEntries(WEEKDAYS.map((d) => [d, {}]));
  const minutesByDate = new Map<string, { weekday: string; minutes: number }>();
  const meetingsByDate = new Map<string, CalendarEvent[]>();
  let outOfHoursMinutes = 0;
  let longFocusBlocks = 0;

  for (const e of timed) {
    const cat = categoryOf(e);
    const c = minutesByCat.get(cat) ?? { minutes: 0, events: 0, recurring: 0 };
    c.minutes += e.durationMinutes;
    c.events += 1;
    if (e.isRecurring) c.recurring += e.durationMinutes;
    minutesByCat.set(cat, c);

    const start = localParts(new Date(e.start), timeZone);
    const day = byWeekday[start.weekday]!;
    day[cat] = round1((day[cat] ?? 0) + e.durationMinutes / 60);

    const d = minutesByDate.get(start.date) ?? { weekday: start.weekday, minutes: 0 };
    d.minutes += e.durationMinutes;
    minutesByDate.set(start.date, d);

    if (MEETING_CATEGORIES.has(cat)) {
      const list = meetingsByDate.get(start.date) ?? [];
      list.push(e);
      meetingsByDate.set(start.date, list);
    }
    if (cat !== "personal") {
      const endMinutes = start.minutesOfDay + e.durationMinutes;
      const early = Math.max(0, Math.min(8 * 60, endMinutes) - start.minutesOfDay);
      const late = Math.max(0, endMinutes - Math.max(18 * 60, start.minutesOfDay));
      outOfHoursMinutes += early + late;
    }
    if (cat === "deep_work" && e.durationMinutes >= 90) longFocusBlocks += 1;
  }

  let backToBackDays = 0;
  let longestRun = 0;
  for (const list of meetingsByDate.values()) {
    const run = longestBackToBackRun(list);
    if (run >= 3) backToBackDays += 1;
    longestRun = Math.max(longestRun, run);
  }

  const busiest = [...minutesByDate.entries()].sort((a, b) => b[1].minutes - a[1].minutes)[0];
  const weeks = Math.max(1, round1(periodDays / 7));
  const meetingMinutes = [...minutesByCat.entries()]
    .filter(([cat]) => MEETING_CATEGORIES.has(cat))
    .reduce((s, [, v]) => s + v.minutes, 0);

  const byCategory = CATEGORIES.filter((cat) => minutesByCat.has(cat))
    .map((cat) => {
      const c = minutesByCat.get(cat)!;
      return {
        category: cat,
        label: CATEGORY_LABELS[cat],
        hours: round1(c.minutes / 60),
        sharePercent: totalMinutes ? Math.round((c.minutes / totalMinutes) * 100) : 0,
        events: c.events,
        recurringHours: round1(c.recurring / 60),
      };
    })
    .sort((a, b) => b.hours - a.hours);

  return {
    totalHours: round1(totalMinutes / 60),
    byCategory,
    byWeekday,
    patterns: {
      weeks,
      meetingHoursPerWeek: round1(meetingMinutes / 60 / weeks),
      deepWorkHoursPerWeek: round1((minutesByCat.get("deep_work")?.minutes ?? 0) / 60 / weeks),
      backToBackDays,
      longestBackToBackRun: longestRun,
      outOfHoursWorkHours: round1(outOfHoursMinutes / 60),
      longFocusBlocks,
      busiestDay: busiest ? { date: busiest[0], weekday: busiest[1].weekday, hours: round1(busiest[1].minutes / 60) } : null,
    },
  };
}

/** Longest chain of meetings where each starts within 5 minutes of the previous one ending. */
export function longestBackToBackRun(meetings: CalendarEvent[]): number {
  const sorted = [...meetings].sort((a, b) => a.start.localeCompare(b.start));
  let best = 0;
  let run = 0;
  let prevEnd = -Infinity;
  for (const m of sorted) {
    const start = Date.parse(m.start);
    run = start - prevEnd <= 5 * 60_000 && start >= prevEnd - 60 * 60_000 ? run + 1 : 1;
    prevEnd = Math.max(Date.parse(m.end), start);
    best = Math.max(best, run);
  }
  return best;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
