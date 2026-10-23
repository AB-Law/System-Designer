import { analyze } from "../src/sim/analyze";
import { BLOCK_MAP, defaultCfg, money } from "../src/blocks";
import pay from "../src/problems/payment.json";
import tk from "../src/problems/ticket_booking.json";
import rs from "../src/problems/ride_sharing.json";
import fd from "../src/problems/food_delivery.json";
import type { Problem } from "../src/types";

const mk = (id: string, blockId: string, over: Record<string, unknown> = {}, caps?: string[]) => ({
  id, blockId, cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over }, responsibilities: [] as string[], capabilities: caps,
});
const e = (s: string, t: string, kind: "sync" | "async" = "sync") => ({ id: s + t + kind, source: s, target: t, kind });
const show = (name: string, P: Problem, d: any) => {
  const r = analyze(d, P);
  console.log(`\n== ${P.id} / ${name}: score ${r.score}, cost ${money(r.cost)} / ${money(r.budget!)}`);
  for (const s of r.scenarios) console.log("  ", s.scenarioId.padEnd(14), "served", s.served.toFixed(2), "lat", String(Math.round(s.latencyMs)).padStart(4), s.pass ? "PASS" : "FAIL", s.notes.join(" | ").slice(0, 190));
  console.log("   req:", r.requirements.map((x) => x.id.replace("r-", "") + "=" + (x.met === null ? "ai" : x.met ? "ok" : "NO")).join(" "));
  const f = r.findings.filter((x) => x.severity === "bad" || x.severity === "warn").map((x) => x.id);
  if (f.length) console.log("   issues:", f.join(", "));
};
const only = process.argv[2];

// ------------------------------------------------------------------ payment
if (!only || only === "pay") {
  const P = pay as unknown as Problem;
  const d = (o: { keys?: boolean; consistency?: string; engine?: string; fraudCb?: boolean; fraudOnApi?: boolean; processor?: boolean } = {}) => ({
    nodes: [
      mk("u", "user", { users: 500000, reqPerUser: 0.003 }),
      mk("lb", "load_balancer", { instances: 2, capacity: 20000 }),
      mk("api", "server", { capacity: 500, replicas: 5, autoscale: true, maxReplicas: 12, idempotencyKeys: o.keys ?? true, circuitBreaker: o.fraudCb ?? true }, o.fraudOnApi ? ["charge", "fraud"] : ["charge"]),
      mk("lg", "service", { capacity: 1000, replicas: 3, autoscale: true, maxReplicas: 8 }, ["ledger"]),
      mk("db", "database", { capacity: 4000, shards: 2, readReplicas: 1, consistency: o.consistency ?? "Serializable", engine: o.engine ?? "Relational", indexes: ["ledger_entries:idem_key", "ledger_entries:account_id"], shardKeys: ["ledger_entries:account_id"] }),
      mk("ps", "service", { capacity: 1000, replicas: 3, autoscale: true, maxReplicas: 8 }, ["processor"]),
      mk("tp", "third_party", { capacity: 3500, kind: "Payment processor" }),
      ...(o.fraudOnApi ? [] : [mk("fs", "service", { capacity: 1000, replicas: 3, autoscale: true, maxReplicas: 10 }, ["fraud"])]),
      mk("q", "queue", { capacity: 10000 }),
      mk("rcw", "worker", { capacity: 200, replicas: 4, autoscale: true, maxReplicas: 12, idempotent: true }, ["receipt"]),
      mk("tp2", "third_party", { capacity: 3500, kind: "Email / SMS" }),
      mk("rc", "worker", { capacity: 200, replicas: 2, idempotent: true }, ["reconcile"]),
    ],
    edges: [
      e("u", "lb"), e("lb", "api"), e("api", "lg"), e("lg", "db"), e("api", "ps"), ...(o.processor === false ? [] : [e("ps", "tp")]),
      ...(o.fraudOnApi ? [] : [e("api", "fs")]), e("api", "q", "async"), e("q", "rcw"), e("rcw", "tp2"), e("rc", "db"), e("rc", "tp"),
    ],
  });
  show("keys, serializable ledger, fraud behind breaker", P, d());
  show("no idempotency keys", P, d({ keys: false }));
  show("ledger not serializable", P, d({ consistency: "Row locks" }));
  show("ledger on a key-value store", P, d({ engine: "Key-value" }));
  show("fraud check without a breaker", P, d({ fraudCb: false }));
  show("fraud inside the payment server", P, d({ fraudOnApi: true }));
}

