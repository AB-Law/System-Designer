import { analyze } from "../src/sim/analyze";
import { BLOCK_MAP, defaultCfg, money } from "../src/blocks";
import mp from "../src/problems/maps.json";
import wc from "../src/problems/web_crawler.json";
import sr from "../src/problems/search.json";
import vs from "../src/problems/video_streaming.json";
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

// ------------------------------------------------------------------ maps
if (!only || only === "mp") {
  const P = mp as unknown as Problem;
  const d = (o: { structure?: string; shards?: number; copies?: number; cache?: boolean; photosOnWeb?: boolean; lock?: string } = {}) => ({
    nodes: [
      mk("u", "user", { users: 2000000, reqPerUser: 0.004 }),
      mk("lb", "load_balancer", { instances: 2, capacity: 30000 }),
      mk("web", "server", { capacity: 1000, replicas: 12, autoscale: true, maxReplicas: 40 }, o.photosOnWeb ? ["nearby", "photos"] : ["nearby"]),
      ...(o.cache === false ? [] : [mk("c", "cache", { capacity: 50000, replicas: 2, hitRatio: 0.8 })]),
      mk("geo", "geo_index", { capacity: 4000, shards: o.shards ?? 3, replicas: o.copies ?? 2, structure: o.structure ?? "Quadtree" }),
      mk("dt", "service", { capacity: 1000, replicas: 3, autoscale: true, maxReplicas: 14 }, ["details"]),
      mk("dc", "cache", { capacity: 50000, replicas: 2, hitRatio: 0.9 }),
      mk("db", "database", { capacity: 2000, engine: "Document", consistency: o.lock ?? "Row locks", readReplicas: 1 }),
      ...(o.photosOnWeb ? [] : [mk("ph", "service", { capacity: 2000, replicas: 3, autoscale: true, maxReplicas: 10 }, ["photos"])]),
      mk("blob", "blob_storage", { capacity: 12000 }),
      mk("ed", "service", { capacity: 500, replicas: 3, autoscale: true, maxReplicas: 8 }, ["edit"]),
      mk("rx", "worker", { capacity: 200, replicas: 4, idempotent: true }, ["reindex"]),
    ],
    edges: [
      e("u", "lb"), e("lb", "web"), e("lb", "dt"), ...(o.photosOnWeb ? [e("web", "blob")] : [e("lb", "ph"), e("ph", "blob")]), e("lb", "ed"),
      ...(o.cache === false ? [e("web", "geo")] : [e("web", "c"), e("c", "geo")]), e("dt", "dc"), e("dc", "db"), e("ed", "db"), e("rx", "geo"),
    ],
  });
  show("quadtree in 3 areas, cached", P, d());
  show("no cache in front of the index", P, d({ cache: false }));
  show("grid, one area, one copy", P, d({ structure: "Geohash grid", shards: 1, copies: 1 }));
  show("photos served by the search server", P, d({ photosOnWeb: true }));
  show("no lock on edits", P, d({ lock: "Eventual" }));
}

// ------------------------------------------------------------------ web crawler
if (!only || only === "wc") {
  const P = wc as unknown as Problem;
  const d = (o: { rl?: boolean; cacheReplicas?: number; dedupe?: boolean; provider?: boolean } = {}) => ({
    nodes: [
      mk("u", "user", { users: 200000, reqPerUser: 0.02 }),
      mk("fe", "service", { capacity: 1000, replicas: 6, autoscale: true, maxReplicas: 14 }, o.dedupe === false ? ["frontier"] : ["frontier", "dedupe"]),
      ...(o.dedupe === false ? [] : [mk("dc", "cache", { capacity: 50000, replicas: o.cacheReplicas ?? 2, hitRatio: 0.9 })]),
      mk("q", "queue", { capacity: 10000, partitions: 2 }),
      mk("fw", "worker", { capacity: 200, replicas: 30, autoscale: true, maxReplicas: 70, idempotent: true }, ["fetch", "politeness"]),
      ...(o.rl === false ? [] : [mk("rl", "rate_limiter", { limit: 6000 })]),
      ...(o.provider === false ? [] : [mk("web", "third_party", { capacity: 5000, kind: "Generic" })]),
      mk("q2", "queue", { capacity: 10000 }),
      mk("sw", "worker", { capacity: 200, replicas: 9, autoscale: true, maxReplicas: 24, idempotent: true, batchSize: 4 }, ["store"]),
      mk("xw", "worker", { capacity: 200, replicas: 17, autoscale: true, maxReplicas: 40, idempotent: true }, ["extract"]),
      mk("blob", "blob_storage", { capacity: 6000 }),
      mk("rc", "worker", { capacity: 200, replicas: 3, idempotent: true }, ["recrawl"]),
    ],
    edges: [
      e("u", "fe"), ...(o.dedupe === false ? [e("fe", "q")] : [e("fe", "dc"), e("dc", "q")]), e("q", "fw"),
      ...(o.rl === false ? (o.provider === false ? [] : [e("fw", "web")]) : [e("fw", "rl"), ...(o.provider === false ? [] : [e("rl", "web")])]),
      e("fw", "q2", "async"), e("q2", "sw"), e("q2", "xw"), e("sw", "blob"), e("rc", "web"), e("rc", "blob"),
    ],
  });
  show("dedupe, queue, politeness, bulk storage", P, d());
  show("no duplicate lookup", P, d({ dedupe: false }));
  show("no politeness limit", P, d({ rl: false }));
  show("downloads not connected to the web", P, d({ provider: false }));
  show("single cache replica (lost on failure)", P, d({ cacheReplicas: 1 }));
}

