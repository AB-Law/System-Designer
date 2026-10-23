import { analyze } from "../src/sim/analyze";
import { BLOCK_MAP, defaultCfg, money } from "../src/blocks";
import pb from "../src/problems/pastebin.json";
import ad from "../src/problems/ad_serving.json";
import type { Problem } from "../src/types";
const mk = (id: string, blockId: string, over: Record<string, unknown> = {}) => ({ id, blockId, cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over }, responsibilities: [] as string[] });
const e = (s: string, t: string) => ({ id: s + t, source: s, target: t, kind: "sync" as const });
const line = (name: string, d: any, p: Problem) => {
  const r = analyze(d, p);
  console.log(`${name.padEnd(34)} score ${String(r.score).padStart(3)}  cost ${money(r.cost)} / ${money(r.budget!)}  ` + r.scenarios.map((s) => (s.pass ? "P" : "F")).join(""));
};
const P = pb as unknown as Problem;
const users = { users: 1500000, reqPerUser: 0.01 };
// brute force: absurd numbers typed everywhere
line("pastebin brute force", {
  nodes: [mk("u", "user", users), mk("s", "server", { capacity: 1e9, replicas: 1e6 }), mk("db", "database", { capacity: 1e9, readReplicas: 1e6, shards: 1e6 })],
  edges: [e("u", "s"), e("s", "db")],
}, P);
// brute force within the limits: max everything, no cache
line("pastebin max limits, no cache", {
  nodes: [mk("u", "user", users), mk("s", "server", { capacity: 5000, replicas: 500 }), mk("db", "database", { capacity: 10000, readReplicas: 15, shards: 64 })],
  edges: [e("u", "s"), e("s", "db")],
}, P);
// sensible
line("pastebin sensible", {
  nodes: [mk("u", "user", users), mk("lb", "load_balancer"), mk("s", "server", { capacity: 1000, replicas: 22 }), mk("c", "cache", { hitRatio: 0.95, replicas: 2 }), mk("db", "database", { readReplicas: 2 })],
  edges: [e("u", "lb"), e("lb", "s"), e("s", "c"), e("c", "db")],
}, P);
line("pastebin sensible + cdn", {
  nodes: [mk("u", "user", users), mk("cdn", "cdn", { cacheApi: true, hitRatio: 0.9 }), mk("lb", "load_balancer"), mk("s", "server", { capacity: 1000, replicas: 8 }), mk("c", "cache", { hitRatio: 0.95, replicas: 2 }), mk("db", "database", { readReplicas: 2 })],
  edges: [e("u", "cdn"), e("cdn", "lb"), e("lb", "s"), e("s", "c"), e("c", "db")],
}, P);
const A = ad as unknown as Problem;
const au = { users: 1200000, reqPerUser: 0.05 };
line("ads sensible", {
  nodes: [mk("u", "user", au), mk("lb", "load_balancer", { instances: 3 }), mk("ads", "server", { capacity: 1500, replicas: 56, autoscale: true, maxReplicas: 130, circuitBreaker: true, timeoutMs: 40 }), mk("rank", "service", { capacity: 2000, replicas: 40, autoscale: true, maxReplicas: 100 }), mk("c", "cache", { capacity: 100000, replicas: 3, hitRatio: 0.97, requestCoalescing: true }), mk("db", "database", { readReplicas: 2 }), mk("q", "queue", { partitions: 6 }), mk("w", "worker", { capacity: 200, replicas: 20, idempotent: true, batchSize: 20 })],
  edges: [e("u", "lb"), e("lb", "ads"), e("ads", "rank"), e("ads", "c"), e("c", "db"), { id: "aq", source: "ads", target: "q", kind: "async" as const }, e("q", "w")],
}, A);
{
  const d: any = {
    nodes: [mk("u", "user", au), mk("lb", "load_balancer", { instances: 3 }), mk("ads", "server", { capacity: 1500, replicas: 56, autoscale: true, maxReplicas: 130, circuitBreaker: true, timeoutMs: 40 }), mk("rank", "service", { capacity: 2000, replicas: 40, autoscale: true, maxReplicas: 100 }), mk("c", "cache", { capacity: 100000, replicas: 3, hitRatio: 0.97, requestCoalescing: true }), mk("db", "database", { readReplicas: 2 }), mk("q", "queue", { partitions: 8 }), mk("w", "worker", { capacity: 200, replicas: 60, autoscale: true, maxReplicas: 140, idempotent: true, batchSize: 40 })],
    edges: [e("u", "lb"), e("lb", "ads"), e("ads", "rank"), e("ads", "c"), e("c", "db"), { id: "aq", source: "ads", target: "q", kind: "async" as const }, e("q", "w")],
  };
  console.log("cost", money(analyze(d, A).cost));
  for (const s of analyze(d, A).scenarios) console.log("  ", s.scenarioId.padEnd(14), "served", s.served.toFixed(2), "lat", s.latencyMs.toFixed(0), s.pass ? "PASS" : "FAIL", s.notes.join(" "));
}