// ------------------------------------------------------------------ ticket booking
if (!only || only === "tk") {
  const P = tk as unknown as Problem;
  const d = (o: { broker?: string; consistency?: string; payKeys?: boolean; direct?: boolean } = {}) => ({
    nodes: [
      mk("u", "user", { users: 400000, reqPerUser: 0.01 }),
      mk("lb", "load_balancer", { instances: 2, capacity: 20000 }),
      mk("web", "server", { capacity: 1000, replicas: 6, autoscale: true, maxReplicas: 16, circuitBreaker: true }, ["browse"]),
      mk("c", "cache", { capacity: 50000, replicas: 2, hitRatio: 0.95 }),
      mk("db", "database", { capacity: 2500, shards: 1, readReplicas: 1, consistency: o.consistency ?? "Row locks", indexes: ["seats:event_id,status,seat_no"] }),
      mk("st", o.broker ?? "stream", o.broker === "queue" ? { capacity: 5000, partitions: 2 } : { capacity: 5000, partitions: 2, retentionH: 24 }),
      mk("adm", "worker", { capacity: 200, replicas: 4, autoscale: true, maxReplicas: 16, idempotent: true, batchSize: 4 }, ["admit"]),
      mk("hold", "service", { capacity: 500, replicas: 3, autoscale: true, maxReplicas: 20, circuitBreaker: true }, ["hold"]),
      mk("pay", "service", { capacity: 500, replicas: 2, autoscale: true, maxReplicas: 10, idempotencyKeys: o.payKeys ?? true, circuitBreaker: true }, ["pay"]),
      mk("tp", "third_party", { capacity: 1500, kind: "Payment processor" }),
      mk("rel", "worker", { capacity: 200, replicas: 2, idempotent: true }, ["release"]),
    ],
    edges: [
      e("u", "lb"), e("lb", "web"), e("web", "c"), e("c", "db"),
      ...(o.direct ? [e("web", "hold")] : [e("web", "st", "async"), e("st", "adm"), e("adm", "hold")]),
      e("hold", "db"), e("hold", "pay"), e("pay", "tp"), e("rel", "db"),
    ],
  });
  show("stream line, row locks, payment keys", P, d());
  show("queue instead of stream", P, d({ broker: "queue" }));
  show("no locks on seats", P, d({ consistency: "Eventual" }));
  show("payment without idempotency keys", P, d({ payKeys: false }));
  show("no waiting line: buyers go straight to seats", P, d({ direct: true }));
}

