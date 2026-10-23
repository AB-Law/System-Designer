import type { BlockDef, Cfg, FieldDef, SectionDef } from "../types";
import { PROVIDER_KINDS } from "../sim/caps";
import { KEYSET_PAGING, OFFSET_PAGING, dataCost } from "../sim/data";
import { DEFAULT_REGION, REGION_LABELS, copyRegions, isPlaceable, regionId } from "../sim/regions";
import type { Problem } from "../types";

/*
  Every block turns its settings into a BlockModel (capacity, latency, pass-through, instances, monthly cost).
  Two guard rails keep the simulator from being brute-forced:
    1. each setting has a realistic ceiling (one machine can only do so much), and
    2. everything costs money, and every problem has a budget.
  Settings that would let a player type a better latency or a perfect hit ratio are not offered at all.
*/

const num = (key: string, label: string, def: number, extra: Partial<Extract<FieldDef, { type: "number" }>> = {}): FieldDef =>
  ({ key, label, type: "number", default: def, ...extra }) as FieldDef;
const ratio = (key: string, label: string, def: number, max = 1): FieldDef => ({ key, label, type: "ratio", default: def, max });
const toggle = (key: string, label: string, def = false): FieldDef => ({ key, label, type: "toggle", default: def }) as FieldDef;
const when = (f: FieldDef, key: string, equals: unknown): FieldDef => ({ ...f, showIf: { key, equals } }) as FieldDef;
const select = (key: string, label: string, options: string[], def?: string): FieldDef =>
  ({ key, label, type: "select", options, default: def ?? options[0] }) as FieldDef;
const list = (key: string, label: string, placeholder: string, addLabel: string): FieldDef =>
  ({ key, label, type: "list", placeholder, addLabel, default: [] }) as FieldDef;

const capacity = (
  cap: number,
  capMax: number,
  replicasKey: string,
  replicasLabel: string,
  replicasDef: number,
  replicasMax: number,
  capLabel = "Capacity (per instance)",
  unit = "rps",
): SectionDef => ({
  id: "capacity",
  title: "Capacity & Scaling",
  fields: [
    num("capacity", capLabel, cap, { unit, min: 1, max: capMax }),
    num(replicasKey, replicasLabel, replicasDef, { min: 1, max: replicasMax }),
  ],
});

const n = (c: Cfg, k: string, d = 0): number => (typeof c[k] === "number" && !Number.isNaN(c[k]) ? c[k] : d);

/** Monthly dollars for one instance: a fixed part, a part per rps, and a small penalty for very large machines. */
const price = (base: number, perRps: number, cap: number, quad = 0) => base + perRps * cap + quad * cap * cap;

/**
 * Autoscaling: during a traffic spike the replica count grows with the load, up to `maxReplicas`.
 * The bill only reserves part of that headroom, so it is cheaper than running spike capacity all day,
 * but a huge maximum still costs money.
 */
const autoscaleSection: SectionDef = {
  id: "autoscale",
  title: "Autoscaling",
  fields: [
    toggle("autoscale", "Scale out under load", false),
    when(num("maxReplicas", "Max replicas", 20, { min: 1, max: 500 }), "autoscale", true),
  ],
};
function scaled(c: Cfg, reps: number) {
  const max = Math.max(reps, n(c, "maxReplicas", reps));
  const burst = Math.max(1, n(c, "_burst", 1));
  const live = c.autoscale ? Math.min(max, Math.ceil(reps * burst)) : reps;
  const billed = c.autoscale ? reps + 0.15 * (max - reps) : reps;
  return { live, billed };
}

/** Defaults for every field of a block, used when a node is created. */
export function defaultCfg(def: BlockDef): Cfg {
  const cfg: Cfg = {};
  for (const s of def.sections) for (const f of s.fields) cfg[f.key] = Array.isArray(f.default) ? [...f.default] : f.default;
  return cfg;
}

const security: SectionDef = { id: "security", title: "Security", collapsed: true, fields: [] };

