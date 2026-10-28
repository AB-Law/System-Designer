import { CATEGORIES, CATEGORY_LABELS, type SessionSummary, type Style, type TurnTag } from "./types";

export const DEFAULT_STYLE: Style = { tone: "friendly", durationMin: 30, categories: [], counts: {}, showPlan: false, useCv: true };
export const DURATIONS = [15, 30, 45, 60];
export const MAX_QUESTIONS = 12;
export const LEVELS = ["Junior", "Mid", "Senior", "Staff"];

export const totalQuestions = (style: Style): number => CATEGORIES.reduce((sum, c) => sum + (style.counts[c] ?? 0), 0);

/** 75 and over is strong, 50 and over fair. */
export const scoreTone = (score: number | null): "good" | "warn" | "bad" | "neutral" =>
  score === null ? "neutral" : score >= 75 ? "good" : score >= 50 ? "warn" : "bad";

const DAY = 24 * 60 * 60 * 1000;

/** How long ago something was found, in words: "today", "3 days ago", "2 months ago". */
export function ageLabel(then: number, now: number = Date.now()): string {
  const days = Math.max(0, Math.floor((now - then) / DAY));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/** Minutes and seconds, such as 7:05. Never negative. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const dateLabel = (ms: number): string => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const TAG_LABELS: Record<TurnTag, string> = {
  question: "Question",
  answer: "You",
  "follow-up": "Follow-up",
  transition: "New topic",
  closing: "Closing",
};

/** "Friendly, 30 min" with the mix when the user set one. */
export function styleSummary(style: Style): string {
  const mix = CATEGORIES.filter((c) => style.counts[c]).map((c) => `${style.counts[c]} ${CATEGORY_LABELS[c].toLowerCase()}`);
  return [style.tone === "tough" ? "Tough" : "Friendly", `${style.durationMin} min`, ...mix].join(", ");
}

export interface RoleGroup {
  roleId: number;
  title: string;
  company: string | null;
  sessions: SessionSummary[];
}

/** Sessions grouped by role, the role with the most recent session first; sessions keep their newest-first order. */
export function groupByRole(sessions: SessionSummary[]): RoleGroup[] {
  const groups = new Map<number, RoleGroup>();
  for (const s of sessions) {
    const group = groups.get(s.roleId) ?? { roleId: s.roleId, title: s.roleTitle, company: s.company, sessions: [] };
    group.sessions.push(s);
    groups.set(s.roleId, group);
  }
  return [...groups.values()];
}
