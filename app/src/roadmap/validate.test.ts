import { describe, expect, it } from "vitest";
import type { Problem } from "../types";
import { allSteps } from "./roadmap";
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
