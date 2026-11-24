import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleEvents } from "../demo/sampleEvents.js";
import { aggregate, longestBackToBackRun } from "./aggregate.js";
import { classifyGroups } from "./classify.js";
import { groupEvents } from "./groups.js";
import { stripRefs } from "./interpret.js";
import { UsageLimiter } from "./limits.js";
import { generateInsights } from "./service.js";
import { event, FakeLlm } from "./testing.js";
import { localParts, zonedTime } from "./time.js";
import { collectNumbers, unsupportedNumbers } from "./verify.js";

const TZ = "Australia/Sydney";

describe("groupEvents", () => {
  it("groups repeated titles, ignores all-day events and uses short refs", () => {
    const groups = groupEvents(
      [
        event({ title: "Stand-up", start: "2026-11-02T22:00:00Z", durationMinutes: 15 }),
        event({ title: "stand-up ", start: "2026-11-03T22:00:00Z", durationMinutes: 15 }),
        event({ title: "Focus", start: "2026-11-03T02:00:00Z", durationMinutes: 120, attendeeCount: 1 }),
        event({ title: "Public holiday", start: "2026-11-04T00:00:00Z", allDay: true }),
      ],
      TZ,
    );
    assert.deepEqual(
      groups.map((g) => [g.ref, g.title, g.occurrences]),
      [
        ["g1", "Focus", 1],
        ["g2", "Stand-up", 2],
      ],
    );
  });
});

describe("classifyGroups", () => {
  it("defaults skipped refs to 'other' and ignores refs the model invented", async () => {
    const groups = groupEvents(
      [event({ title: "A", start: "2026-11-02T00:00:00Z" }), event({ title: "B", start: "2026-11-02T02:00:00Z" })],
      TZ,
    );
    const llm = new FakeLlm(() => ({ items: [{ ref: "g1", category: "deep_work" }, { ref: "g99", category: "admin" }] }));
    const result = await classifyGroups(llm, groups);
    assert.equal(result.categoryByRef.get("g1"), "deep_work");
    assert.equal(result.categoryByRef.get("g2"), "other");
    assert.deepEqual(result.missingRefs, ["g2"]);
    assert.deepEqual(result.unknownRefs, ["g99"]);
  });

  it("sends only minimal fields to the model", async () => {
    const groups = groupEvents([event({ id: "google-secret-id", title: "Board prep", start: "2026-11-02T00:00:00Z" })], TZ);
    const llm = new FakeLlm(() => ({ items: [] }));
    await classifyGroups(llm, groups);
    const sent = llm.requests[0]!.user;
    assert.ok(sent.includes("Board prep"));
    assert.ok(!sent.includes("google-secret-id"), "event IDs must not be sent");
  });
});

describe("aggregate", () => {
  it("computes category shares, back-to-back runs and out-of-hours work", () => {
    // Monday 2 Nov 2026 in Sydney (UTC+11): 9:00, 10:00, 11:00 back-to-back, then 19:00 call.
    const at = (h: number) => zonedTime(2026, 11, 2, h, 0, TZ).toISOString();
    const events = [
      event({ id: "m1", start: at(9) }),
      event({ id: "m2", start: at(10) }),
      event({ id: "m3", start: at(11) }),
      event({ id: "f1", start: at(13), durationMinutes: 120, attendeeCount: 1 }),
      event({ id: "late", start: at(19) }),
    ];
    const cat = (id: string) => (id === "f1" ? "deep_work" : "team_meeting");
    const result = aggregate(events, (e) => cat(e.id), TZ, 7);

    assert.equal(result.totalHours, 6);
    assert.deepEqual(
      result.byCategory.map((c) => [c.category, c.hours, c.sharePercent]),
      [
        ["team_meeting", 4, 67],
        ["deep_work", 2, 33],
      ],
    );
    assert.equal(result.patterns.backToBackDays, 1);
    assert.equal(result.patterns.longestBackToBackRun, 3);
    assert.equal(result.patterns.outOfHoursWorkHours, 1);
    assert.equal(result.patterns.longFocusBlocks, 1);
    assert.equal(result.byWeekday.Monday?.team_meeting, 4);
  });

  it("does not count meetings with a gap as back-to-back", () => {
    const run = longestBackToBackRun([
      event({ start: "2026-11-02T00:00:00Z" }),
      event({ start: "2026-11-02T01:30:00Z" }),
    ]);
    assert.equal(run, 1);
  });
});

