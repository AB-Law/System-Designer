import { describe, expect, it } from "vitest";
import contact from "../problems/contact_form.json";
import { analyze } from "../sim/analyze";
import type { Design, Problem } from "../types";
import { REFERENCE_DESIGNS, contactDesign } from "./referenceDesigns";

const P = contact as unknown as Problem;
const run = (d: Design = REFERENCE_DESIGNS.contact_form) => analyze(d, P);
type Run = ReturnType<typeof run>;
const scenario = (r: Run, id: string) => r.scenarios.find((s) => s.scenarioId === id)!;
const met = (r: Run) => Object.fromEntries(r.requirements.map((q) => [q.id, q.met]));

describe("contact form: reference design", () => {
  const r = run();
  it("passes every scenario and every requirement the simulator can decide", () => {
    expect(r.scenarios.every((s) => s.pass)).toBe(true);
    const decided = r.requirements.filter((q) => q.met !== null);
    expect(decided.length).toBe(6);
    expect(decided.every((q) => q.met === true)).toBe(true);
    expect(met(r)["r-retry"]).toBeNull(); // judged by the AI review: the simulator does not play out retries
  });
  it("is done by the app's own rule: every scenario passes and the score is at least 80", () => {
    expect(r.score).toBeGreaterThanOrEqual(80);
  });
  it("stays inside the budget", () => {
    expect(r.cost).toBeLessThan(P.budget!);
  });
  it("accepts quickly while delivery is later: the form responds fast even when the provider is down", () => {
    expect(scenario(r, "normal").latencyMs).toBeLessThanOrEqual(P.latencyTargetMs);
    expect(scenario(r, "provider_down").pass).toBe(true);
    expect(scenario(r, "provider_down").served).toBe(1);
  });
});

describe("contact form: delivery done inside the request", () => {
  // idempotency keys on, so the only thing wrong is that delivery is part of the request
  const inline = run(contactDesign({ inline: true, idempotencyKeys: true }));
  it("makes the visitor wait for the provider, so the form is too slow on a normal day", () => {
    expect(scenario(inline, "normal").latencyMs).toBeGreaterThan(P.latencyTargetMs);
    expect(met(inline)["r-fast"]).toBe(false);
  });
  it("stops accepting messages when the provider is down", () => {
    expect(scenario(inline, "provider_down").pass).toBe(false);
    expect(scenario(inline, "provider_down").served).toBe(0);
    expect(met(inline)["r-provider"]).toBe(false);
  });
  it("says why: delivery shares the server with accepting, and nothing connects asynchronously", () => {
    expect(inline.findings.map((f) => f.id)).toContain("shared-fate-s");
    expect(met(inline)["r-async"]).toBe(false);
  });
  it("buying more servers does not fix it", () => {
    const more = run({
      ...contactDesign({ inline: true, idempotencyKeys: true }),
      nodes: contactDesign({ inline: true, idempotencyKeys: true }).nodes.map((n) =>
        n.id === "s" ? { ...n, cfg: { ...n.cfg, replicas: 10 } } : n,
      ),
    });
    expect(met(more)["r-fast"]).toBe(false);
    expect(met(more)["r-provider"]).toBe(false);
  });
});

describe("contact form: the queue is wired as an ordinary connection", () => {
  it("still waits for the provider, because the connection is not asynchronous", () => {
    const r = run(contactDesign({ asyncEdge: false }));
    expect(scenario(r, "normal").latencyMs).toBeGreaterThan(P.latencyTargetMs);
    expect(met(r)["r-async"]).toBe(false);
    expect(met(r)["r-provider"]).toBe(false);
  });
});

describe("contact form: retries without a safe repeat", () => {
  const unsafe = run(contactDesign({ idempotent: false, retries: 3 }));
  it("fails every scenario for the repeat reason, with nothing overloaded", () => {
    for (const s of unsafe.scenarios) {
      expect(s.pass).toBe(false);
      expect(s.saturated).toEqual([]);
    }
  });
  it("says a retried message can be sent twice", () => {
    const ids = unsafe.findings.map((f) => f.id);
    expect(ids).toContain("worker-idempotency");
    expect(ids).toContain("guarantee-idempotent-deliver-w");
    expect(unsafe.findings.find((f) => f.id === "worker-idempotency")!.message).toMatch(/applied twice/);
  });
  it("turning retries off does not satisfy the simulator; it is the repeat-safety that is checked", () => {
    // a worker that never retries has no repeat to make safe, but delivery still requires an idempotent worker
    const noRetry = run(contactDesign({ idempotent: false, retries: 0 }));
    expect(scenario(noRetry, "normal").pass).toBe(false);
  });
});

describe("contact form: limits of what the simulator can check", () => {
  it("cannot tell a design that retries from one that does not: that part is judged by the written explanation", () => {
    const retries = run(contactDesign({ retries: 3 }));
    const none = run(contactDesign({ retries: 0 }));
    expect(retries.scenarios.map((s) => s.pass)).toEqual(none.scenarios.map((s) => s.pass));
    expect(P.requirements.find((q) => q.id === "r-retry")!.check.type).toBe("ai");
  });
  it("two workers cannot keep up with a campaign", () => {
    const r = run(contactDesign({ workers: 2 }));
    expect(scenario(r, "campaign").pass).toBe(false);
    expect(scenario(r, "campaign").saturated).toContain("w");
  });
});

describe("contact form: the problem itself", () => {
  it("has scenarios for the learning objective and uses Module 0 to 2 blocks", () => {
    expect(P.scenarios.map((s) => s.id)).toEqual(["normal", "campaign", "provider_down"]);
    const used = new Set(REFERENCE_DESIGNS.contact_form.nodes.map((n) => n.blockId));
    expect([...used].sort()).toEqual(["queue", "server", "third_party", "user", "worker"]);
  });
});
