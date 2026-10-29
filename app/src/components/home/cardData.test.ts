import { describe, expect, it } from "vitest";
import type { Problem, Submission } from "../../types";
import { bestSubmission, editedText, matches, passedLine, sortCards, trafficLine, type CardData } from "./cardData";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const day = 86_400_000;

const sub = (score: number, passed: number, at: number): Submission => ({ at, score, passed, total: 4, result: {} as never });

const prob = (over: Partial<Problem>): Problem =>
  ({
    id: "x",
    title: "Design a Thing",
    difficulty: "easy",
    brief: "People do things online.",
    traffic: { users: 2_000_000, reqPerUser: 0.002, writeShare: 0.02 },
    scenarios: [{}, {}, {}, {}],
    ...over,
  }) as Problem;

const card = (over: Partial<CardData>): CardData => ({
  problemId: "x",
  doc: null,
  blocks: 0,
  edited: null,
  best: null,
  passed: 0,
  total: 0,
  attempts: 0,
  status: "not_started",
  ...over,
});

describe("bestSubmission", () => {
  it("picks the highest score, newest on a tie, and null when nothing was submitted", () => {
    expect(bestSubmission([])).toBeNull();
    const b = bestSubmission([sub(60, 2, 1), sub(88, 4, 2), sub(88, 3, 3), sub(40, 1, 4)]);
    expect(b?.score).toBe(88);
    expect(b?.at).toBe(3);
  });
});

describe("editedText", () => {
  it("speaks in days, then weeks, then months", () => {
    expect(editedText(NOW - 3_600_000, NOW)).toBe("edited today");
    expect(editedText(NOW - day, NOW)).toBe("edited yesterday");
    expect(editedText(NOW - 3 * day, NOW)).toBe("edited 3 days ago");
    expect(editedText(NOW - 21 * day, NOW)).toBe("edited 3 weeks ago");
    expect(editedText(NOW - 90 * day, NOW)).toBe("edited 3 months ago");
  });
});

describe("trafficLine", () => {
  it("states the peak load in plain words, rounded", () => {
    expect(trafficLine(prob({}))).toBe("Peak about 4,000 requests a second");
    expect(trafficLine(prob({ traffic: { users: 1000, reqPerUser: 0.0234, writeShare: 0 } }))).toBe("Peak about 23 requests a second");
    expect(trafficLine(prob({ traffic: { users: 10, reqPerUser: 0.01, writeShare: 0 } }))).toBe("Peak about 1 requests a second");
  });
});

describe("passedLine", () => {
  it("only appears once a design has been scored", () => {
    expect(passedLine(card({}))).toBeNull();
    expect(passedLine(card({ passed: 3, total: 4 }))).toBe("3 of 4 scenarios passed");
  });
});

describe("sortCards and matches", () => {
  const items = [
    { p: prob({ id: "a", difficulty: "hard" }), index: 1, d: card({ best: 40, edited: 5 }) },
    { p: prob({ id: "b", difficulty: "easy" }), index: 2, d: card({ best: 90, edited: 1 }) },
    { p: prob({ id: "c", difficulty: "medium" }), index: 3, d: card({}) },
  ];
  const ids = (s: Parameters<typeof sortCards>[1]) => sortCards(items, s).map((i) => i.p.id);
  it("orders by path, difficulty, recency and score, unstarted work last", () => {
    expect(ids("path")).toEqual(["a", "b", "c"]);
    expect(ids("difficulty")).toEqual(["b", "c", "a"]);
    expect(ids("recent")).toEqual(["a", "b", "c"]);
    expect(ids("score")).toEqual(["b", "a", "c"]);
  });
  it("matches a title or brief without regard to case", () => {
    expect(matches(prob({}), "THING")).toBe(true);
    expect(matches(prob({}), "online")).toBe(true);
    expect(matches(prob({}), "zebra")).toBe(false);
    expect(matches(prob({}), "  ")).toBe(true);
  });
});
