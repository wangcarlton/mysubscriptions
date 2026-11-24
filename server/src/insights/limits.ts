/**
 * Protects the OpenAI bill: a per-session limit (stops one user hammering "regenerate") and a
 * global daily cap (stops a public demo link from running up costs). In memory, like sessions.
 */
export class UsageLimiter {
  private dayKey = "";
  private usedToday = 0;

  constructor(
    private readonly perSessionPerHour: number,
    private readonly perDay: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns null if allowed (and records the use), or the reason it isn't. */
  tryUse(sessionHistory: number[]): { history: number[]; blocked: null | "session_limit" | "daily_limit" } {
    const now = this.now();
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== this.dayKey) {
      this.dayKey = today;
      this.usedToday = 0;
    }
    const recent = sessionHistory.filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= this.perSessionPerHour) return { history: recent, blocked: "session_limit" };
    if (this.usedToday >= this.perDay) return { history: recent, blocked: "daily_limit" };
    this.usedToday += 1;
    return { history: [...recent, now], blocked: null };
  }
}
