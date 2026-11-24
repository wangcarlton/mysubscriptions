/**
 * A cheap, automatic check on every answer: does each number the model wrote appear in the
 * data it was given? The prompt forbids new arithmetic; this tells us (and the user) when the
 * model did it anyway. It's a heuristic, not proof: a number can match by coincidence.
 */
export function numbersIn(text: string): number[] {
  const matches = text.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? [];
  return matches.map(Number);
}

export function collectNumbers(data: unknown, into = new Set<number>()): Set<number> {
  if (typeof data === "number") {
    into.add(data);
    into.add(Math.round(data));
  } else if (typeof data === "string") {
    for (const n of numbersIn(data)) into.add(n);
  } else if (Array.isArray(data)) {
    into.add(data.length);
    for (const item of data) collectNumbers(item, into);
  } else if (data && typeof data === "object") {
    for (const value of Object.values(data)) collectNumbers(value, into);
  }
  return into;
}

/** Numbers that are always fine to use in prose ("1:1", "3 insights", "one of 2 days"). */
const ALWAYS_OK = new Set([0, 1, 2, 3, 4, 5, 7, 24, 100]);

export function unsupportedNumbers(text: string, allowed: Set<number>): number[] {
  return numbersIn(text).filter((n) => !ALWAYS_OK.has(n) && !allowed.has(n));
}
