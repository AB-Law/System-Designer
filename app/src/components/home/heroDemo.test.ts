import { describe, expect, it } from "vitest";
import type { Problem } from "../../types";
import { STARTER_MAP, starterDesign, takesFor } from "./heroDemo";

const problems = Object.values(import.meta.glob("../../problems/*.json", { eager: true, import: "default" })) as Problem[];

describe("starter design", () => {
  it("draws the same blocks and connections it simulates", () => {
    const d = starterDesign();
    expect(d.nodes.map((n) => n.id)).toEqual(STARTER_MAP.nodes.map((n) => n.id));
    expect(d.edges.map((e) => e.id)).toEqual(STARTER_MAP.edges.map((e) => e.id));
  });
});

describe("takesFor", () => {
  it("returns one sensible outcome per scenario for every bundled problem", () => {
    expect(problems.length).toBeGreaterThan(10);
    for (const p of problems) {
      const takes = takesFor(starterDesign(), p);
      expect(takes.length, p.id).toBe(p.scenarios.length);
      for (const t of takes) {
        expect(t.served, `${p.id} ${t.id}`).toBeGreaterThanOrEqual(0);
        expect(t.served, `${p.id} ${t.id}`).toBeLessThanOrEqual(100);
        expect(Number.isFinite(t.latencyMs), `${p.id} ${t.id}`).toBe(true);
      }
    }
  });
  it("tells a failing scenario apart from a passing one and names a reason for the failure", () => {
    const outcomes = problems.flatMap((p) => takesFor(starterDesign(), p));
    expect(outcomes.some((t) => t.pass)).toBe(true);
    const failed = outcomes.filter((t) => !t.pass);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.some((t) => t.reason)).toBe(true);
  });
});
