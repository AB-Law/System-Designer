import type { Activity, Tier, TopicCard } from "./types";

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

const FOCUS = 3;

/** The topics with evidence, weakest first, so the ones to work on lead. Topics with nothing recorded stay out of the way. */
export function splitTopics(topics: TopicCard[]): { focus: TopicCard[]; rest: TopicCard[]; empty: TopicCard[] } {
  const seen = topics.filter((t) => t.tier !== "none");
  const focus = [...seen].sort((a, b) => (a.strength ?? 1) - (b.strength ?? 1)).slice(0, FOCUS);
  return { focus, rest: seen.filter((t) => !focus.includes(t)), empty: topics.filter((t) => t.tier === "none") };
}

export interface ResumeItem {
  key: string;
  title: string;
  detail: string;
  href: string;
}

const where = (a: Activity): string => (a.topics.length ? a.topics.join(", ") : "general");

/** The last mock interview and the last study session, newest first in `activity`, as places to carry on from. */
export function resumeItems(activity: Activity[], now: number = Date.now()): ResumeItem[] {
  const out: ResumeItem[] = [];
  const interview = activity.find((a) => a.module === "interview");
  const sessionId = interview && /^interview_session:(\d{1,9})$/.exec(interview.ref)?.[1];
  if (interview && sessionId)
    out.push({
      key: "interview",
      title: "Your last mock interview",
      detail: `${where(interview)} · ${ago(interview.at, now)}`,
      href: `#/interview/session/${sessionId}`,
    });
  const study = activity.find((a) => a.module === "study");
  if (study) out.push({ key: "study", title: "Keep studying", detail: `${where(study)} · ${ago(study.at, now)}`, href: "#/study" });
  return out;
}

export function ago(at: number, now: number = Date.now()): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return "Today";
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const weekday = (isoDate: string): string => WEEKDAY[new Date(`${isoDate}T12:00:00Z`).getUTCDay()];

/** One headline number: the mean strength of the topics that have evidence, outside-track extras left out. Null when nothing is recorded. */
export function overallReadiness(topics: TopicCard[]): { score: number; topics: number } | null {
  const seen = topics.filter((t) => t.tier !== "none" && t.strength !== null && !t.extra);
  if (seen.length === 0) return null;
  const mean = seen.reduce((sum, t) => sum + (t.strength ?? 0), 0) / seen.length;
  return { score: Math.round(mean * 100), topics: seen.length };
}

export function readinessTier(score: number): Tier {
  return score >= 75 ? "strong" : score >= 50 ? "building" : "needs_work";
}
