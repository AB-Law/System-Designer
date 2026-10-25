import { describe, expect, it } from "vitest";
import type { Problem } from "../types";
import { allSteps, ROADMAP } from "./roadmap";
import type { RoadmapStage } from "./types";
import { checkRoadmap } from "./validate";

const problems = import.meta.glob("../problems/*.json", { eager: true, import: "default" }) as Record<string, Problem>;

describe("checkRoadmap", () => {
  it("accepts the shipped problem set with no issues", () => {
    const list = Object.values(problems);
    expect(list.length).toBeGreaterThan(0);
    expect(checkRoadmap(list)).toEqual([]);
    expect(allSteps().length).toBe(list.length);
  });

  it("reports a missing problem when one is omitted from the path input", () => {
    const list = Object.values(problems).slice(1);
    const issues = checkRoadmap(list);
    expect(issues.some((i) => i.kind === "unknown" || i.kind === "count_mismatch")).toBe(true);
  });
});

describe("checkRoadmap: module rules", () => {
  const list = Object.values(problems);
  const step = (problemId: string) => ({ problemId, minutes: 1, youWillLearn: [], newIdeas: [], primer: [], watchOutFor: "", reflect: [] });
  const stage = (id: string, ids: string[], extra: Partial<RoadmapStage> = {}): RoadmapStage => ({
    id,
    title: id,
    blurb: "",
    steps: ids.map(step),
    ...extra,
  });
  const all = list.map((p) => p.id);

  it("rejects a duplicate problem id", () => {
    const issues = checkRoadmap(list, [stage("a", all), stage("b", [all[0]])]);
    expect(issues).toContainEqual({ kind: "duplicate", problemId: all[0], count: 2 });
  });
  it("rejects a missing problem id", () => {
    const issues = checkRoadmap(list, [stage("a", all.slice(1))]);
    expect(issues).toContainEqual({ kind: "missing", problemId: all[0] });
  });
  it("rejects an unknown problem id", () => {
    const issues = checkRoadmap(list, [stage("a", [...all, "nope"])]);
    expect(issues).toContainEqual({ kind: "unknown", problemId: "nope" });
  });
  it("rejects a stage with no problems and a repeated stage id", () => {
    const issues = checkRoadmap(list, [stage("a", all), stage("a", [])]);
    expect(issues).toContainEqual({ kind: "empty_stage", stageId: "a" });
    expect(issues).toContainEqual({ kind: "duplicate_stage", stageId: "a" });
  });
  it("checks lesson references only when lesson ids are given", () => {
    const road = [stage("a", all, { lesson: "module-0" })];
    expect(checkRoadmap(list, road)).toEqual([]);
    expect(checkRoadmap(list, road, ["module-0"])).toEqual([]);
    expect(checkRoadmap(list, road, ["other"])).toContainEqual({ kind: "unknown_lesson", stageId: "a", lesson: "module-0" });
  });
  it("accepts the shipped roadmap with lesson checking switched on", () => {
    expect(checkRoadmap(list, ROADMAP, ["module-0"])).toEqual([]);
  });
});