// ------------------------------------------------------------------ ride sharing
if (!only || only === "rs") {
  const P = rs as unknown as Problem;
  const d = (o: { structure?: string; shards?: number; mapsLink?: boolean; etaCb?: boolean; lock?: string } = {}) => ({
    nodes: [
      mk("u", "user", { users: 300000, reqPerUser: 0.1 }),
      mk("lb", "load_balancer", { instances: 4, capacity: 20000 }),
      mk("loc", "server", { capacity: 2000, replicas: 10, autoscale: true, maxReplicas: 24 }, ["locate"]),
      mk("mt", "service", { capacity: 1000, replicas: 3, autoscale: true, maxReplicas: 20, circuitBreaker: o.etaCb ?? true, timeoutMs: 60 }, ["match"]),
      mk("geo", "geo_index", { capacity: 10000, shards: o.shards ?? 6, replicas: 2, structure: o.structure ?? "Geohash grid" }),
      mk("db", "database", { capacity: 1500, engine: "Key-value", consistency: o.lock ?? "Row locks", readReplicas: 1 }),
      mk("eta", "service", { capacity: 1000, replicas: 2, autoscale: true, maxReplicas: 6, circuitBreaker: true, timeoutMs: 80 }, ["eta"]),
      mk("tp", "third_party", { capacity: 1000, kind: "Maps / geo" }),
      mk("ws", "websocket", { capacity: 20000, replicas: 2 }, ["trip"]),
    ],
    edges: [
      e("u", "lb"), e("lb", "loc"), e("lb", "mt"), e("lb", "ws"), e("loc", "geo"), e("mt", "geo"), e("mt", "db"), e("mt", "eta"), ...(o.mapsLink === false ? [] : [e("eta", "tp")]),
    ],
  });
  show("grid index in 6 areas, row locks", P, d());
  show("R-tree (slow updates)", P, d({ structure: "R-tree" }));
  show("one area only", P, d({ shards: 1 }));
  show("no driver lock", P, d({ lock: "Eventual" }));
  show("estimates without a breaker", P, d({ etaCb: false }));
}

// ------------------------------------------------------------------ food delivery
if (!only || only === "fd") {
  const P = fd as unknown as Problem;
  const d = (o: { keys?: boolean; lock?: string; trackOnWeb?: boolean; notifyCb?: boolean } = {}) => ({
    nodes: [
      mk("u", "user", { users: 600000, reqPerUser: 0.01 }),
      mk("lb", "load_balancer", { instances: 2, capacity: 20000 }),
      mk("web", "server", { capacity: 1000, replicas: 7, autoscale: true, maxReplicas: 22 }, o.trackOnWeb ? ["browse", "track"] : ["browse"]),
      mk("c", "cache", { capacity: 50000, replicas: 2, hitRatio: 0.9 }),
      mk("geo", "geo_index", { capacity: 10000, shards: 3, replicas: 2, structure: "Quadtree" }),
      mk("ord", "service", { capacity: 500, replicas: 4, autoscale: true, maxReplicas: 20, idempotencyKeys: o.keys ?? true, circuitBreaker: o.notifyCb ?? true }, ["order"]),
      mk("db", "database", { capacity: 2000, shards: 1, readReplicas: 1, consistency: o.lock ?? "Row locks", indexes: ["orders:customer_id"] }),
      mk("pay", "service", { capacity: 500, replicas: 2, autoscale: true, maxReplicas: 8, idempotencyKeys: o.keys ?? true }, ["payment"]),
      mk("tp", "third_party", { capacity: 1500, kind: "Payment processor" }),
      ...(o.trackOnWeb ? [] : [mk("trk", "service", { capacity: 2000, replicas: 3, autoscale: true, maxReplicas: 12 }, ["track"])]),
      mk("q", "queue", { capacity: 5000 }),
      mk("nw", "worker", { capacity: 200, replicas: 2, autoscale: true, maxReplicas: 8, idempotent: true }, ["notify"]),
      mk("tp2", "third_party", { capacity: 2000, kind: "Email / SMS" }),
    ],
    edges: [
      e("u", "lb"), e("lb", "web"), e("lb", "ord"), ...(o.trackOnWeb ? [] : [e("lb", "trk"), e("trk", "geo")]), e("web", "c"), e("c", "geo"), e("ord", "db"), e("ord", "pay"), e("pay", "tp"), e("ord", "q", "async"), e("q", "nw"), e("nw", "tp2"),
      ...(o.trackOnWeb ? [e("web", "geo")] : []),
    ],
  });
  show("separate services, keys, row locks", P, d());
  show("no idempotency keys", P, d({ keys: false }));
  show("no stock lock", P, d({ lock: "Eventual" }));
  show("tracking inside the browse server", P, d({ trackOnWeb: true }));
}