const compute = (id: "server" | "service"): BlockDef => ({
  id,
  category: "compute",
  label: id === "server" ? "Server" : "Service",
  summary: id === "server" ? "Runs your application code" : "One business capability",
  color: "",
  icon: id === "server" ? "S" : "Sv",
  sections: [
    capacity(1000, 5000, "replicas", "Replicas", 1, 500),
    autoscaleSection,
    {
      id: "ids",
      title: "Unique IDs",
      fields: [
        select("idStrategy", "ID strategy", ["None", "Random + collision check", "Counter range per server", "Central counter (locked)"]),
      ],
    },
    {
      id: "resilience",
      title: "Resilience",
      fields: [
        toggle("circuitBreaker", "Circuit breaker for its dependencies", false),
        num("timeoutMs", "Timeout for dependencies", 150, { unit: "ms", min: 20, max: 5000 }),
        toggle("idempotencyKeys", "Deduplicate retries with idempotency keys", false),
      ],
    },
    security,
  ],
  model: (c) => {
    const reps = n(c, "replicas", 1);
    const cap = n(c, "capacity", 1000);
    const { live, billed } = scaled(c, reps);
    // issuing ids has a small cost on every request that does it: a collision check reads, a central counter queues on a lock
    const idCost =
      c.idStrategy === "Central counter (locked)"
        ? { cap: 0.9, ms: 2 }
        : c.idStrategy === "Random + collision check"
          ? { cap: 0.97, ms: 1 }
          : c.idStrategy === "Counter range per server"
            ? { cap: 0.995, ms: 0 }
            : { cap: 1, ms: 0 };
    return {
      // idempotency keys cost an extra lookup and write per request
      capacity: cap * live * (c.idempotencyKeys ? 0.9 : 1) * idCost.cap,
      latencyMs: 20 + (c.idempotencyKeys ? 2 : 0) + idCost.ms,
      passThrough: 1,
      instances: live,
      fanout: "all",
      timeoutMs: n(c, "timeoutMs", 150),
      circuitBreaker: !!c.circuitBreaker,
      cost: billed * price(60, 0.1, cap, 0.00005),
    };
  },
});

