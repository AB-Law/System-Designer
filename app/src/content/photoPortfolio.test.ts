import { describe, expect, it } from "vitest";
import portfolio from "../problems/photo_portfolio.json";
import { analyze } from "../sim/analyze";
import type { Design, Problem } from "../types";
import { REFERENCE_DESIGNS, portfolioDesign } from "./referenceDesigns";

const P = portfolio as unknown as Problem;
const run = (d: Design = REFERENCE_DESIGNS.photo_portfolio) => analyze(d, P);
type Run = ReturnType<typeof run>;
const scenario = (r: Run, id: string) => r.scenarios.find((s) => s.scenarioId === id)!;
const met = (r: Run) => Object.fromEntries(r.requirements.map((q) => [q.id, q.met]));

describe("photo portfolio: reference design", () => {
  const r = run();
  it("passes every scenario and every requirement the simulator can decide", () => {
    expect(r.scenarios.every((s) => s.pass)).toBe(true);
    const decided = r.requirements.filter((q) => q.met !== null);
    expect(decided.length).toBe(5);
    expect(decided.every((q) => q.met === true)).toBe(true);
    expect(met(r)["r-origin"]).toBeNull(); // judged by the AI review, not by the simulator
  });
  it("is done by the app's own rule: every scenario passes and the score is at least 80", () => {
    expect(r.score).toBeGreaterThanOrEqual(80);
  });
  it("stays inside the budget", () => {
    expect(r.cost).toBeLessThan(P.budget!);
  });
  it("lets only a fraction of a featured surge reach the servers", () => {
    // 5,000 requests a second arrive. 1% are writes, which the edge never answers. Of the 99% reads, the CDN answers
    // 90% x 90% = 81% (a 90% hit ratio on the 90% of traffic that is static), so 19% of the reads go on.
    expect(scenario(r, "featured").nodes["lb"].incoming).toBeCloseTo(5000 * (0.01 + 0.99 * (1 - 0.9 * 0.9)), 6);
  });
});

describe("photo portfolio: flawed variants fail for the intended reason", () => {
  it("no CDN: the servers and database take every request, so a featured gallery overwhelms them", () => {
    const r = run(portfolioDesign({ replicas: 3, dbCapacity: 2000, cdn: false }));
    expect(scenario(r, "normal").pass).toBe(true);
    expect(scenario(r, "featured").pass).toBe(false);
    expect(met(r)["r-featured"]).toBe(false);
    expect(met(r)["r-edge"]).toBe(false);
    expect(met(r)["r-store"]).toBe(true);
    const fp = scenario(r, "featured");
    expect(fp.saturated.length).toBeGreaterThan(0);
    expect(r.findings.some((f) => f.id.startsWith("sat-"))).toBe(true);
  });
  it("no CDN: buying enough servers and database to cope breaks the budget instead", () => {
    // sweep a wide grid of server counts and database sizes: none passes the surge inside the budget
    let passes = 0;
    for (let replicas = 1; replicas <= 12; replicas++)
      for (const dbCapacity of [1500, 2500, 4000, 6000, 8000]) {
        const r = run(portfolioDesign({ replicas, dbCapacity, cdn: false }));
        if (scenario(r, "featured").pass && r.cost <= P.budget!) passes++;
      }
    expect(passes).toBe(0);
    const big = run(portfolioDesign({ replicas: 6, dbCapacity: 5000, cdn: false }));
    expect(scenario(big, "featured").pass).toBe(true);
    expect(met(big)["r-budget"]).toBe(false);
  });
  it("a CDN with no durable origin passes the traffic scenarios but fails the storage requirement", () => {
    const r = run(portfolioDesign({ replicas: 2, blob: false }));
    expect(r.scenarios.every((s) => s.pass)).toBe(true); // the simulator never loses a file, so only the requirement can say so
    expect(met(r)["r-store"]).toBe(false);
    expect(met(r)["r-edge"]).toBe(true);
    const detail = r.requirements.find((q) => q.id === "r-store")!.detail;
    expect(detail).toMatch(/Missing: Blob Storage/);
    expect(r.requirements.some((q) => q.id === "r-origin")).toBe(true); // the written explanation is asked for separately
  });
  it("a CDN left at its default 'static share' does not take enough off the servers", () => {
    const r = run(portfolioDesign({ replicas: 2, cdn: { staticShare: 0.3 } }));
    expect(scenario(r, "featured").pass).toBe(false);
    expect(r.findings.some((f) => f.id.startsWith("sat-"))).toBe(true);
  });
  it("a CDN sized far above what the traffic needs costs more than it saves", () => {
    const r = run(portfolioDesign({ replicas: 2, cdn: { capacity: 100000 } }));
    expect(scenario(r, "featured").pass).toBe(true);
    expect(r.cost).toBeGreaterThan(run().cost);
  });
});

describe("photo portfolio: the problem itself", () => {
  it("uses only blocks Module 0 teaches", () => {
    const used = new Set(REFERENCE_DESIGNS.photo_portfolio.nodes.map((n) => n.blockId));
    expect([...used].sort()).toEqual(["blob_storage", "cdn", "database", "load_balancer", "server", "user"]);
  });
  it("has a scenario that checks the learning objective", () => {
    expect(P.scenarios.map((s) => s.id)).toEqual(["normal", "featured"]);
    expect(P.requirements.some((q) => q.check.type === "scenario" && q.check.scenario === "featured")).toBe(true);
  });
});
