import { describe, expect, it } from "vitest";
import { BLOCK_MAP, defaultCfg } from "../blocks";
import { analyze } from "./analyze";
import { diagnoseNode } from "./diagnose";
import { blocksNamed, walkthrough } from "./walkthrough";
import library from "../problems/library_management.json";
import shortener from "../problems/url_shortener.json";
import type { Design, Problem } from "../types";

const mk = (id: string, blockId: string, over: Record<string, unknown> = {}, caps?: string[]) => ({
  id,
  blockId,
  cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over },
  responsibilities: [] as string[],
  capabilities: caps,
});
const e = (s: string, t: string) => ({ id: s + t, source: s, target: t, kind: "sync" as const });

const L = library as unknown as Problem;
const U = shortener as unknown as Problem;

const libraryDesign = (indexes: string[]): Design => ({
  nodes: [
    mk("u", "user", { users: 60000, reqPerUser: 0.05 }),
    mk("lb", "load_balancer", { instances: 2, capacity: 20000 }),
    mk("s", "server", { capacity: 1000, replicas: 6, autoscale: true, maxReplicas: 18 }, ["search", "checkout"]),
    mk("si", "search_index", { capacity: 3000, replicas: 2 }),
    mk("db", "database", { capacity: 1600, readReplicas: 1, consistency: "Row locks", indexes }),
  ],
  edges: [e("u", "lb"), e("lb", "s"), e("s", "si"), e("s", "db")],
});

describe("blocksNamed", () => {
  it("finds block kinds in a sentence, including plurals", () => {
    const ids = blocksNamed("A Server reads a Cache in front of a Database, and Workers drain the Queue.").map((b) => b.blockId);
    expect(ids).toEqual(expect.arrayContaining(["server", "cache", "database", "worker", "queue"]));
  });
  it("does not mistake Service for Server", () => {
    const ids = blocksNamed("A Service handles it.").map((b) => b.blockId);
    expect(ids).toContain("service");
    expect(ids).not.toContain("server");
  });
});

describe("walkthrough", () => {
  it("marks which named blocks the learner's design has", () => {
    const w = walkthrough(U, libraryDesign([]))!;
    expect(w.steps.length).toBe(U.reference!.design.length);
    const first = w.steps[0].blocks;
    expect(first.find((b) => b.blockId === "load_balancer")?.have).toBe(true);
    expect(first.find((b) => b.blockId === "queue" || b.blockId === "worker")).toBeUndefined();
    const queueStep = w.steps.find((s) => s.blocks.some((b) => b.blockId === "queue"))!;
    expect(queueStep.blocks.find((b) => b.blockId === "queue")?.have).toBe(false);
    expect(w.covered).toBeLessThan(w.total);
  });
});

describe("diagnoseNode", () => {
  it("blames the missing index when queries read far too much", () => {
    const d = libraryDesign(["books:id,isbn"]);
    const run = analyze(d, L);
    const sc = run.scenarios[0];
    const out = diagnoseNode(
      d.nodes.find((n) => n.id === "db")!,
      sc.nodes.db,
      sc,
      run.findings,
      d,
      L,
    );
    expect(out?.tone).toBe("bad");
    expect(out?.causes.join(" ")).toMatch(/times the work it needs/);
    expect(out?.tries.join(" ")).toMatch(/tune the queries/);
  });
  it("says nothing about a block that is fine", () => {
    const d = libraryDesign(["books:isbn", "loans:member_id,due_date"]);
    const run = analyze(d, L);
    const sc = run.scenarios[0];
    expect(
      diagnoseNode(
        d.nodes.find((n) => n.id === "db")!,
        sc.nodes.db,
        sc,
        run.findings,
        d,
        L,
      ),
    ).toBeUndefined();
  });
  it("never explains the user block", () => {
    const d = libraryDesign([]);
    const run = analyze(d, L);
    expect(diagnoseNode(d.nodes[0], run.scenarios[0].nodes.u, run.scenarios[0], run.findings, d, L)).toBeUndefined();
  });
});