export const BLOCKS: BlockDef[] = [
  {
    id: "user",
    category: "entry",
    label: "User",
    summary: "Who sends traffic and how much",
    color: "",
    icon: "U",
    role: "source",
    sections: [
      {
        id: "capacity",
        title: "Traffic",
        fields: [num("users", "Users", 100, { min: 0 }), num("reqPerUser", "Req / User", 1, { unit: "rps", min: 0, step: 0.01 })],
      },
    ],
    model: () => ({ capacity: Infinity, latencyMs: 0, passThrough: 1, instances: 1, fanout: "split", cost: 0 }),
  },
  {
    id: "cdn",
    category: "entry",
    label: "CDN",
    summary: "Serves static files from the edge",
    color: "",
    icon: "CDN",
    sections: [
      { id: "capacity", title: "Capacity & Scaling", fields: [num("capacity", "Capacity", 100000, { unit: "rps", min: 1, max: 500000 })] },
      {
        id: "edge",
        title: "Edge Caching",
        fields: [
          toggle("cacheApi", "Cache API Responses", false),
          num("staticShare", "Static share of traffic", 0.3, { min: 0, max: 1, step: 0.05 }),
          ratio("hitRatio", "Hit Ratio", 0.9, 0.97),
        ],
      },
      security,
    ],
    model: (c) => {
      const cacheable = c.cacheApi ? 1 : n(c, "staticShare", 0.3);
      const cap = n(c, "capacity", 100000);
      return {
        capacity: cap,
        latencyMs: 12,
        passThrough: 1 - Math.min(0.97, n(c, "hitRatio", 0.9)) * cacheable,
        writePassThrough: 1, // an upload or a POST is never answered from the edge
        instances: 10,
        fanout: "all",
        cost: 100 + 0.01 * cap,
      };
    },
  },
  {
    id: "rate_limiter",
    category: "entry",
    label: "Rate Limiter",
    summary: "Caps requests per client",
    color: "",
    icon: "RL",
    sections: [
      {
        id: "limits",
        title: "Limits",
        fields: [
          num("limit", "Global limit", 120000, { unit: "rps", min: 1, max: 1000000 }),
          select("algorithm", "Algorithm", ["Token bucket", "Sliding window", "Fixed window", "Leaky bucket"]),
        ],
      },
    ],
    model: (c) => ({
      capacity: Infinity,
      latencyMs: 2,
      passThrough: 1,
      instances: 2,
      fanout: "all",
      dropAbove: n(c, "limit", 120000),
      cost: 80 + 0.0005 * n(c, "limit", 120000),
    }),
  },
  {
    id: "load_balancer",
    category: "entry",
    label: "Load Balancer",
    summary: "Spreads traffic across copies",
    color: "",
    icon: "LB",
    sections: [
      capacity(50000, 100000, "instances", "Instances", 2, 20),
      {
        id: "routing",
        title: "Routing",
        fields: [
          select("algorithm", "Algorithm", ["Round Robin", "Least Connections", "IP Hash", "Weighted"]),
          toggle("healthChecks", "Health checks", true),
        ],
      },
      security,
    ],
    model: (c) => {
      const inst = n(c, "instances", 2);
      const cap = n(c, "capacity", 50000);
      return { capacity: cap * inst, latencyMs: 2, passThrough: 1, instances: inst, fanout: "split", cost: inst * price(25, 0.004, cap) };
    },
  },
  {
    id: "api_gateway",
    category: "entry",
    label: "API Gateway",
    summary: "Routes requests to services",
    color: "",
    icon: "GW",
    sections: [
      capacity(20000, 50000, "instances", "Instances", 2, 50),
      { id: "auth", title: "Auth", fields: [toggle("authEnabled", "Authenticate requests", true)] },
    ],
    model: (c) => {
      const inst = n(c, "instances", 2);
      const cap = n(c, "capacity", 20000);
      return {
        capacity: cap * inst,
        latencyMs: c.authEnabled ? 8 : 4,
        passThrough: 1,
        instances: inst,
        fanout: "split",
        cost: inst * price(40, 0.01, cap),
      };
    },
  },
  {
    id: "reverse_proxy",
    category: "entry",
    label: "Reverse Proxy",
    summary: "TLS, compression, routing",
    color: "",
    icon: "RP",
    sections: [
      capacity(40000, 80000, "instances", "Instances", 2, 50),
      { id: "features", title: "Features", fields: [toggle("tls", "TLS termination", true)] },
    ],
    model: (c) => {
      const inst = n(c, "instances", 2);
      const cap = n(c, "capacity", 40000);
      return {
        capacity: cap * inst,
        latencyMs: 3 + (c.tls ? 1 : 0),
        passThrough: 1,
        instances: inst,
        fanout: "split",
        cost: inst * price(20, 0.004, cap),
      };
    },
  },
  compute("server"),
  compute("service"),
  {
    id: "websocket",
    category: "compute",
    label: "WebSocket Server",
    summary: "Live, two-way connections",
    color: "",
    icon: "WS",
    sections: [capacity(20000, 50000, "replicas", "Replicas", 1, 200, "Messages per instance", "msg/s")],
    model: (c) => {
      const reps = n(c, "replicas", 1);
      const cap = n(c, "capacity", 20000);
      return { capacity: cap * reps, latencyMs: 5, passThrough: 1, instances: reps, fanout: "all", cost: reps * price(60, 0.01, cap) };
    },
  },
  {
    id: "worker",
    category: "compute",
    label: "Worker",
    summary: "Processes jobs from a queue",
    color: "",
    icon: "W",
    role: "consumer",
    sections: [
      capacity(200, 2000, "replicas", "Replicas", 1, 500, "Jobs per worker", "jobs/s"),
      autoscaleSection,
      {
        id: "reliability",
        title: "Reliability",
        fields: [
          toggle("idempotent", "Idempotent processing", false),
          num("maxRetries", "Max retries", 3, { min: 0, max: 20 }),
          num("batchSize", "Batch size", 1, { min: 1, max: 100 }),
        ],
      },
    ],
    model: (c) => {
      const reps = n(c, "replicas", 1);
      const cap = n(c, "capacity", 200);
      const batch = Math.max(1, n(c, "batchSize", 1));
      // batching helps with diminishing returns, not linearly
      const speedup = 1 + 0.8 * Math.log2(batch);
      const { live, billed } = scaled(c, reps);
      // batching also coalesces the writes it makes downstream
      return {
        capacity: cap * live * speedup,
        latencyMs: 0,
        passThrough: 1 / speedup,
        instances: live,
        fanout: "all",
        cost: billed * price(40, 0.2, cap) * (1 + 0.005 * batch),
      };
    },
  },
  {
    id: "database",
    category: "data",
    label: "Database",
    summary: "Source of truth for data",
    color: "",
    icon: "DB",
    sections: [
      { id: "what", title: "What it stores", fields: [list("stores", "Stored data", "e.g. orders", "Add stored data")] },
      capacity(4000, 10000, "readReplicas", "Read replicas", 0, 15, "Capacity (per node)"),
      { id: "scaling", title: "Partitioning", fields: [num("shards", "Shards", 1, { min: 1, max: 64 })] },
      { id: "engine", title: "Engine", fields: [select("engine", "Type", ["Relational", "Key-value", "Document", "Time-series"])] },
      { id: "consistency", title: "Consistency", fields: [select("consistency", "Locking", ["Eventual", "Row locks", "Serializable"])] },
      {
        // edited by a custom panel that knows the problem's tables; only shown when the problem has a data model
        id: "datamodel",
        title: "Data model",
        fields: [
          { ...list("indexes", "Indexes", "", ""), hidden: true },
          { ...list("shardKeys", "Shard keys", "", ""), hidden: true },
          select("pagination", "Paging through long lists", [OFFSET_PAGING, KEYSET_PAGING]),
          toggle("denormalize", "Store joined data together", false),
        ],
      },
      security,
    ],
    model: (c) => {
      const w = Math.min(1, Math.max(0, n(c, "_writeShare", 0.1)));
      const shards = n(c, "shards", 1);
      const cap = n(c, "capacity", 4000);
      const rr = Math.max(0, n(c, "readReplicas", 0));
      // engine: key-value stores are fast at simple lookups, time-series stores swallow appends but are poor at ad-hoc reads
      const eng =
        c.engine === "Key-value"
          ? { r: 2.5, w: 2.5, ms: -3, cost: 0.8 }
          : c.engine === "Document"
            ? { r: 1.8, w: 1.5, ms: -2, cost: 0.9 }
            : c.engine === "Time-series"
              ? { r: 0.6, w: 4, ms: 2, cost: 1.1 }
              : { r: 1, w: 1, ms: 0, cost: 1 };
      const remote = copyRegions(c, regionId(c.region)).length; // a copy in another region is one more node that serves reads
      const readCap = cap * eng.r * (1 + rr + remote) * shards;
      // locks serialise writers on hot rows: safer, slower
      const lock =
        c.consistency === "Serializable"
          ? { tput: 0.45, ms: 6 }
          : c.consistency === "Row locks"
            ? { tput: 0.7, ms: 2 }
            : { tput: 1, ms: 0 };
      const writeCap = cap * eng.w * shards * lock.tput;
      const total = 1 / ((1 - w) / readCap + w / writeCap);
      const nodes = (1 + rr + remote) * shards;
      // reads can be served by any copy; writes only by the primary of each shard, so replicas do not add write capacity
      return {
        capacity: total,
        readCapacity: readCap,
        writeCapacity: writeCap,
        latencyMs: Math.max(3, 8 + lock.ms + eng.ms),
        passThrough: 1,
        instances: nodes,
        fanout: "all",
        cost: nodes * price(150, 0.15, cap, 0.00002) * eng.cost,
      };
    },
  },
  {
    id: "cache",
    category: "data",
    label: "Cache",
    summary: "Fast reads for hot data",
    color: "",
    icon: "C",
    sections: [
      { id: "what", title: "What it stores", fields: [list("stores", "Stored data", "e.g. hot ads", "Add stored data")] },
      capacity(50000, 150000, "replicas", "Replicas", 1, 50),
      {
        id: "reliability",
        title: "Reliability",
        fields: [toggle("requestCoalescing", "Request Coalescing", false), toggle("lockService", "Also act as a lock service", false)],
      },
      { id: "caching", title: "Caching", fields: [ratio("hitRatio", "Expected Hit Ratio", 0.8, 0.98)] },
    ],
    model: (c) => {
      const miss = (1 - Math.min(0.98, n(c, "hitRatio", 0.8))) * (c.requestCoalescing ? 0.85 : 1);
      const reps = n(c, "replicas", 1);
      const cap = n(c, "capacity", 50000);
      // cache-aside: reads that hit are answered here, writes always go through to the store (and invalidate the entry)
      return {
        capacity: cap * reps,
        latencyMs: 1.5 + (c.lockService ? 3 : 0),
        passThrough: miss,
        writePassThrough: 1,
        instances: reps,
        fanout: "all",
        cost: reps * price(40, 0.004, cap),
      };
    },
  },
  {
    id: "search_index",
    category: "data",
    label: "Search Index",
    summary: "Full-text and filtered search",
    color: "",
    icon: "SI",
    sections: [
      { id: "what", title: "What it stores", fields: [list("stores", "Indexed data", "e.g. products", "Add indexed data")] },
      capacity(3000, 10000, "replicas", "Replicas", 1, 10),
      { id: "scaling", title: "Partitioning", fields: [num("shards", "Shards", 1, { min: 1, max: 64 })] },
    ],
    model: (c) => {
      const nodes = n(c, "replicas", 1) * n(c, "shards", 1);
      const cap = n(c, "capacity", 3000);
      return { capacity: cap * nodes, latencyMs: 25, passThrough: 1, instances: nodes, fanout: "all", cost: nodes * price(120, 0.08, cap) };
    },
  },
  {
    id: "geo_index",
    category: "data",
    label: "Geo Index",
    summary: "Find things near a location",
    color: "",
    icon: "GEO",
    sections: [
      { id: "what", title: "What it stores", fields: [list("stores", "Indexed data", "e.g. driver positions", "Add indexed data")] },
      capacity(4000, 15000, "replicas", "Copies per shard", 1, 10, "Operations per node"),
      { id: "scaling", title: "Partitioning", fields: [num("shards", "Shards (by area)", 1, { min: 1, max: 64 })] },
      { id: "structure", title: "Index structure", fields: [select("structure", "Type", ["Geohash grid", "Quadtree", "R-tree"])] },
    ],
    model: (c) => {
      const w = Math.min(1, Math.max(0, n(c, "_writeShare", 0.1)));
      const shards = n(c, "shards", 1);
      const copies = n(c, "replicas", 1);
      const cap = n(c, "capacity", 4000);
      // grids take updates cheaply but crowd in dense areas; trees answer queries well but cost more to update
      const st =
        c.structure === "Quadtree"
          ? { u: 1, q: 1, skew: 0.95 }
          : c.structure === "R-tree"
            ? { u: 0.5, q: 1.4, skew: 0.9 }
            : { u: 1.5, q: 0.8, skew: 0.7 };
      const updateCap = cap * shards * st.u; // every copy applies every update, so copies do not add write capacity
      const queryCap = cap * shards * copies * st.q;
      const spread = st.skew + (1 - st.skew) * Math.min(1, (shards - 1) / 8); // more areas spread a hot city across nodes
      const total = (1 / ((1 - w) / queryCap + w / updateCap)) * spread;
      return {
        capacity: total,
        readCapacity: queryCap * spread,
        writeCapacity: updateCap * spread,
        latencyMs: 6,
        passThrough: 1,
        instances: shards * copies,
        fanout: "all",
        cost: shards * copies * price(120, 0.05, cap),
      };
    },
  },
  {
    id: "blob_storage",
    category: "data",
    label: "Blob Storage",
    summary: "Files, images, backups",
    color: "",
    icon: "BS",
    sections: [
      { id: "what", title: "What it stores", fields: [list("stores", "Stored data", "e.g. images", "Add stored data")] },
      { id: "capacity", title: "Capacity & Scaling", fields: [num("capacity", "Throughput", 10000, { unit: "rps", min: 1, max: 100000 })] },
    ],
    model: (c) => {
      const cap = n(c, "capacity", 10000);
      return { capacity: cap, latencyMs: 40, passThrough: 1, instances: 3, fanout: "all", cost: price(50, 0.005, cap) };
    },
  },
  {
    id: "queue",
    category: "async",
    label: "Queue",
    summary: "Buffers work between services",
    color: "",
    icon: "Q",
    role: "queue",
    sections: [
      capacity(20000, 50000, "partitions", "Partitions", 1, 64, "Throughput per partition", "msg/s"),
      { id: "reliability", title: "Reliability", fields: [toggle("durable", "Durable (persisted)", true)] },
    ],
    model: (c) => {
      const parts = n(c, "partitions", 1);
      const cap = n(c, "capacity", 20000);
      // competing consumers: identical workers share the messages; different consumers (other capabilities) each get a copy
      return {
        capacity: cap * parts,
        latencyMs: 0,
        passThrough: 1,
        instances: parts,
        fanout: "split",
        cost: parts * price(30, 0.004, cap),
      };
    },
  },
  {
    id: "stream",
    category: "async",
    label: "Stream",
    summary: "Ordered log many readers can replay",
    color: "",
    icon: "ST",
    role: "queue",
    sections: [
      capacity(20000, 100000, "partitions", "Partitions", 1, 128, "Throughput per partition", "msg/s"),
      {
        id: "ordering",
        title: "Ordering",
        fields: [select("partitionKey", "Partition key", ["Entity id (even)", "Time bucket (hot)", "Single key (hot)"])],
      },
      {
        id: "reliability",
        title: "Reliability",
        fields: [toggle("durable", "Durable (replicated)", true), num("retentionH", "Retention", 24, { unit: "h", min: 1, max: 720 })],
      },
    ],
    model: (c) => {
      const parts = n(c, "partitions", 1);
      const cap = n(c, "capacity", 20000);
      const hours = n(c, "retentionH", 24);
      // a poor key sends most messages to a few partitions, so extra partitions do not help
      const usable = c.partitionKey === "Single key (hot)" ? 1 : c.partitionKey === "Time bucket (hot)" ? Math.min(parts, 2) : parts;
      return {
        capacity: cap * usable,
        latencyMs: 0,
        passThrough: 1,
        instances: parts,
        fanout: "split",
        cost: parts * (40 + 0.003 * cap + 0.25 * hours),
      };
    },
  },
  {
    id: "third_party",
    category: "external",
    label: "Third-party API",
    summary: "External provider you call",
    color: "",
    icon: "API",
    sections: [
      { id: "kind", title: "Provider", fields: [select("kind", "Kind", Object.keys(PROVIDER_KINDS))] },
      { id: "capacity", title: "Provider plan", fields: [num("capacity", "Rate limit", 500, { unit: "rps", min: 1, max: 5000 })] },
    ],
    model: (c) => {
      const cap = n(c, "capacity", 500);
      const kind = PROVIDER_KINDS[c.kind ?? "Generic"] ?? PROVIDER_KINDS.Generic;
      return { capacity: cap, latencyMs: kind.latencyMs, passThrough: 1, instances: 1, fanout: "all", cost: kind.perRps * cap };
    },
  },
];

