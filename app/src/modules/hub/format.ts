import type { Activity, Tier } from "./types";

export const TIER_WORD: Record<Tier, string> = {
  strong: "Strong",
  building: "Building",
  needs_work: "Needs work",
  early: "Early read",
  none: "No data yet",
};

/** A CSS colour per tier. Never the only signal: the word is always shown beside it. */
export const TIER_COLOR: Record<Tier, string> = {
  strong: "var(--good)",
  building: "var(--gold)",
  needs_work: "var(--warn)",
  early: "var(--navy-hi)",
  none: "var(--muted)",
};

export const dataPoints = (n: number): string => (n === 0 ? "Nothing recorded yet" : `${n} data point${n === 1 ? "" : "s"}`);

export function barWidth(strength: number | null, tier: Tier): string {
  return tier === "none" || strength === null ? "0%" : `${Math.round(strength * 100)}%`;
}

export function daysLeftText(daysLeft: number | null): string {
  if (daysLeft === null) return "";
  if (daysLeft < 0) return "date passed";
  if (daysLeft === 0) return "today";
  return daysLeft === 1 ? "tomorrow" : `${daysLeft} days away`;
}

const MODULE_NAME: Record<string, string> = { study: "Study", interview: "Interview", cv: "CV", design: "Design", hub: "Hub" };
export const moduleName = (id: string): string => MODULE_NAME[id] ?? id;

/** One line for the activity list, from what the module recorded. */
export function activityText(a: Activity): string {
  const where = a.topics.length ? a.topics.join(", ") : "general";
  if (a.module === "study") return `Reviewed a card on ${where}`;
  if (a.module === "interview") return `Finished a mock interview round (${where})`;
  return `Progress on ${where}`;
}

export function ago(at: number, now: number = Date.now()): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return "Today";
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const weekday = (isoDate: string): string => WEEKDAY[new Date(`${isoDate}T12:00:00Z`).getUTCDay()];
