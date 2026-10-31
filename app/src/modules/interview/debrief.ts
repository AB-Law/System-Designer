import { DEFAULT_STYLE } from "./format";
import { CATEGORY_LABELS, type Category, type Feedback, type Style } from "./types";

/** The categories that were marked, with their scores, weakest first. */
export function rankedCategories(summary: Feedback["summary"]): { id: Category; label: string; score: number }[] {
  return (Object.keys(summary.byCategory) as Category[])
    .filter((c) => summary.byCategory[c] !== undefined)
    .map((c) => ({ id: c, label: CATEGORY_LABELS[c], score: summary.byCategory[c] ?? 0 }))
    .sort((a, b) => a.score - b.score);
}

/** One plain sentence about how it went: the best and weakest areas, or just the one that was marked. */
export function headline(summary: Feedback["summary"]): string {
  const ranked = rankedCategories(summary);
  if (summary.score === null || ranked.length === 0) return "There was not enough to mark.";
  if (ranked.length === 1) return `Only ${ranked[0].label.toLowerCase()} was marked, at ${ranked[0].score}.`;
  const weak = ranked[0];
  const strong = ranked[ranked.length - 1];
  if (weak.score === strong.score) return `Every area came out level, at ${weak.score}.`;
  return `Strongest: ${strong.label.toLowerCase()}, ${strong.score}. Weakest: ${weak.label.toLowerCase()}, ${weak.score}.`;
}

export const SCORE_WORD = (score: number): string => (score >= 75 ? "Strong" : score >= 50 ? "Fair" : "Needs work");

const FOCUS_QUESTIONS = 4;

/** A short round on one area: the same tone and CV choice as before, a quarter of an hour, and every question from that category. */
export function focusStyle(previous: Style | undefined, category: Category): Style {
  const base = previous ?? DEFAULT_STYLE;
  return { ...base, durationMin: 15, categories: [], counts: { [category]: FOCUS_QUESTIONS }, showPlan: false };
}
