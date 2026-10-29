import { localDesign } from "../../cloud/sync";
import type { DesignDoc } from "../../cloud/doc";
import { isStepDone, localSubmissions, statusFor } from "../../roadmap/progress";
import type { StepStatus } from "../../roadmap/types";
import type { Problem, Submission } from "../../types";

/** Everything a problem card shows about the person's own work on it. */
export interface CardData {
  problemId: string;
  doc: DesignDoc | null;
  blocks: number;
  /** When the design was last edited, in ms, or null if it has not been started. */
  edited: number | null;
  best: number | null;
  /** Scenarios passed and the total, from the best attempt. */
  passed: number;
  total: number;
  attempts: number;
  status: StepStatus;
}

/** The highest-scoring attempt, newest first on a tie. */
export function bestSubmission(subs: Submission[]): Submission | null {
  if (!subs.length) return null;
  return [...subs].sort((a, b) => b.score - a.score || b.at - a.at)[0];
}

export function cardData(problemId: string, nextId: string | undefined): CardData {
  const subs = localSubmissions(problemId);
  const best = bestSubmission(subs);
  const mine = localDesign(problemId);
  return {
    problemId,
    doc: mine.doc,
    blocks: mine.doc?.nodes.length ?? 0,
    edited: mine.doc ? mine.at || null : null,
    best: best ? best.score : null,
    passed: best?.passed ?? 0,
    total: best?.total ?? 0,
    attempts: subs.length,
    status: statusFor(problemId, nextId, subs),
  };
}

const DAY = 86_400_000;

/** "edited today", "edited yesterday", "edited 3 days ago", "edited 2 weeks ago". */
export function editedText(at: number, now: number = Date.now()): string {
  const days = Math.floor((now - at) / DAY);
  if (days <= 0) return "edited today";
  if (days === 1) return "edited yesterday";
  if (days < 14) return `edited ${days} days ago`;
  if (days < 60) return `edited ${Math.floor(days / 7)} weeks ago`;
  return `edited ${Math.floor(days / 30)} months ago`;
}

/** The peak load the problem sets, as the card's plain sentence: "Peak about 4,000 requests a second". */
export function trafficLine(p: Problem): string {
  const rps = p.traffic.users * p.traffic.reqPerUser;
  const rounded = rps >= 1000 ? Math.round(rps / 100) * 100 : rps >= 100 ? Math.round(rps / 10) * 10 : Math.max(1, Math.round(rps));
  return `Peak about ${rounded.toLocaleString("en-US")} requests a second`;
}

export const scenarioLine = (p: Problem): string => `${p.scenarios.length} scenario${p.scenarios.length === 1 ? "" : "s"}`;

/** "3 of 4 scenarios passed" for a card that has been scored, else null. */
export function passedLine(d: CardData): string | null {
  return d.total > 0 ? `${d.passed} of ${d.total} scenarios passed` : null;
}

export type Sort = "path" | "difficulty" | "recent" | "score";

const RANK = { easy: 0, medium: 1, hard: 2 } as const;

/** Orders cards for the grid: the path as written, easiest first, most recently edited first, or best score first (unscored last). */
export function sortCards<T extends { p: Problem; index: number; d: CardData }>(items: T[], sort: Sort): T[] {
  const list = [...items];
  if (sort === "difficulty") list.sort((a, b) => RANK[a.p.difficulty] - RANK[b.p.difficulty] || a.index - b.index);
  else if (sort === "recent") list.sort((a, b) => (b.d.edited ?? -1) - (a.d.edited ?? -1) || a.index - b.index);
  else if (sort === "score") list.sort((a, b) => (b.d.best ?? -1) - (a.d.best ?? -1) || a.index - b.index);
  else list.sort((a, b) => a.index - b.index);
  return list;
}

/** Case-insensitive match on the title and the brief. */
export function matches(p: Problem, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || p.title.toLowerCase().includes(q) || p.brief.toLowerCase().includes(q);
}

export const isDone = (problemId: string): boolean => isStepDone(localSubmissions(problemId));

/** The first two sentences of a brief, which say what the system is for and who uses it. */
export const twoSentences = (brief: string): string =>
  brief
    .split(/(?<=[.!?])\s/)
    .slice(0, 2)
    .join(" ");
