import type { CalendarEvent } from "../connectors/types.js";

/**
 * Deterministic numbers computed in code. The LLM interprets these; it never
 * calculates them, so totals in the UI are always exact.
 */
export interface CalendarStats {
  eventCount: number;
  timedEventCount: number;
  totalMeetingHours: number;
  averageMeetingMinutes: number;
  recurringShare: number; // 0..1
  soloEventCount: number; // timed events with no other attendees
  busiestWeekday: string | null;
  hoursByWeekday: Record<string, number>;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function computeStats(events: CalendarEvent[], timeZone = "UTC"): CalendarStats {
  const timed = events.filter((e) => !e.allDay);
  const totalMinutes = timed.reduce((sum, e) => sum + e.durationMinutes, 0);

  const hoursByWeekday: Record<string, number> = Object.fromEntries(WEEKDAYS.map((d) => [d, 0]));
  const weekdayOf = new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone });
  for (const e of timed) {
    const day = weekdayOf.format(new Date(e.start));
    hoursByWeekday[day] = round1((hoursByWeekday[day] ?? 0) + e.durationMinutes / 60);
  }
  const busiest = Object.entries(hoursByWeekday).sort((a, b) => b[1] - a[1])[0];

  return {
    eventCount: events.length,
    timedEventCount: timed.length,
    totalMeetingHours: round1(totalMinutes / 60),
    averageMeetingMinutes: timed.length ? Math.round(totalMinutes / timed.length) : 0,
    recurringShare: events.length ? round2(events.filter((e) => e.isRecurring).length / events.length) : 0,
    soloEventCount: timed.filter((e) => e.attendeeCount <= 1).length,
    busiestWeekday: busiest && busiest[1] > 0 ? busiest[0] : null,
    hoursByWeekday,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
