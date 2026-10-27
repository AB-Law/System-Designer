import { describe, expect, it } from "vitest";
import { BLOCK_MAP, defaultCfg } from "../blocks";
import { analyze } from "./analyze";
import library from "../problems/library_management.json";
import shortener from "../problems/url_shortener.json";
import type { Design, Problem } from "../types";

// Guard from plan/01-protecting-system-designer.md: a fixed saved design must keep analyzing to the
// same result through the modular-platform work. If this fails after a move or refactor, behavior changed.

const mk = (id: string, blockId: string, over: Record<string, unknown> = {}, caps?: string[]) => ({
  id,
  blockId,
  cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over },
  responsibilities: [] as string[],
  capabilities: caps,
});
const e = (s: string, t: string) => ({ id: s + t, source: s, target: t, kind: "sync" as const });

const design: Design = {
  nodes: [
    mk("u", "user", { users: 60000, reqPerUser: 0.05 }),
    mk("lb", "load_balancer", { instances: 2, capacity: 20000 }),
    mk("s", "server", { capacity: 1000, replicas: 6, autoscale: true, maxReplicas: 18 }, ["search", "checkout"]),
    mk("si", "search_index", { capacity: 3000, replicas: 2 }),
    mk("db", "database", { capacity: 1600, readReplicas: 1, consistency: "Row locks", indexes: ["books:id,isbn"] }),
  ],
  edges: [e("u", "lb"), e("lb", "s"), e("s", "si"), e("s", "db")],
};

function summarize(problem: Problem) {
  const r = analyze(design, problem);
  return {
    score: r.score,
    cost: r.cost,
    scoreParts: r.scoreParts,
    confidence: r.confidence,
    scenarios: r.scenarios.map((s) => ({ id: s.scenarioId, score: s.score })),
    findings: r.findings.map((f) => f.id),
    requirements: r.requirements.map((q) => [q.id, q.met]),
  };
}

describe("golden design analysis", () => {
  it("library design stays stable", () => {
    expect(summarize(library as unknown as Problem)).toMatchSnapshot();
  });
  it("url shortener design stays stable", () => {
    expect(summarize(shortener as unknown as Problem)).toMatchSnapshot();
  });
  it("is deterministic", () => {
    const p = library as unknown as Problem;
    expect(summarize(p)).toEqual(summarize(p));
  });
});
