/** Small time-zone helpers built on Intl, so we need no date library. */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface LocalParts {
  date: string; // YYYY-MM-DD in the user's time zone
  weekday: string; // e.g. "Monday"
  minutesOfDay: number; // 0..1439
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "long",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday ?? WEEKDAYS[instant.getUTCDay()]!,
    minutesOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** The UTC instant for a wall-clock time in a time zone (used to place demo events). */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const p = localParts(new Date(guess), timeZone);
  const [y, m, d] = p.date.split("-").map(Number) as [number, number, number];
  const shownAsUtc = Date.UTC(y, m - 1, d, Math.floor(p.minutesOfDay / 60), p.minutesOfDay % 60);
  return new Date(guess - (shownAsUtc - guess));
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export { WEEKDAYS };
