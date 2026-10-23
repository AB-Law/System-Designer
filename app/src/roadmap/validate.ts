import type { Problem } from "../types";
import { allSteps, ROADMAP } from "./roadmap";

export type RoadmapIssue =
  | { kind: "unknown"; problemId: string }
  | { kind: "duplicate"; problemId: string; count: number }
  | { kind: "missing"; problemId: string }
  | { kind: "count_mismatch"; steps: number; problems: number }
  | { kind: "empty" };

/** Pure sanity check: every problemId exists and every problem appears exactly once. */
export function checkRoadmap(problems: Problem[]): RoadmapIssue[] {
  const issues: RoadmapIssue[] = [];
  const ids = new Set(problems.map((p) => p.id));
  const seen = new Map<string, number>();

  for (const { step } of allSteps()) {
    const id = step.problemId;
    if (!ids.has(id)) issues.push({ kind: "unknown", problemId: id });
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }

  for (const [id, n] of seen) {
    if (n > 1) issues.push({ kind: "duplicate", problemId: id, count: n });
  }

  for (const p of problems) {
    if (!seen.has(p.id)) issues.push({ kind: "missing", problemId: p.id });
  }

  const total = allSteps().length;
  if (total !== problems.length) {
    issues.push({ kind: "count_mismatch", steps: total, problems: problems.length });
  }

  if (!ROADMAP.length) issues.push({ kind: "empty" });
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
    }
  }
}
