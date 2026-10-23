import { analyze } from "../src/sim/analyze";
import { BLOCK_MAP, defaultCfg, money } from "../src/blocks";
import ad from "../src/problems/ad_serving.json";
import type { Problem } from "../src/types";
const A = ad as unknown as Problem;
const mk = (id: string, blockId: string, over: Record<string, unknown> = {}, caps?: string[]) => ({ id, blockId, cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over }, responsibilities: [] as string[], capabilities: caps });
const e = (s: string, t: string, kind: "sync" | "async" = "sync") => ({ id: s + t + kind, source: s, target: t, kind });
const au = { users: 1200000, reqPerUser: 0.05 };
const run = (name: string, d: any) => {
  const r = analyze(d, A);
  console.log(`\n== ${name}: score ${r.score}, cost ${money(r.cost)} / ${money(r.budget!)}`);
  for (const s of r.scenarios) console.log("  ", s.scenarioId.padEnd(14), "served", s.served.toFixed(2), "lat", String(Math.round(s.latencyMs)).padStart(4), s.pass ? "PASS" : "FAIL", s.notes.join(" | ").slice(0, 150));
  console.log("   req:", r.requirements.map((x) => x.id.replace("r-", "") + "=" + (x.met === null ? "ai" : x.met ? "ok" : "NO")).join(" "));
};
const common = [mk("u", "user", au), mk("lb", "load_balancer", { instances: 3 }), mk("c", "cache", { capacity: 100000, replicas: 3, hitRatio: 0.97, requestCoalescing: true }), mk("db", "database", { readReplicas: 2 }), mk("q", "queue", { partitions: 8 })];
run("microservices", {
  nodes: [...common,
    mk("ads", "server", { capacity: 1500, replicas: 56, autoscale: true, maxReplicas: 130, circuitBreaker: true, timeoutMs: 50 }, ["pick_ad"]),
    mk("rank", "service", { capacity: 2000, replicas: 42, autoscale: true, maxReplicas: 110 }, ["ranking"]),
    mk("w", "worker", { capacity: 200, replicas: 60, autoscale: true, maxReplicas: 140, idempotent: true, batchSize: 40 }, ["event_logging"])],
  edges: [e("u", "lb"), e("lb", "ads"), e("ads", "rank"), e("ads", "c"), e("c", "db"), e("ads", "q", "async"), e("q", "w")],
});
run("monolith (ranking inside the ad server)", {
  nodes: [...common,
    mk("ads", "server", { capacity: 1500, replicas: 105, autoscale: true, maxReplicas: 240, circuitBreaker: true, timeoutMs: 50 }, ["pick_ad", "ranking"]),
    mk("w", "worker", { capacity: 200, replicas: 60, autoscale: true, maxReplicas: 140, idempotent: true, batchSize: 40 }, ["event_logging"])],
  edges: [e("u", "lb"), e("lb", "ads"), e("ads", "c"), e("c", "db"), e("ads", "q", "async"), e("q", "w")],
});
