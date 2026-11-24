import type { Category } from "./types";

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

/** Colours come from CSS variables so they adapt to light and dark mode. */
export const categoryColor = (c: Category) => `var(--cat-${c.replace("_", "-")})`;
