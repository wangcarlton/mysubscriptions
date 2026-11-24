// Mirrors the server's response shapes.
export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface Me {
  user: User | null;
  demo?: boolean;
  connections?: { googleCalendar: boolean };
  aiEnabled?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  durationMinutes: number;
  allDay: boolean;
  attendeeCount: number;
  isRecurring: boolean;
  organisedBySelf: boolean;
}

export interface CalendarStats {
  eventCount: number;
  timedEventCount: number;
  totalMeetingHours: number;
  averageMeetingMinutes: number;
  recurringShare: number;
  soloEventCount: number;
  busiestWeekday: string | null;
  hoursByWeekday: Record<string, number>;
}

export interface EventsResponse {
  events: CalendarEvent[];
  stats: CalendarStats;
  source: "google" | "demo";
}

export type Category =
  | "deep_work"
  | "team_meeting"
  | "one_on_one"
  | "external"
  | "hiring"
  | "admin"
  | "learning"
  | "personal"
  | "other";

export interface CategoryTotal {
  category: Category;
  label: string;
  hours: number;
  sharePercent: number;
  events: number;
  recurringHours: number;
}

export interface Insight {
  tone: "warning" | "positive" | "neutral";
  title: string;
  detail: string;
  suggestion: string;
  evidence: { ref: string; title: string; occurrences: number; category: Category }[];
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

export interface InsightsResponse {
  generatedAt: string;
  summary: string;
  insights: Insight[];
  categories: CategoryTotal[];
  patterns: {
    weeks: number;
    meetingHoursPerWeek: number;
    deepWorkHoursPerWeek: number;
    backToBackDays: number;
    longestBackToBackRun: number;
    outOfHoursWorkHours: number;
    longFocusBlocks: number;
  };
  eventCategories: Record<string, Category>;
  cached: boolean;
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

/** Events on the insights stream, one JSON object per line. */
export type InsightsStreamEvent =
  | { type: "stage"; stage: "classifying" | "interpreting"; kindsOfEvent: number }
  | {
      type: "categories";
      categories: CategoryTotal[];
      patterns: InsightsResponse["patterns"];
      eventCategories: Record<string, Category>;
    }
  | { type: "result"; result: InsightsResponse }
  | { type: "error"; error: string };
