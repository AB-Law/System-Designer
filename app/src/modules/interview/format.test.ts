import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, clock, groupByRole, scoreTone, styleSummary } from "./format";
import type { SessionSummary } from "./types";

const session = (id: number, roleId: number, title: string): SessionSummary => ({
  id,
  roleId,
  roleTitle: title,
  company: null,
  status: "ended",
  score: null,
  style: DEFAULT_STYLE,
  turnCount: 0,
  created: id,
  ended: null,
});

describe("interview format", () => {
  it("formats a clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65_000)).toBe("1:05");
    expect(clock(-5_000)).toBe("0:00");
    expect(clock(30 * 60_000)).toBe("30:00");
  });

  it("tones scores like the CV bands", () => {
    expect([null, 90, 75, 74, 50, 49].map(scoreTone)).toEqual(["neutral", "good", "good", "warn", "warn", "bad"]);
  });

  it("groups sessions by role in first-seen order", () => {
    const groups = groupByRole([session(5, 2, "B"), session(4, 1, "A"), session(3, 2, "B")]);
    expect(groups.map((g) => [g.roleId, g.sessions.map((s) => s.id)])).toEqual([
      [2, [5, 3]],
      [1, [4]],
    ]);
  });

  it("summarises a style", () => {
    expect(styleSummary(DEFAULT_STYLE)).toBe("Friendly, 30 min");
    expect(styleSummary({ ...DEFAULT_STYLE, tone: "tough", counts: { behavioral: 2, system_design: 1 } })).toBe(
      "Tough, 30 min, 2 behavioral, 1 system design",
    );
  });
});