describe("number check", () => {
  it("flags numbers the model made up", () => {
    const allowed = collectNumbers({ hours: 12.5, sharePercent: 38, events: [{ occurrences: 4 }] });
    assert.deepEqual(unsupportedNumbers("38% of your time, 12.5 hours over 4 retros", allowed), []);
    assert.deepEqual(unsupportedNumbers("about 45% of meetings", allowed), [45]);
  });
});

describe("UsageLimiter", () => {
  it("limits per session per hour and per day", () => {
    let now = Date.parse("2026-11-24T00:00:00Z");
    const limiter = new UsageLimiter(2, 3, () => now);
    let history: number[] = [];
    for (let i = 0; i < 2; i++) ({ history } = limiter.tryUse(history));
    assert.equal(limiter.tryUse(history).blocked, "session_limit");
    now += 61 * 60 * 1000;
    ({ history } = limiter.tryUse(history));
    assert.equal(limiter.tryUse([]).blocked, "daily_limit");
  });
});

describe("generateInsights", () => {
  it("runs classify then interpret, drops uncited insights and records cost", async () => {
    const events = sampleEvents(new Date("2026-11-24T06:00:00Z"), TZ);
    const llm = new FakeLlm((req) => {
      if (req.step === "classify_events") {
        const input = JSON.parse(req.user) as { events: { ref: string; title: string }[] };
        return {
          items: input.events.map((e) => ({
            ref: e.ref,
            category: /focus|review blitz/i.test(e.title) ? "deep_work" : /gym|dentist|school/i.test(e.title) ? "personal" : "team_meeting",
          })),
        };
      }
      return {
        summary: "Most of your time is in team meetings.",
        insights: [
          { tone: "warning", title: "Fridays are wall-to-wall", detail: "Friday is your heaviest day.", suggestion: "Move Arch review.", evidence: ["g1", "g2"] },
          { tone: "neutral", title: "Uncited", detail: "No evidence.", suggestion: "", evidence: ["g999"] },
        ],
      };
    });

    const logs: Record<string, unknown>[] = [];
    const progress: string[] = [];
    const result = await generateInsights({
      onProgress: (e) => progress.push(e.type === "stage" ? e.stage : e.type),
      events,
      timeZone: TZ,
      periodDays: 28,
      llm,
      pricing: { inputUsdPerMillion: 0.25, outputUsdPerMillion: 2 },
      log: (e) => logs.push(e),
    });

    assert.deepEqual(llm.requests.map((r) => r.step), ["classify_events", "interpret_calendar"]);
    // The breakdown is sent after classification and before the second model call.
    assert.deepEqual(progress, ["classifying", "categories", "interpreting"]);
    assert.equal(result.insights.length, 1);
    assert.equal(result.trace.checks.insightsDropped, 1);
    assert.equal(result.insights[0]!.evidence.length, 2);
    assert.ok(result.categories.some((c) => c.category === "deep_work"));
    assert.equal(Object.keys(result.eventCategories).length, events.length);
    // 2 calls × (1000 input × $0.25 + 200 output × $2) / 1M
    assert.equal(result.trace.costUsd, 0.0013);
    assert.equal(logs.length, 2);
    assert.ok(!JSON.stringify(logs).includes("Arch review"), "logs must not contain calendar content");
  });
});

describe("sampleEvents", () => {
  it("places demo events at local times in the viewer's time zone", () => {
    const events = sampleEvents(new Date("2026-11-24T06:00:00Z"), TZ);
    const standUp = events.find((e) => e.title === "Team stand-up")!;
    assert.equal(localParts(new Date(standUp.start), TZ).minutesOfDay, 9 * 60);
    assert.ok(events.every((e) => Date.parse(e.end) <= Date.parse("2026-11-24T06:00:00Z")));
  });
});

describe("stripRefs", () => {
  it("removes internal refs the model leaks into user-facing text", () => {
    assert.equal(stripRefs("Deep work is on Tuesdays (g1, g12) and Wednesdays."), "Deep work is on Tuesdays and Wednesdays.");
    assert.equal(stripRefs("Move the Arch review (g3) to Tuesday."), "Move the Arch review to Tuesday.");
    assert.equal(stripRefs("Combine them (g15 + g4)."), "Combine them.");
    assert.equal(stripRefs("Two 1:1s and a 90-minute block"), "Two 1:1s and a 90-minute block");
  });
});
