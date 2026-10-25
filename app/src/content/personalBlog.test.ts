import { describe, expect, it } from "vitest";
import blog from "../problems/personal_blog.json";
import { analyze } from "../sim/analyze";
import type { Problem } from "../types";
import { REFERENCE_DESIGNS, blogDesign } from "./referenceDesigns";

const P = blog as unknown as Problem;
const run = (d = REFERENCE_DESIGNS.personal_blog) => analyze(d, P);
const scenario = (r: ReturnType<typeof run>, id: string) => r.scenarios.find((s) => s.scenarioId === id)!;
const met = (r: ReturnType<typeof run>) => Object.fromEntries(r.requirements.map((q) => [q.id, q.met]));

describe("personal blog: reference design", () => {
  const r = run();
  it("passes every scenario and every requirement", () => {
    expect(r.scenarios.every((s) => s.pass)).toBe(true);
    expect(Object.values(met(r)).every((m) => m === true)).toBe(true);
  });
  it("is done by the app's own rule: every scenario passes and the score is at least 80", () => {
    expect(r.score).toBeGreaterThanOrEqual(80);
  });
  it("stays inside the budget with room to spare", () => {
    expect(r.cost).toBeLessThan(P.budget! * 0.9);
  });
});

describe("personal blog: flawed variants fail for the intended reason", () => {
  it("one default-sized server cannot carry the shared post, and has nothing to fall back on", () => {
    const r = run(blogDesign({ replicas: 1, capacity: 1000, balancer: false }));
    expect(scenario(r, "normal").pass).toBe(true); // a quiet day is fine: the flaw only shows under pressure
    expect(scenario(r, "front_page").pass).toBe(false);
    expect(scenario(r, "front_page").served).toBeCloseTo(1000 / 1200, 6); // 1,200 a second against a server that answers 1,000
    expect(scenario(r, "server_down").pass).toBe(false);
    expect(met(r)["r-front"]).toBe(false);
    expect(met(r)["r-down"]).toBe(false);
  });
  it("names what produced it: the server is saturated, and it is a single copy", () => {
    const r = run(blogDesign({ replicas: 1, capacity: 1000, balancer: false }));
    const ids = r.findings.map((f) => f.id);
    expect(ids).toContain("single-instance");
    expect(ids).toContain("sat-s");
    expect(scenario(r, "front_page").saturated).toContain("s");
    const fp = scenario(r, "front_page");
    expect([...fp.notes, ...fp.advice.map((a) => a.change)].join(" ")).toMatch(/Server/);
  });
  it("one huge server survives the shared post but not its own failure, and costs more", () => {
    const big = run(blogDesign({ replicas: 1, capacity: 2000, balancer: false }));
    expect(scenario(big, "front_page").pass).toBe(true);
    expect(scenario(big, "server_down").pass).toBe(false);
    expect(big.cost).toBeGreaterThan(run().cost * 0.9);
  });
  it("two copies that are too small survive a failure but not the shared post", () => {
    const r = run(blogDesign({ replicas: 2, capacity: 500 }));
    expect(scenario(r, "server_down").pass).toBe(true);
    expect(scenario(r, "front_page").pass).toBe(false);
  });
  it("copies sized for the surge but kept for no reason cost too much", () => {
    const r = run(blogDesign({ replicas: 6, capacity: 2000, dbCapacity: 4000 }));
    expect(met(r)["r-budget"]).toBe(false);
  });
});

describe("personal blog: the problem itself", () => {
  it("has a scenario for the learning objective and uses only blocks Module 0 teaches", () => {
    expect(P.scenarios.map((s) => s.id)).toEqual(["normal", "front_page", "server_down"]);
    const used = new Set(REFERENCE_DESIGNS.personal_blog.nodes.map((n) => n.blockId));
    expect([...used].sort()).toEqual(["database", "load_balancer", "server", "user"]);
  });
});
