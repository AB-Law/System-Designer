import { analyze } from "../src/sim/analyze";
import { BLOCK_MAP, defaultCfg, money } from "../src/blocks";
import ms from "../src/problems/messaging_app.json";
import nf from "../src/problems/news_feed.json";
import gd from "../src/problems/google_drive.json";
import mm from "../src/problems/metrics_monitoring.json";
import type { Problem } from "../src/types";

const mk = (id: string, blockId: string, over: Record<string, unknown> = {}, caps?: string[]) => ({
  id, blockId, cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over }, responsibilities: [] as string[], capabilities: caps,
});
const e = (s: string, t: string, kind: "sync" | "async" = "sync") => ({ id: s + t + kind, source: s, target: t, kind });
const show = (name: string, P: Problem, d: any) => {
  const r = analyze(d, P);
  console.log(`\n== ${P.id} / ${name}: score ${r.score}, cost ${money(r.cost)} / ${money(r.budget!)}`);
  for (const s of r.scenarios) console.log("  ", s.scenarioId.padEnd(13), "served", s.served.toFixed(2), "lat", String(Math.round(s.latencyMs)).padStart(4), s.pass ? "PASS" : "FAIL", s.notes.join(" | ").slice(0, 200));
  console.log("   req:", r.requirements.map((x) => x.id.replace("r-", "") + "=" + (x.met === null ? "ai" : x.met ? "ok" : "NO")).join(" "));
  const f = r.findings.filter((x) => x.severity === "bad" || x.severity === "warn").map((x) => x.id);
  if (f.length) console.log("   issues:", f.join(", "));
};
const only = process.argv[2];

// ------------------------------------------------------------------ messaging
if (!only || only === "ms") {
  const P = ms as unknown as Problem;
  const d = (o: { broker?: string; key?: string; provider?: boolean; historyOnServer?: boolean } = {}) => {
    const broker = o.broker ?? "stream";
    return {
      nodes: [
        mk("u", "user", { users: 1000000, reqPerUser: 0.005 }),
        mk("lb", "load_balancer", { instances: 2, capacity: 20000 }),
        mk("ws", "websocket", { capacity: 20000, replicas: 2 }, o.historyOnServer ? ["send", "history"] : ["send"]),
        mk("st", broker, broker === "stream" ? { capacity: 5000, partitions: 4, partitionKey: o.key ?? "Entity id (even)", retentionH: 24 } : { capacity: 5000, partitions: 4 }),
        mk("wd", "worker", { capacity: 200, replicas: 10, autoscale: true, maxReplicas: 24, idempotent: true, batchSize: 10 }, ["deliver"]),
        ...(o.historyOnServer ? [] : [mk("wh", "worker", { capacity: 200, replicas: 6, autoscale: true, maxReplicas: 20, idempotent: true, batchSize: 20 }, ["history"])]),
        mk("db", "database", { capacity: 1500, engine: "Key-value", readReplicas: 1, indexes: ["messages:conversation_id,sent_at"], pagination: "Keyset (after the last item)" }),
        mk("wp", "worker", { capacity: 200, replicas: 3, autoscale: true, maxReplicas: 10, idempotent: true, batchSize: 5 }, ["push"]),
        ...(o.provider === false ? [] : [mk("tp", "third_party", { capacity: 2000, kind: "Email / SMS" })]),
      ],
      edges: [
        e("u", "lb"), e("lb", "ws"), e("ws", "st", "async"), e("st", "wd"), e("st", "wp"),
        ...(o.historyOnServer ? [e("ws", "db")] : [e("st", "wh"), e("wh", "db")]),
        ...(o.provider === false ? [] : [e("wp", "tp")]),
      ],
    };
  };
  show("stream, key per conversation", P, d());
  show("queue instead of stream", P, d({ broker: "queue" }));
  show("stream with a single hot key", P, d({ key: "Single key (hot)" }));
  show("no push provider", P, d({ provider: false }));
  show("history written by the chat server", P, d({ historyOnServer: true }));
}

// ------------------------------------------------------------------ news feed
if (!only || only === "nf") {
  const P = nf as unknown as Problem;
  const d = (o: { idem?: boolean; fanoutOnApp?: boolean; rankCb?: boolean } = {}) => ({
    nodes: [
      mk("u", "user", { users: 2000000, reqPerUser: 0.004 }),
      mk("lb", "load_balancer", { instances: 2, capacity: 20000 }),
      mk("app", "server", { capacity: 1000, replicas: 10, autoscale: true, maxReplicas: 24, circuitBreaker: o.rankCb ?? true, timeoutMs: 40 }, o.fanoutOnApp ? ["read_feed", "post", "fanout"] : ["read_feed"]),
      mk("tc", "cache", { capacity: 50000, replicas: 2, hitRatio: 0.95 }),
      mk("db", "database", { capacity: 2000, engine: "Document", readReplicas: 1, indexes: ["feed_items:user_id,created_at"], pagination: "Keyset (after the last item)" }),
      mk("rank", "service", { capacity: 2000, replicas: 5, autoscale: true, maxReplicas: 12 }, ["rank"]),
      ...(o.fanoutOnApp ? [] : [
        mk("post", "service", { capacity: 1000, replicas: 2, autoscale: true, maxReplicas: 10 }, ["post"]),
        mk("st", "stream", { capacity: 10000, partitions: 2 }),
        mk("fw", "worker", { capacity: 200, replicas: 6, autoscale: true, maxReplicas: 80, idempotent: o.idem ?? true, batchSize: 20 }, ["fanout"]),
      ]),
    ],
    edges: [
      e("u", "lb"), e("lb", "app"), e("app", "tc"), e("tc", "db"), e("app", "rank"),
      ...(o.fanoutOnApp ? [e("app", "tc")] : [e("app", "post"), e("post", "st", "async"), e("st", "fw"), e("fw", "tc")]),
    ],
  });
  show("fan-out on write via stream", P, d());
  show("fan-out worker not idempotent", P, d({ idem: false }));
  show("fan-out inside the feed server", P, d({ fanoutOnApp: true }));
  show("ranking called without a breaker", P, d({ rankCb: false }));
}

