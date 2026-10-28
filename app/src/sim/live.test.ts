import { describe, expect, it } from "vitest";
import { BLOCK_MAP, defaultCfg } from "../blocks";
import { captionFor, droppedPerSec, edgeFlows, liveScenario, nodeVisual, nodeVisuals, runLive, stepQueues } from "./live";
import library from "../problems/library_management.json";
import type { Design, NodeResult, Problem } from "../types";

const mk = (id: string, blockId: string, over: Record<string, unknown> = {}, caps?: string[]) => ({
  id,
  blockId,
  cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over },
  responsibilities: [] as string[],
  capabilities: caps,
});
const e = (s: string, t: string) => ({ id: s + t, source: s, target: t, kind: "sync" as const });
const L = library as unknown as Problem;

const design = (replicas: number): Design => ({
  nodes: [
    mk("u", "user", { users: 60000, reqPerUser: 0.05 }),
    mk("lb", "load_balancer", { instances: 2, capacity: 20000 }),
    mk("s", "server", { capacity: 1000, replicas, autoscale: false }, ["search", "checkout"]),
    mk("db", "database", { capacity: 1600, readReplicas: 1 }),
  ],
  edges: [e("u", "lb"), e("lb", "s"), e("s", "db")],
});

const nr = (over: Partial<NodeResult>): NodeResult => ({
  id: "x",
  incoming: 100,
  handled: 100,
  dropped: 0,
  utilization: 0.3,
  latencyMs: 5,
  work: 1,
  ...over,
});

describe("nodeVisual", () => {
  it("maps utilization to a state with a text cue", () => {
    expect(nodeVisual(nr({}), "server").state).toBe("healthy");
    expect(nodeVisual(nr({ utilization: 0.85 }), "server").state).toBe("busy");
    expect(nodeVisual(nr({ utilization: 1.2, dropped: 10 }), "server").state).toBe("saturated");
    expect(nodeVisual(nr({ utilization: 3, dropped: 60 }), "server").state).toBe("failing");
    const down = nodeVisual(nr({ down: true }), "server");
    expect(down.state).toBe("down");
    expect(down.label).toBe("Down");
  });
  it("leaves users and idle blocks unmarked", () => {
    expect(nodeVisual(nr({ utilization: 5 }), "user").state).toBe("idle");
    expect(nodeVisual(nr({ incoming: 0 }), "server").state).toBe("idle");
    expect(nodeVisual(undefined, "server").state).toBe("idle");
  });
  it("shows a surviving killed block as having lost a copy, not as healthy", () => {
    expect(nodeVisual(nr({}), "cdn", 0, true).state).toBe("degraded");
    expect(nodeVisual(nr({}), "cdn", 0, true).label).toBe("Lost a copy");
    expect(nodeVisual(nr({ utilization: 1.2, dropped: 10 }), "cdn", 0, true).state).toBe("saturated");
    expect(nodeVisual(nr({ down: true }), "cdn", 0, true).state).toBe("down");
    expect(nodeVisual(nr({}), "cdn", 0, false).state).toBe("healthy");
  });
  it("carries queue depth", () => {
    expect(nodeVisual(nr({}), "queue", 12).queue).toBe(12);
    expect(nodeVisual(nr({}), "queue", 0).queue).toBeUndefined();
  });
});

describe("stepQueues", () => {
  it("grows while behind, then drains", () => {
    const grown = stepQueues({}, { q: 100 }, 2);
    expect(grown.q).toBe(200);
    const drained = stepQueues(grown, {}, 1);
    expect(drained.q).toBeCloseTo(100);
    expect(stepQueues({ q: 1.2 }, {}, 5).q).toBeUndefined();
  });
});

describe("live scenarios", () => {
  it("builds steady, spike and kill scenarios", () => {
    expect(liveScenario(undefined, { spike: false }).trafficMultiplier).toBe(1);
    expect(liveScenario(undefined, { spike: true }).trafficMultiplier).toBeGreaterThanOrEqual(3);
    expect(liveScenario(undefined, { spike: false, killed: ["s"] }).failure?.target.nodeId).toBe("s");
  });

  it("carries traffic along connections and marks dead ones", () => {
    const d = design(1);
    const steady = runLive(d, L, undefined, { spike: false });
    const f = edgeFlows(d, steady);
    expect(f.ulb.rate).toBeGreaterThan(0);
    expect(f.ulb.particles).toBeGreaterThan(0);
    expect(Object.values(f).every((x) => !x.dead)).toBe(true);
    const killed = runLive(design(1), L, undefined, { spike: false, killed: ["s"] });
    const fk = edgeFlows(d, killed);
    expect(fk.lbs.dead).toBe(true);
    expect(fk.lbs.particles).toBe(0);
    expect(nodeVisuals(design(1), killed).s.state).toBe("down");
  });

  it("a spike overloads a thin design and the caption says why", () => {
    const d = design(1);
    const steady = runLive(d, L, undefined, { spike: false });
    const spike = runLive(d, L, undefined, { spike: true });
    expect(spike.offered).toBeGreaterThan(steady.offered);
    expect(droppedPerSec(spike)).toBeGreaterThanOrEqual(droppedPerSec(steady));
    const cap = captionFor(d, L, spike, steady, { spike: true });
    expect(cap.what).toMatch(/Traffic jumped/);
    expect(cap.why.length).toBeGreaterThan(10);
  });

  it("killing one of several copies says a copy went down, not the whole block", () => {
    const d = design(3);
    const steady = runLive(d, L, undefined, { spike: false });
    const killed = runLive(d, L, undefined, { spike: false, killed: ["s"] });
    expect(killed.nodes["s"].down).toBeFalsy();
    const cap = captionFor(d, L, killed, steady, { spike: false, killed: ["s"] });
    expect(cap.what).toMatch(/One copy of Server went down/);
  });

  it("a CDN with spare copies survives a kill and is shown as having lost one", () => {
    const d: Design = {
      nodes: [mk("u", "user"), mk("c", "cdn"), mk("s", "server", {}, ["search", "checkout"])],
      edges: [e("u", "c"), e("c", "s")],
    };
    const steady = runLive(d, L, undefined, { spike: false });
    const killed = runLive(d, L, undefined, { spike: false, killed: ["c"] });
    const vis = nodeVisuals(d, killed, {}, ["c"]);
    const cap = captionFor(d, L, killed, steady, { spike: false, killed: ["c"] });
    if (killed.nodes["c"].down) expect(vis["c"].state).toBe("down");
    else {
      expect(vis["c"].state).toBe("degraded");
      expect(cap.what).toMatch(/One copy of CDN went down/);
    }
    expect(cap.what).not.toMatch(/^CDN went down, and 100%/);
  });

  it("killing the only server is called out as a loss", () => {
    const d = design(1);
    const steady = runLive(d, L, undefined, { spike: false });
    const killed = runLive(d, L, undefined, { spike: false, killed: ["s"] });
    const cap = captionFor(d, L, killed, steady, { spike: false, killed: ["s"] });
    expect(cap.tone).toBe("bad");
    expect(cap.what).toMatch(/Server went down/);
  });
});

describe("killing several blocks at once", () => {
  it("scenario lists every killed block", () => {
    const s = liveScenario(undefined, { spike: false, killed: ["a", "b", "c"] });
    expect(s.failure?.target.nodeId).toBe("a");
    expect(s.alsoDown?.map((f) => f.target.nodeId)).toEqual(["b", "c"]);
  });
});
