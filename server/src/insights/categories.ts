/** The categories the AI may assign. A fixed list keeps the output comparable and chartable. */
export const CATEGORIES = [
  "deep_work",
  "team_meeting",
  "one_on_one",
  "external",
  "hiring",
  "admin",
  "learning",
  "personal",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  deep_work: "Deep work",
  team_meeting: "Team meetings",
  one_on_one: "1:1s",
  external: "Customers & partners",
  hiring: "Hiring",
  admin: "Admin",
  learning: "Learning",
  personal: "Personal",
  other: "Other",
};

/** Categories that count as meetings when we look for back-to-back runs. */
export const MEETING_CATEGORIES: ReadonlySet<Category> = new Set(["team_meeting", "one_on_one", "external", "hiring"]);
