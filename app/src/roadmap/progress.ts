import { lsGet, lsSet } from "../api";
import type { Submission } from "../types";
import { allSteps, findStep, ROADMAP, TOTAL_STEPS } from "./roadmap";
import type { RoadmapPrefs, StepProgress, StepStatus } from "./types";

export const ROADMAP_LS_KEY = "dc:roadmap";

export function loadRoadmapPrefs(): RoadmapPrefs {
  return lsGet<RoadmapPrefs>(ROADMAP_LS_KEY, {});
}

export function saveRoadmapPrefs(prefs: RoadmapPrefs): void {
  lsSet(ROADMAP_LS_KEY, prefs);
}

export function markPrimerRead(problemId: string): void {
  const prefs = loadRoadmapPrefs();
  const set = new Set(prefs.primersRead ?? []);
  set.add(problemId);
  saveRoadmapPrefs({ ...prefs, primersRead: [...set] });
}

export function isStepDone(subs: Submission[]): boolean {
  return subs.some((s) => s.passed === s.total && s.score >= 80);
}

export function bestScore(subs: Submission[]): number | null {
  if (!subs.length) return null;
  return Math.max(...subs.map((s) => s.score));
}

function hasStartedDesign(problemId: string): boolean {
  const design = lsGet<{ nodes?: unknown[] }>(`dc:design:${problemId}`, {});
  return Array.isArray(design.nodes) && design.nodes.length >= 1;
}

/** Load submissions for one problem from localStorage (works offline; ignores backend). */
export function localSubmissions(problemId: string): Submission[] {
  return lsGet<Submission[]>(`dc:subs:${problemId}`, []);
}

export function statusFor(problemId: string, nextUpId: string | undefined, subs?: Submission[]): StepStatus {
  const list = subs ?? localSubmissions(problemId);
  if (isStepDone(list)) return "done";
  if (hasStartedDesign(problemId)) return "in_progress";
  if (problemId === nextUpId) return "next";
  return "not_started";
}

/** First step in path order that is not done. */
export function firstNotDone(): string | undefined {
  for (const { step } of allSteps()) {
    if (!isStepDone(localSubmissions(step.problemId))) return step.problemId;
  }
  return undefined;
}

/**
 * Continue target: last-open problem if it is on the path and in progress;
 * otherwise the first step that is not done; otherwise the last step.
 */
export function continueTarget(): string {
  const last = lsGet<string>("dc:last", "");
  if (last && findStep(last)) {
    const st = statusFor(last, undefined);
    if (st === "in_progress") return last;
  }
  return firstNotDone() ?? allSteps().at(-1)?.step.problemId ?? "library_management";
}

export function countDone(): number {
  return allSteps().filter(({ step }) => isStepDone(localSubmissions(step.problemId))).length;
}

export function stageDoneCount(stageId: string): { done: number; total: number } {
  const stage = ROADMAP.find((s) => s.id === stageId);
  if (!stage) return { done: 0, total: 0 };
  const done = stage.steps.filter((s) => isStepDone(localSubmissions(s.problemId))).length;
  return { done, total: stage.steps.length };
}

export function stepProgress(problemId: string): StepProgress | undefined {
  const found = findStep(problemId);
  if (!found) return undefined;
  const nextUp = firstNotDone();
  const subs = localSubmissions(problemId);
  const stageIndex = ROADMAP.findIndex((s) => s.id === found.stage.id) + 1;
  return {
    problemId,
    status: statusFor(problemId, nextUp, subs),
    bestScore: bestScore(subs),
    stepIndex: found.index,
    stageId: found.stage.id,
    stageTitle: found.stage.title,
    stageIndex,
  };
}

export function earlierIncomplete(problemId: string): { problemId: string; titleHint: string } | undefined {
  for (const { step } of allSteps()) {
    if (step.problemId === problemId) return undefined;
    if (!isStepDone(localSubmissions(step.problemId))) {
      return {
        problemId: step.problemId,
        titleHint: step.problemId.replace(/_/g, " "),
      };
    }
  }
  return undefined;
}

export { TOTAL_STEPS };
