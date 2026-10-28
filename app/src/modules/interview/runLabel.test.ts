import { describe, expect, it } from "vitest";
import { runLabel } from "./components/RoleFields";

describe("score picker labels", () => {
  it("tells two scores of one role apart by depth, result and date", () => {
    const fast = runLabel({
      id: 1,
      jdTitle: "Staff Backend Engineer",
      mode: "fast",
      total: 58,
      created: Date.parse("2026-10-20"),
      cvName: "My CV",
    });
    const deep = runLabel({
      id: 2,
      jdTitle: "Staff Backend Engineer",
      mode: "deep",
      total: 64,
      created: Date.parse("2026-10-20"),
      cvName: "My CV",
    });
    expect(fast).not.toBe(deep);
    expect(fast).toContain("Fast score");
    expect(deep).toContain("Deep score");
    expect(deep).toContain("64/100");
  });
  it("still works with only the basics", () => {
    expect(runLabel({ id: 3, jdTitle: "" })).toBe("Score 3");
  });
});
