// Reads and writes are different classes: replicas and caches only help reads, shards and queues help writes.
import { analyze } from "../src/sim/analyze";
import { BLOCK_MAP, defaultCfg } from "../src/blocks";
import lb from "../src/problems/library_management.json";
import type { Problem } from "../src/types";

// the library without its data model, and with checkouts as pure writes, so only the read/write principle is under test
const P = { ...(lb as unknown as Problem), dataModel: undefined, capabilities: (lb as unknown as Problem).capabilities!.map((c) => (c.id === "checkout" ? { ...c, writes: 1 } : c)) } as Problem;
const mk = (id: string, blockId: string, over: Record<string, unknown> = {}, caps?: string[]) => ({
  id, blockId, cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over }, responsibilities: [] as string[], capabilities: caps,
});
const e = (s: string, t: string) => ({ id: s + t, source: s, target: t, kind: "sync" as const });

const design = (db: Record<string, unknown>, cache = false) => ({
  nodes: [
    mk("u", "user", { users: 60000, reqPerUser: 0.05 }),
    mk("lb", "load_balancer", { instances: 2, capacity: 20000 }),
    mk("s", "server", { capacity: 1000, replicas: 6, autoscale: true, maxReplicas: 18 }, ["search", "checkout"]),
    ...(cache ? [mk("c", "cache", { hitRatio: 0.95, replicas: 2 })] : []),
    mk("si", "search_index", { capacity: 3000, replicas: 2 }),
    mk("db", "database", { consistency: "Row locks", ...db }),
    mk("w", "worker", { capacity: 200, replicas: 1, idempotent: true }, ["reminders"]),
    mk("tp", "third_party", { capacity: 500, kind: "Email / SMS" }),
  ],
  edges: [e("u", "lb"), e("lb", "s"), e("s", "si"), ...(cache ? [e("s", "c"), e("c", "db")] : [e("s", "db")]), e("w", "tp"), e("w", "db")],
});

let fails = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : ""));
  if (!ok) fails++;
};
const rush = (d: ReturnType<typeof design>) => {
  const r = analyze(d, P).scenarios.find((s) => s.scenarioId === "rush")!;
  const db = r.nodes["db"];
  return { r, db, writes: db.incomingWrites ?? 0, reads: db.incoming - (db.incomingWrites ?? 0) };
};

// 1. a database that cannot take the write rate, however many replicas it has
const weak = rush(design({ capacity: 600, readReplicas: 1 }));
const manyReplicas = rush(design({ capacity: 600, readReplicas: 12 }));
const sharded = rush(design({ capacity: 600, readReplicas: 1, shards: 3 }));
check("weak database is overloaded by writes", weak.db.utilization > 1, `util ${weak.db.utilization.toFixed(2)}, writes/s ${Math.round(weak.writes)}`);
check("twelve replicas do not fix a write-bound database", manyReplicas.db.utilization > 1, `util ${manyReplicas.db.utilization.toFixed(2)}`);
check("shards do", sharded.db.utilization < 0.9, `util ${sharded.db.utilization.toFixed(2)}`);
check("the advice names writes and says replicas will not help", weak.r.advice.some((a) => /filled by writes/.test(a.change) && /replicas and caches do not help/.test(a.why)));

// 2. the checkout path is all writes: no cache in front of it can thin it
const noCache = rush(design({ capacity: 2000, readReplicas: 1 }));
const withCache = rush(design({ capacity: 2000, readReplicas: 1 }, true));
check("checkouts arrive at the database as writes", noCache.writes > 0 && noCache.reads < noCache.writes, `writes ${Math.round(noCache.writes)}, reads ${Math.round(noCache.reads)}`);
check("a cache in front of the database does not thin writes", withCache.writes >= noCache.writes * 0.99, `${Math.round(withCache.writes)} vs ${Math.round(noCache.writes)}`);

// 3. read-heavy traffic is the opposite: replicas and caches help
const readHeavy = (replicas: number, cache: boolean) => {
  const P2 = { ...P, capabilities: P.capabilities!.map((c) => (c.id === "search" ? { ...c, uses: ["database"] } : c)) } as Problem;
  const d = design({ capacity: 800, readReplicas: replicas }, cache);
  d.edges = d.edges.filter((x) => x.id !== "ssi");
  const r = analyze(d, P2).scenarios.find((s) => s.scenarioId === "rush")!;
  return r.nodes["db"];
};
const base = readHeavy(0, false);
check("read-heavy: replicas lower the database load", readHeavy(4, false).utilization < base.utilization * 0.6, `${base.utilization.toFixed(2)} -> ${readHeavy(4, false).utilization.toFixed(2)}`);
check("read-heavy: a cache lowers the database load", readHeavy(0, true).utilization < base.utilization * 0.6, `${base.utilization.toFixed(2)} -> ${readHeavy(0, true).utilization.toFixed(2)}`);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