// ------------------------------------------------------------------ drive
if (!only || only === "gd") {
  const P = gd as unknown as Problem;
  const d = (o: { lock?: string; cdn?: boolean; syncOnApp?: boolean } = {}) => ({
    nodes: [
      mk("u", "user", { users: 500000, reqPerUser: 0.02 }),
      ...(o.cdn === false ? [] : [mk("cdn", "cdn", { capacity: 100000, cacheApi: false, staticShare: 0.85, hitRatio: 0.93 })]),
      mk("lb", "load_balancer", { instances: 2, capacity: 20000 }),
      mk("app", "server", { capacity: 1000, replicas: 8, autoscale: true, maxReplicas: 24, circuitBreaker: true }, o.syncOnApp ? ["download", "upload", "sync"] : ["download", "upload"]),
      mk("blob", "blob_storage", { capacity: 12000 }),
      mk("db", "database", { capacity: 1500, engine: "Document", consistency: o.lock ?? "Row locks", readReplicas: 1 }),
      ...(o.syncOnApp ? [] : [mk("ws", "websocket", { capacity: 20000, replicas: 1 }, ["sync"])]),
      mk("q", "queue", { capacity: 5000 }),
      mk("tw", "worker", { capacity: 200, replicas: 4, autoscale: true, maxReplicas: 16, idempotent: true }, ["thumbs"]),
    ],
    edges: [
      e("u", o.cdn === false ? "lb" : "cdn"), ...(o.cdn === false ? [] : [e("cdn", "lb")]), e("lb", "app"), e("app", "blob"), e("app", "db"),
      ...(o.syncOnApp ? [] : [e("app", "ws")]), e("app", "q", "async"), e("q", "tw"), e("tw", "blob"),
    ],
  });
  show("cdn, row locks, sync separate", P, d());
  show("no locks", P, d({ lock: "Eventual" }));
  show("no cdn", P, d({ cdn: false }));
  show("live sync inside the app server", P, d({ syncOnApp: true }));
}

// ------------------------------------------------------------------ metrics
if (!only || only === "mm") {
  const P = mm as unknown as Problem;
  const d = (o: { engine?: string; rollupFromStream?: boolean; qsep?: boolean } = {}) => ({
    nodes: [
      mk("u", "user", { users: 100000, reqPerUser: 0.2 }),
      mk("lb", "load_balancer", { instances: 2, capacity: 50000 }),
      mk("ing", "server", { capacity: 1000, replicas: 26, autoscale: true, maxReplicas: 56 }, o.qsep === false ? ["ingest", "query"] : ["ingest"]),
      ...(o.qsep === false ? [] : [mk("qs", "service", { capacity: 1000, replicas: 2, autoscale: true, maxReplicas: 20 }, ["query"])]),
      mk("st", "stream", { capacity: 20000, partitions: 4, retentionH: 48 }),
      mk("ww", "worker", { capacity: 200, replicas: 10, autoscale: true, maxReplicas: 30, idempotent: true, batchSize: 50 }, ["write"]),
      mk("db", "database", { capacity: 3000, shards: 1, readReplicas: 1, engine: o.engine ?? "Time-series", indexes: ["points:metric_id,ts"] }),
      mk("rw", "worker", { capacity: 200, replicas: 8, idempotent: true }, ["rollup"]),
      mk("aw", "worker", { capacity: 200, replicas: 3, idempotent: true }, ["alert"]),
      mk("tp", "third_party", { capacity: 500, kind: "Email / SMS" }),
    ],
    edges: [
      e("u", "lb"), e("lb", "ing"), ...(o.qsep === false ? [e("ing", "db")] : [e("lb", "qs"), e("qs", "db")]), e("ing", "st", "async"), e("st", "ww"), e("ww", "db"),
      ...(o.rollupFromStream === false ? [] : [e("st", "rw")]), e("rw", "db"), e("aw", "tp"),
    ],
  });
  show("time-series store, stream", P, d());
  show("relational store", P, d({ engine: "Relational" }));
  show("rollup not fed from the stream", P, d({ rollupFromStream: false }));
  show("queries on the ingest servers", P, d({ qsep: false }));
}
