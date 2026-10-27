import { describe, expect, it } from "vitest";
import { format, hashFor, parse, tabOf, type CvRoute } from "./route";

const routes: CvRoute[] = [
  { name: "library" },
  { name: "review", cvId: 12 },
  { name: "score" },
  { name: "result", runId: 7 },
  { name: "rewrites", runId: 7 },
  { name: "history" },
  { name: "compare", a: 3, b: 5 },
  { name: "settings" },
];

describe("cv routes", () => {
  it("round-trips every route", () => {
    for (const r of routes) expect(parse(format(r))).toEqual(r);
  });
  it("sends unknown or malformed paths to the library", () => {
    for (const bad of [
      "nope",
      "cv",
      "cv/abc",
      "score/x",
      "score/1/other",
      "history/compare/1",
      "cv/1/extra",
      "cv/-1",
      "score/99999999999",
    ]) {
      expect(parse(bad)).toEqual({ name: "library" });
    }
  });
  it("builds hashes under #/cv", () => {
    expect(hashFor({ name: "library" })).toBe("#/cv");
    expect(hashFor({ name: "result", runId: 4 })).toBe("#/cv/score/4");
  });
  it("groups routes into tabs", () => {
    expect(tabOf({ name: "review", cvId: 1 })).toBe("library");
    expect(tabOf({ name: "rewrites", runId: 1 })).toBe("score");
    expect(tabOf({ name: "compare", a: 1, b: 2 })).toBe("history");
  });
});
