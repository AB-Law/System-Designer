import { describe, expect, it } from "vitest";
import { estimateQuestions, gradeEstimate, parseAmount } from "./estimate";
import type { Problem } from "../types";

const p = {
  traffic: { users: 2_000_000, reqPerUser: 0.002, writeShare: 0.02 },
  scenarios: [
    { id: "normal", title: "Normal day", trafficMultiplier: 1 },
    { id: "viral", title: "Viral link", trafficMultiplier: 3 },
  ],
} as unknown as Problem;

describe("estimateQuestions", () => {
  it("works the answers out from the traffic numbers", () => {
    const q = Object.fromEntries(estimateQuestions(p).map((x) => [x.id, x.answer]));
    expect(q.rps).toBe(4000);
    expect(q.writes).toBe(80);
    expect(q.spike).toBe(12000);
    expect(q.servers).toBe(12);
  });
  it("skips the spike question when no scenario raises traffic", () => {
    const flat = { ...p, scenarios: [{ id: "n", title: "n", trafficMultiplier: 1 }] } as unknown as Problem;
    expect(estimateQuestions(flat).some((x) => x.id === "spike")).toBe(false);
    expect(estimateQuestions(flat).find((x) => x.id === "servers")?.answer).toBe(4);
  });
});

describe("parseAmount", () => {
  it("reads plain numbers, thousands separators and k/m suffixes", () => {
    expect(parseAmount("4000")).toBe(4000);
    expect(parseAmount("4,000")).toBe(4000);
    expect(parseAmount("4k")).toBe(4000);
    expect(parseAmount("1.5M")).toBe(1_500_000);
    expect(parseAmount("lots")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("gradeEstimate", () => {
  it("is right within 25%, close within three times, and off beyond that", () => {
    expect(gradeEstimate(4200, 4000).level).toBe("right");
    expect(gradeEstimate(9000, 4000).level).toBe("close");
    expect(gradeEstimate(40, 4000).level).toBe("off");
    expect(gradeEstimate(40, 4000).text).toMatch(/100 times, too low/);
  });
});