/** One colour per category keeps the palette calm: navy for the edge, green for compute, bronze for data. */
export const CAT_COLOR: Record<BlockDef["category"], string> = {
  entry: "#1f3f78",
  compute: "#1a5a43",
  data: "#8a6a1c",
  async: "#1b4f5e",
  external: "#3d4350",
};
BLOCKS.forEach((b) => {
  b.color = CAT_COLOR[b.category];
});

// every block that runs somewhere gets a Region setting (only shown when the problem has users in several regions)
for (const b of BLOCKS) {
  if (!isPlaceable(b.id)) continue;
  const fields: FieldDef[] = [select("region", "Runs in", REGION_LABELS, DEFAULT_REGION)];
  if (b.id === "database") fields.push({ ...list("replicaRegions", "Also keeps a copy in", "", ""), hidden: true });
  const at = b.sections.findIndex((s) => s.id === "security");
  b.sections.splice(at < 0 ? b.sections.length : at, 0, { id: "placement", title: "Region", fields });
}

export const BLOCK_MAP: Record<string, BlockDef> = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));

export const CATEGORIES: { id: BlockDef["category"]; label: string }[] = [
  { id: "entry", label: "Entry & Edge" },
  { id: "compute", label: "Compute" },
  { id: "data", label: "Data" },
  { id: "async", label: "Async" },
  { id: "external", label: "External" },
];

