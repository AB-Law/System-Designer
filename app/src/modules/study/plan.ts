import type { StudyStats } from "./types";

const DAY_MS = 86_400_000;

/** How long a card waits before it comes back: "Today", "1 day", "6 days", "3 weeks", "2 months". */
export function intervalLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

/** When the next card is due, in words: "later today", "tomorrow", "in 3 days". */
export function nextDueLabel(nextDue: number | null | undefined, now = Date.now()): string | null {
  if (nextDue == null) return null;
  const days = Math.floor(nextDue / DAY_MS) - Math.floor(now / DAY_MS);
  if (days <= 0) return "later today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export interface ForecastDay {
  label: string;
  count: number;
}

/** The seven-day outlook as labelled bars; empty when the server sent none or nothing is coming up. */
export function forecastDays(stats: StudyStats, now = new Date()): ForecastDay[] {
  const f = stats.forecast;
  if (!f || f.every((n) => n === 0)) return [];
  return f.map((count, i) => {
    const d = new Date(now.getTime() + i * DAY_MS);
    return { label: i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }), count };
  });
}
