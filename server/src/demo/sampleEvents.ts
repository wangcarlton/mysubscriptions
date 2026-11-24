import type { CalendarEvent } from "../connectors/types.js";
import { localParts, zonedTime } from "../insights/time.js";

/**
 * Four weeks of realistic sample events, generated relative to "now" in the viewer's time
 * zone, so the demo always shows recent data at sensible local times. Titles are as messy as
 * real calendars ("sync w/ design", "PR review blitz"), which is what makes the AI step useful.
 * All names and companies are made up.
 */
interface Template {
  title: string;
  weekdays: number[]; // 1 = Monday
  hour: number;
  minute?: number;
  minutes: number;
  attendees: number;
  recurring: boolean;
  /** For one-off events: show in roughly this share of weeks. */
  frequency?: number;
}

const TEMPLATES: Template[] = [
  { title: "Team stand-up", weekdays: [1, 2, 3, 4, 5], hour: 9, minutes: 15, attendees: 7, recurring: true },
  { title: "Sprint planning", weekdays: [1], hour: 9, minute: 15, minutes: 90, attendees: 8, recurring: true },
  { title: "Backlog grooming", weekdays: [1], hour: 10, minute: 45, minutes: 60, attendees: 6, recurring: true },
  { title: "1:1 w/ Sam (manager)", weekdays: [2], hour: 11, minutes: 30, attendees: 2, recurring: true },
  { title: "Catch-up – Priya", weekdays: [4], hour: 16, minutes: 30, attendees: 2, recurring: true },
  { title: "Focus: billing service rewrite", weekdays: [2, 3], hour: 13, minutes: 120, attendees: 1, recurring: true },
  { title: "PR review blitz", weekdays: [3], hour: 16, minutes: 45, attendees: 1, recurring: false, frequency: 0.75 },
  { title: "Northwind onboarding call", weekdays: [3], hour: 10, minutes: 60, attendees: 5, recurring: false, frequency: 0.5 },
  { title: "Acme QBR prep", weekdays: [4], hour: 9, minute: 30, minutes: 60, attendees: 3, recurring: false, frequency: 0.5 },
  { title: "US partner sync (Contoso)", weekdays: [4], hour: 19, minutes: 45, attendees: 4, recurring: true },
  { title: "Interview – Senior FE", weekdays: [3], hour: 15, minutes: 60, attendees: 3, recurring: false, frequency: 0.75 },
  { title: "Hiring debrief", weekdays: [4], hour: 12, minutes: 30, attendees: 4, recurring: false, frequency: 0.5 },
  { title: "Arch review", weekdays: [5], hour: 10, minutes: 90, attendees: 6, recurring: true },
  { title: "Demo prep", weekdays: [5], hour: 11, minute: 30, minutes: 30, attendees: 3, recurring: true },
  { title: "Sprint demo + retro", weekdays: [5], hour: 12, minutes: 90, attendees: 9, recurring: true },
  { title: "Incident review", weekdays: [5], hour: 13, minute: 30, minutes: 45, attendees: 5, recurring: false, frequency: 0.5 },
  { title: "Expenses + timesheets", weekdays: [5], hour: 16, minutes: 30, attendees: 1, recurring: true },
  { title: "Lunch & learn: Postgres indexing", weekdays: [3], hour: 12, minutes: 60, attendees: 20, recurring: false, frequency: 0.25 },
  { title: "Gym", weekdays: [1, 3, 5], hour: 7, minutes: 60, attendees: 1, recurring: true },
  { title: "School pickup", weekdays: [2, 4], hour: 15, minutes: 30, attendees: 1, recurring: true },
  { title: "Dentist", weekdays: [2], hour: 8, minutes: 45, attendees: 1, recurring: false, frequency: 0.25 },
];

export function sampleEvents(now = new Date(), timeZone = "UTC", weeks = 4): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const today = localParts(now, timeZone).date;
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];

  for (let offset = weeks * 7; offset >= 0; offset--) {
    const day = new Date(Date.UTC(y, m - 1, d - offset));
    const weekday = day.getUTCDay();
    const weekIndex = Math.floor(offset / 7);
    TEMPLATES.forEach((t, i) => {
      if (!t.weekdays.includes(weekday)) return;
      // One-off events appear in some weeks only, chosen deterministically so the demo is stable.
      if (t.frequency !== undefined && ((weekIndex * 7 + i * 3) % 4) / 4 >= t.frequency) return;
      const start = zonedTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), t.hour, t.minute ?? 0, timeZone);
      const end = new Date(start.getTime() + t.minutes * 60_000);
      if (end > now) return;
      events.push({
        id: `demo-${start.getTime()}-${i}`,
        title: t.title,
        start: start.toISOString(),
        end: end.toISOString(),
        durationMinutes: t.minutes,
        allDay: false,
        attendeeCount: t.attendees,
        isRecurring: t.recurring,
        organisedBySelf: t.attendees <= 1,
      });
    });
  }
  return events.sort((a, b) => a.start.localeCompare(b.start));
}