export const money = (x: number): string => "$" + Math.round(x).toLocaleString("en-US");

/** Monthly cost of one configured block, as the simulator sees it. */
export function blockCost(blockId: string, cfg: Cfg, writeShare = 0.1, problem?: Problem): number {
  if (!BLOCK_MAP[blockId]) return 0;
  return modelOf(blockId, cfg, writeShare).cost + (blockId === "database" ? dataCost(problem, cfg) : 0);
}

/** Force every setting into its allowed range, so a hand-edited or old saved design cannot exceed the limits. */
export function clampCfg(def: BlockDef, cfg: Cfg): Cfg {
  const out: Cfg = { ...cfg };
  for (const sec of def.sections)
    for (const f of sec.fields) {
      if (f.type === "number" || f.type === "ratio") {
        const lo = f.type === "ratio" ? 0 : (f.min ?? -Infinity);
        const hi = f.type === "ratio" ? (f.max ?? 1) : (f.max ?? Infinity);
        const v = typeof out[f.key] === "number" && !Number.isNaN(out[f.key]) ? out[f.key] : f.default;
        out[f.key] = Math.min(hi, Math.max(lo, v));
      }
    }
  return out;
}

/** The one way the simulator and the UI read a block: clamped settings in, model out. */
export function modelOf(blockId: string, cfg: Cfg, writeShare = 0.1, burst = 1) {
  const def = BLOCK_MAP[blockId];
  return def.model({ ...clampCfg(def, cfg), _writeShare: writeShare, _burst: burst });
}
