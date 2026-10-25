import type { Problem } from "../types";
import { ROADMAP } from "./roadmap";
import type { RoadmapStage } from "./types";

export type RoadmapIssue =
  | { kind: "unknown"; problemId: string }
  | { kind: "duplicate"; problemId: string; count: number }
  | { kind: "missing"; problemId: string }
  | { kind: "count_mismatch"; steps: number; problems: number }
  | { kind: "empty" }
  | { kind: "empty_stage"; stageId: string }
  | { kind: "duplicate_stage"; stageId: string }
  | { kind: "unknown_lesson"; stageId: string; lesson: string }
  | { kind: "unknown_lesson_page"; stageId: string; problemId: string; page: string };

/**
 * Pure sanity check: every problemId exists and every problem appears exactly once, every stage has a problem, and every
 * lesson a stage points at exists. Pass `lessonIds` to check lesson references; leave it out to skip that check.
 */
export function checkRoadmap(
  problems: Problem[],
  roadmap: RoadmapStage[] = ROADMAP,
  lessonIds?: string[],
  /** page ids of each lesson; pass it to check every step's `lessonPage` */
  lessonPages?: Record<string, string[]>,
): RoadmapIssue[] {
  const issues: RoadmapIssue[] = [];
  const ids = new Set(problems.map((p) => p.id));
  const seen = new Map<string, number>();
  const stageIds = new Set<string>();
  let total = 0;

  for (const stage of roadmap) {
    if (stageIds.has(stage.id)) issues.push({ kind: "duplicate_stage", stageId: stage.id });
    stageIds.add(stage.id);
    if (stage.steps.length === 0) issues.push({ kind: "empty_stage", stageId: stage.id });
    if (stage.lesson !== undefined && lessonIds && !lessonIds.includes(stage.lesson))
      issues.push({ kind: "unknown_lesson", stageId: stage.id, lesson: stage.lesson });
    for (const step of stage.steps) {
      total += 1;
      if (step.lessonPage !== undefined && lessonPages && !lessonPages[stage.lesson ?? ""]?.includes(step.lessonPage))
        issues.push({ kind: "unknown_lesson_page", stageId: stage.id, problemId: step.problemId, page: step.lessonPage });
      if (!ids.has(step.problemId)) issues.push({ kind: "unknown", problemId: step.problemId });
      seen.set(step.problemId, (seen.get(step.problemId) ?? 0) + 1);
    }
  }

  for (const [id, n] of seen) {
    if (n > 1) issues.push({ kind: "duplicate", problemId: id, count: n });
  }

  for (const p of problems) {
    if (!seen.has(p.id)) issues.push({ kind: "missing", problemId: p.id });
  }

  if (total !== problems.length) {
    issues.push({ kind: "count_mismatch", steps: total, problems: problems.length });
  }

  if (!roadmap.length) issues.push({ kind: "empty" });
  return issues;
}

/** Dev-only sanity check: every problemId exists and every problem appears exactly once. */
export function validateRoadmap(problems: Problem[]): void {
  if (!import.meta.env.DEV) return;

  for (const issue of checkRoadmap(problems)) {
    if (issue.kind === "unknown") {
      console.warn(`[roadmap] unknown problemId "${issue.problemId}" — no matching problem file`);
    } else if (issue.kind === "duplicate") {
      console.warn(`[roadmap] problemId "${issue.problemId}" appears ${issue.count} times (expected once)`);
    } else if (issue.kind === "missing") {
      console.warn(`[roadmap] problem "${issue.problemId}" is not on the learning path`);
    } else if (issue.kind === "count_mismatch") {
      console.warn(`[roadmap] path has ${issue.steps} steps but there are ${issue.problems} problems`);
    } else if (issue.kind === "empty") {
      console.warn("[roadmap] ROADMAP is empty");
    } else if (issue.kind === "empty_stage") {
      console.warn(`[roadmap] stage "${issue.stageId}" has no problems`);
    } else if (issue.kind === "duplicate_stage") {
      console.warn(`[roadmap] stage id "${issue.stageId}" is used twice`);
    } else if (issue.kind === "unknown_lesson_page") {
      console.warn(
        `[roadmap] "${issue.problemId}" points at lesson page "${issue.page}", which is not in the lesson of stage "${issue.stageId}"`,
      );
    } else if (issue.kind === "unknown_lesson") {
      console.warn(`[roadmap] stage "${issue.stageId}" points at lesson "${issue.lesson}", which does not exist`);
    }
  }
}
