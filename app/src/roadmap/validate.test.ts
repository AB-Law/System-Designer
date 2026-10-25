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
  it("rejects a lesson page that the stage's lesson does not have", () => {
    const steps = all.map((id, i) => ({ ...step(id), ...(i === 0 ? { lessonPage: "gone" } : {}) }));
    const road = [stage("a", [], { lesson: "l", steps })];
    expect(checkRoadmap(list, road, ["l"], { l: ["here"] })).toContainEqual({
      kind: "unknown_lesson_page",
      stageId: "a",
      problemId: all[0],
      page: "gone",
    });
    expect(checkRoadmap(list, road, ["l"], { l: ["gone"] })).toEqual([]);
  });
  it("accepts the shipped roadmap with lesson checking switched on", () => {
    expect(checkRoadmap(list, ROADMAP, ["module-0", "module-1", "module-2", "module-3", "module-4", "module-5"])).toEqual([]);
  });
  it("follows the approved module order, and only modules with a written lesson link to one", () => {
    expect(ROADMAP.map((st) => [st.id, st.lesson ?? null, st.steps.map((x) => x.problemId)])).toEqual([
      ["first-designs", "module-0", ["personal_blog", "photo_portfolio"]],
      ["traffic-copies-correctness", "module-1", ["class_poll"]],
      ["work-later", "module-2", ["contact_form", "url_shortener", "pastebin", "notification"]],
      [
        "data-and-queries",
        "module-3",
        ["library_management", "google_drive", "messaging_app", "ticket_booking", "metrics_monitoring", "news_feed"],
      ],
      ["search-maps-media", "module-4", ["search", "maps", "video_streaming", "web_crawler"]],
      ["real-time-money", "module-5", ["food_delivery", "ride_sharing", "payment", "ad_serving"]],
    ]);
  });
});
