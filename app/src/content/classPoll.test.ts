import { describe, expect, it } from "vitest";
import poll from "../problems/class_poll.json";
import { analyze } from "../sim/analyze";
import { unmetGuarantees } from "../sim/caps";
import type { Design, Problem } from "../types";
import { REFERENCE_DESIGNS, pollDesign } from "./referenceDesigns";

const P = poll as unknown as Problem;
const run = (d: Design = REFERENCE_DESIGNS.class_poll) => analyze(d, P);
type Run = ReturnType<typeof run>;
const scenario = (r: Run, id: string) => r.scenarios.find((s) => s.scenarioId === id)!;
const met = (r: Run) => Object.fromEntries(r.requirements.map((q) => [q.id, q.met]));
const design = (o: Partial<Parameters<typeof pollDesign>[0]>) =>
  pollDesign({ replicas: 3, capacity: 500, dbCapacity: 2000, locking: "Row locks", ...o });

describe("class poll: reference design", () => {
  const r = run();
  it("passes every scenario and every requirement the simulator can decide", () => {
    expect(r.scenarios.every((s) => s.pass)).toBe(true);
    const decided = r.requirements.filter((q) => q.met !== null);
    expect(decided.length).toBe(4);
    expect(decided.every((q) => q.met === true)).toBe(true);
    expect(met(r)["r-both"]).toBeNull(); // judged by the AI review
  });
  it("is done by the app's own rule: every scenario passes and the score is at least 80", () => {
    expect(r.score).toBeGreaterThanOrEqual(80);
  });
  it("stays inside the budget", () => {
    expect(r.cost).toBeLessThan(P.budget!);
  });
  it("protects the vote with a lock, so no guarantee is unmet", () => {
    expect(unmetGuarantees(design({}), "s", P.capabilities!)).toEqual([]);
  });
});

describe("class poll: the flawed variant fails for the lock reason", () => {
  // the same design with the same sizing, and the database's Locking turned off
  const flawed = run(design({ locking: "Eventual" }));
  it("fails every scenario, not because anything is overloaded but because a vote can be lost", () => {
    expect(scenario(flawed, "normal").pass).toBe(false);
    expect(scenario(flawed, "opening").pass).toBe(false);
    for (const id of ["normal", "opening"]) expect(scenario(flawed, id).saturated).toEqual([]); // no block is full
  });
  it("names the lock in its finding and in its notes", () => {
    expect(flawed.findings.map((f) => f.id)).toContain("guarantee-exclusive_access-vote-s");
    const finding = flawed.findings.find((f) => f.id.startsWith("guarantee-exclusive_access"))!;
    expect(finding.severity).toBe("bad");
    expect(finding.message).toMatch(/exclusive access \(locks\)/);
    expect(scenario(flawed, "opening").notes.join(" ")).toMatch(/needs exclusive access \(locks\)/);
  });
  it("the same design with locks passes, so the lock is the only difference", () => {
    expect(run(design({})).scenarios.every((s) => s.pass)).toBe(true);
    expect(flawed.score).toBeLessThan(run().score);
    expect(flawed.score).toBeLessThan(80);
  });
  it("it is the lock check, not the capacity: a hugely oversized design with no lock still fails", () => {
    const big = run(design({ locking: "Eventual", replicas: 8, dbCapacity: 8000 }));
    expect(scenario(big, "opening").pass).toBe(false);
    expect(met(big)["r-open"]).toBe(false);
  });
});

describe("class poll: what the lock costs", () => {
  it("locks make writes slower, so an undersized database no longer keeps up", () => {
    const small = run(design({ dbCapacity: 1200 }));
    expect(scenario(small, "opening").pass).toBe(false);
    expect(scenario(small, "opening").saturated).toContain("db");
  });
  it("stricter locking is correct but costs more capacity again", () => {
    const strict = run(design({ locking: "Serializable", dbCapacity: 2000 }));
    expect(scenario(strict, "opening").latencyMs).toBeGreaterThan(scenario(run(), "opening").latencyMs);
    expect(run(design({ locking: "Serializable", dbCapacity: 3000 })).scenarios.every((s) => s.pass)).toBe(true);
  });
  it("too few servers fails the opening burst for a capacity reason", () => {
    const r = run(design({ replicas: 2 }));
    expect(scenario(r, "opening").pass).toBe(false);
    expect(scenario(r, "opening").saturated).toContain("s");
  });
});

describe("class poll: the problem itself", () => {
  it("claims only a protected update, nothing about a scalable counter", () => {
    expect(JSON.stringify(P).toLowerCase()).not.toMatch(/scalable counter|sharded counter/);
    expect(P.rubric.join(" ")).toMatch(/no claim to handle unlimited voters/);
  });
  it("uses only blocks Modules 0 and 1 teach", () => {
    const used = new Set(REFERENCE_DESIGNS.class_poll.nodes.map((n) => n.blockId));
    expect([...used].sort()).toEqual(["database", "load_balancer", "server", "user"]);
  });
  it("has scenarios that check the learning objective", () => {
    expect(P.scenarios.map((s) => s.id)).toEqual(["normal", "opening"]);
    expect(P.capabilities![0].requires).toEqual(["exclusive_access"]);
  });
});
