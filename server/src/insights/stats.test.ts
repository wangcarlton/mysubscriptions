import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalendarEvent } from "../connectors/types.js";
import { computeStats } from "./stats.js";

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: "1",
  title: "Meeting",
  start: "2026-11-16T09:00:00Z", // a Monday
  end: "2026-11-16T10:00:00Z",
  durationMinutes: 60,
  allDay: false,
  attendeeCount: 3,
  isRecurring: false,
  organisedBySelf: false,
  ...overrides,
});

test("totals exclude all-day events", () => {
  const stats = computeStats([event({}), event({ id: "2", allDay: true, durationMinutes: 1440 })]);
  assert.equal(stats.totalMeetingHours, 1);
  assert.equal(stats.timedEventCount, 1);
  assert.equal(stats.eventCount, 2);
});

test("busiest weekday and solo events", () => {
  const stats = computeStats([
    event({}),
    event({ id: "2", attendeeCount: 0 }),
    event({ id: "3", start: "2026-11-18T09:00:00Z", end: "2026-11-18T09:30:00Z", durationMinutes: 30 }),
  ]);
  assert.equal(stats.busiestWeekday, "Monday");
  assert.equal(stats.soloEventCount, 1);
});

test("empty calendar", () => {
  const stats = computeStats([]);
  assert.equal(stats.busiestWeekday, null);
  assert.equal(stats.averageMeetingMinutes, 0);
});
