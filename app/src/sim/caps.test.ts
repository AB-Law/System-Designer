import { describe, expect, it } from "vitest";
import type { Capability, Problem } from "../types";
import { capIdsOf, isOptionalHost, primaryCapability, workFactor } from "./caps";

const cap = (partial: Partial<Capability> & Pick<Capability, "id">): Capability => ({
  label: partial.id,
  share: 1,
  work: 1,
  critical: true,
  ...partial,
});

const problem = (capabilities: Capability[]): Problem =>
  ({
    id: "t",
    title: "t",
    difficulty: "easy",
    brief: "",
    traffic: { users: 1, reqPerUser: 1, writeShare: 0.1 },
    scenarios: [],
    requirements: [],
    budget: 100,
    capabilities,
  }) as unknown as Problem;

describe("primaryCapability", () => {
  it("prefers a critical share-1 request capability", () => {
    const caps = [cap({ id: "ads", share: 0.2, critical: false }), cap({ id: "serve", share: 1, critical: true })];
    expect(primaryCapability(problem(caps))?.id).toBe("serve");
  });

  it("falls back to the first request capability", () => {
    const caps = [cap({ id: "a", share: 0.5, critical: false }), cap({ id: "b", share: 0.5, critical: false })];
    expect(primaryCapability(problem(caps))?.id).toBe("a");
  });

  it("ignores background jobs", () => {
    const caps = [cap({ id: "sweep", mode: "background", share: 0, jobsPerSec: 1 }), cap({ id: "serve", share: 1 })];
    expect(primaryCapability(problem(caps))?.id).toBe("serve");
  });
});

describe("workFactor", () => {
  it("is 1 when a block runs nothing", () => {
    expect(workFactor([])).toBe(1);
  });

  it("scales work by share relative to the top share", () => {
    expect(workFactor([cap({ id: "a", share: 1, work: 1 }), cap({ id: "b", share: 0.5, work: 2 })])).toBeCloseTo(2);
  });
});

describe("isOptionalHost", () => {
  it("is true only when every hosted request cap is non-critical", () => {
    expect(isOptionalHost([cap({ id: "ads", critical: false })])).toBe(true);
    expect(isOptionalHost([cap({ id: "serve", critical: true })])).toBe(false);
    expect(isOptionalHost([])).toBe(false);
  });
});

describe("capIdsOf", () => {
  it("returns explicit picks", () => {
    expect(capIdsOf("server", ["serve", "ads"], problem([cap({ id: "serve" })]))).toEqual(["serve", "ads"]);
  });

  it("for legacy servers without picks, uses the primary request", () => {
    const P = problem([cap({ id: "serve", share: 1, critical: true })]);
    expect(capIdsOf("server", undefined, P)).toEqual(["serve"]);
    expect(capIdsOf("worker", undefined, P)).toEqual([]);
  });
});