// ------------------------------------------------------------------ search suggestions
if (!only || only === "sr") {
  const P = sr as unknown as Problem;
  const d = (o: { cacheReplicas?: number; hit?: number; cb?: boolean; replay?: boolean } = {}) => ({
    nodes: [
      mk("u", "user", { users: 500000, reqPerUser: 0.02 }),
      mk("lb", "load_balancer", { instances: 2, capacity: 30000 }),
      mk("api", "server", { capacity: 1000, replicas: 7, autoscale: true, maxReplicas: 24, circuitBreaker: o.cb ?? true, timeoutMs: 45 }, ["suggest"]),
      mk("c", "cache", { capacity: 100000, replicas: o.cacheReplicas ?? 3, hitRatio: o.hit ?? 0.98 }),
      mk("si", "search_index", { capacity: 1500, replicas: 2, shards: 1 }),
      mk("pz", "service", { capacity: 1000, replicas: 5, autoscale: true, maxReplicas: 16 }, ["personalize"]),
      mk("st", "stream", { capacity: 5000, partitions: 2, retentionH: o.replay === false ? 1 : 48 }),
      mk("lw", "worker", { capacity: 200, replicas: 3, idempotent: true, batchSize: 10 }, ["log"]),
      mk("tw", "worker", { capacity: 200, replicas: 5, idempotent: true }, ["trending"]),
    ],
    edges: [e("u", "lb"), e("lb", "api"), e("api", "c"), e("c", "si"), e("api", "pz"), e("api", "st", "async"), e("st", "lw"), e("st", "tw"), e("tw", "si")],
  });
  show("prefix cache, stream log, breaker", P, d());
  show("single cache replica", P, d({ cacheReplicas: 1 }));
  show("poor cache hit ratio", P, d({ hit: 0.7 }));
  show("personalisation without a breaker", P, d({ cb: false }));
  show("log kept for only an hour (no replay)", P, d({ replay: false }));
}

// ------------------------------------------------------------------ video streaming
if (!only || only === "vs") {
  const P = vs as unknown as Problem;
  const d = (o: { cdn?: boolean; transcodeOnPlay?: boolean; recCb?: boolean } = {}) => ({
    nodes: [
      mk("u", "user", { users: 1000000, reqPerUser: 0.01 }),
      ...(o.cdn === false ? [] : [mk("cdn", "cdn", { capacity: 200000, cacheApi: true, hitRatio: 0.95 })]),
      mk("lb", "load_balancer", { instances: 2, capacity: 30000 }),
      mk("pl", "service", { capacity: 2000, replicas: 4, autoscale: true, maxReplicas: 14 }, o.transcodeOnPlay ? ["play", "transcode"] : ["play"]),
      mk("blob", "blob_storage", { capacity: 20000 }),
      mk("br", "service", { capacity: 1000, replicas: 2, autoscale: true, maxReplicas: 8 }, ["browse"]),
      mk("si", "search_index", { capacity: 3000, replicas: 2 }),
      mk("db", "database", { capacity: 1500, engine: "Document", readReplicas: 1 }),
      mk("up", "service", { capacity: 500, replicas: 2, autoscale: true, maxReplicas: 14 }, ["upload"]),
      ...(o.transcodeOnPlay ? [] : [mk("q", "queue", { capacity: 5000 }), mk("tw", "worker", { capacity: 200, replicas: 12, autoscale: true, maxReplicas: 120, idempotent: true }, ["transcode"])]),
      mk("rec", "service", { capacity: 1000, replicas: 3, autoscale: true, maxReplicas: 10, circuitBreaker: o.recCb ?? true }, ["recommend"]),
    ],
    edges: [
      e("u", o.cdn === false ? "lb" : "cdn"), ...(o.cdn === false ? [] : [e("cdn", "lb")]),
      e("lb", "pl"), e("pl", "blob"), e("lb", "br"), e("br", "si"), e("br", "db"), e("lb", "up"), e("up", "blob"),
      ...(o.transcodeOnPlay ? [] : [e("up", "q", "async"), e("q", "tw"), e("tw", "blob")]), e("lb", "rec"),
    ],
  });
  show("cdn, separate paths, queued transcoding", P, d());
  show("no cdn", P, d({ cdn: false }));
  show("transcoding on the playback servers", P, d({ transcodeOnPlay: true }));
}
