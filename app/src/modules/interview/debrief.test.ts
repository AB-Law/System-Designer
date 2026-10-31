import { describe, expect, it } from "vitest";
import { focusStyle, headline, rankedCategories, SCORE_WORD } from "./debrief";
import { DEFAULT_STYLE } from "./format";
import type { Feedback } from "./types";

const summary = (byCategory: Feedback["summary"]["byCategory"], score: number | null = 34): Feedback["summary"] => ({
  strengths: [],
  gaps: [],
  practiceNext: [],
  byCategory,
  score,
});

describe("rankedCategories", () => {
  it("lists only what was marked, weakest first", () => {
    const r = rankedCategories(summary({ behavioral: 27, technical: 35, system_design: 40 }));
    expect(r.map((c) => c.id)).toEqual(["behavioral", "technical", "system_design"]);
    expect(r[0].label).toBe("Behavioral");
  });
});

describe("headline", () => {
  it("names the strongest and the weakest area", () => {
    expect(headline(summary({ behavioral: 27, technical: 35, system_design: 40, company: 40 }))).toBe(
      "Strongest: company, 40. Weakest: behavioral, 27.",
    );
  });
  it("copes with one area, level scores and nothing marked", () => {
    expect(headline(summary({ technical: 61 }))).toBe("Only technical was marked, at 61.");
    expect(headline(summary({ technical: 50, behavioral: 50 }))).toBe("Every area came out level, at 50.");
    expect(headline(summary({}, null))).toBe("There was not enough to mark.");
  });
});

describe("SCORE_WORD", () => {
  it("uses the same bands as the score ring", () => {
    expect([30, 50, 74, 75, 90].map(SCORE_WORD)).toEqual(["Needs work", "Fair", "Fair", "Strong", "Strong"]);
  });
});

describe("focusStyle", () => {
  it("asks four questions from one area in fifteen minutes and keeps tone and CV use", () => {
    const s = focusStyle({ ...DEFAULT_STYLE, tone: "tough", useCv: false, durationMin: 60, showPlan: true }, "behavioral");
    expect(s).toMatchObject({ tone: "tough", useCv: false, durationMin: 15, showPlan: false, counts: { behavioral: 4 } });
  });
  it("falls back to the defaults when there is no earlier style", () => {
    expect(focusStyle(undefined, "technical").tone).toBe(DEFAULT_STYLE.tone);
  });
});
