import { BLOCK_MAP, blockCost, modelOf, money } from "../blocks";
import type {
  ConfidenceDetail,
  Design,
  Dimension,
  Finding,
  Problem,
  RequirementResult,
  RunResult,
  Scenario,
  ScenarioResult,
  Verdict,
} from "../types";
import { HOP_MS, simulate } from "./engine";
import { indexLabel, planQueries } from "./data";
import { isPlaceable, regionId, regionLabel } from "./regions";
import {
  GUARANTEE_LABEL,
  hostedCaps,
  hostsByCapability,
  isBackground,
  isOptionalHost,
  missingNeeds,
  needLabel,
  requestCaps,
  unmetGuarantees,
} from "./caps";

const COMPUTE = new Set(["server", "service", "websocket"]);

export function levelOf(score: number): "Weak" | "Fair" | "Strong" {
  return score < 50 ? "Weak" : score < 75 ? "Fair" : "Strong";
}

function labelOf(design: Design, id: string): string {
  const n = design.nodes.find((x) => x.id === id);
  if (!n) return id;
  const base = BLOCK_MAP[n.blockId]?.label ?? n.blockId;
  return n.responsibilities[0] ? `${base} (${n.responsibilities[0]})` : base;
}

export function totalCost(design: Design, problem: Problem): number {
  return design.nodes.reduce((a, n) => a + blockCost(n.blockId, n.cfg, problem.traffic.writeShare, problem), 0);
}

export function findingsFor(design: Design, problem: Problem, results: ScenarioResult[]): Finding[] {
  const out: Finding[] = [];
  const of = (id: string) => design.nodes.filter((n) => n.blockId === id);
  const has = (id: string) => of(id).length > 0;
  const edgesFrom = (id: string) => design.edges.filter((e) => e.source === id);
  const edgesTo = (id: string) => design.edges.filter((e) => e.target === id);

  if (!has("user")) {
    out.push({
      id: "no-user",
      severity: "bad",
      dimension: "scalability",
      title: "No traffic source",
      message: "Add a User block and connect it to your entry point. Nothing can be simulated without one.",
    });
    return out;
  }

  const lonely = design.nodes.filter((n) => !design.edges.some((e) => e.source === n.id || e.target === n.id));
  if (lonely.length && design.nodes.length > 1) {
    out.push({
      id: "disconnected",
      severity: "info",
      dimension: "scalability",
      nodeIds: lonely.map((n) => n.id),
      title: "Unconnected blocks",
      message: `${lonely.map((n) => labelOf(design, n.id)).join(", ")} ${lonely.length > 1 ? "are" : "is"} not connected to anything and has no effect.`,
    });
  }

  const singles = design.nodes.filter((n) => COMPUTE.has(n.blockId) && Number(n.cfg.replicas ?? 1) < 2);
  if (singles.length) {
    out.push({
      id: "single-instance",
      severity: "warn",
      dimension: "reliability",
      nodeIds: singles.map((n) => n.id),
      title: "Single server, no failover",
      message: `${singles.map((n) => labelOf(design, n.id)).join(", ")} runs as one instance. A restart or crash causes full downtime with no automatic recovery.`,
      why: "One instance is both a reliability risk and a hard throughput ceiling. Run at least two behind a balancer.",
    });
  }

  // several identical blocks behind one router: Replicas does the same job
  for (const router of design.nodes.filter((n) => ["load_balancer", "api_gateway", "reverse_proxy"].includes(n.blockId))) {
    const groups = new Map<string, string[]>();
    for (const e of edgesFrom(router.id)) {
      const t = design.nodes.find((n) => n.id === e.target);
      if (!t || t.blockId === "queue") continue;
      const key = t.blockId + JSON.stringify(t.cfg) + JSON.stringify(t.capabilities ?? null);
      groups.set(key, [...(groups.get(key) ?? []), t.id]);
    }
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      const label = BLOCK_MAP[design.nodes.find((n) => n.id === ids[0])!.blockId]?.label ?? "block";
      out.push({
        id: `copies-${ids[0]}`,
        severity: "info",
        dimension: "scalability",
        nodeIds: ids,
        title: `${ids.length} identical ${label}s`,
        message: `${ids.length} copies of the same ${label} sit behind ${labelOf(design, router.id)}. One ${label} with Replicas set to ${ids.length} (or more) does the same job and keeps the diagram readable.`,
      });
    }
  }

  const cost = totalCost(design, problem);
  if (problem.budget !== undefined && cost > problem.budget) {
    out.push({
      id: "over-budget",
      severity: "bad",
      dimension: "scalability",
      title: "Over budget",
      message: `This design costs about ${money(cost)} a month against a budget of ${money(problem.budget)}.`,
      why: "Capacity can always be bought. The skill is getting the same result cheaper: cache hot reads, use the CDN, scale the busy tier only.",
    });
  }
  for (const q of of("queue").filter((x) => !x.cfg.durable)) {
    out.push({
      id: `queue-volatile-${q.id}`,
      severity: "warn",
      dimension: "reliability",
      nodeIds: [q.id],
      title: "Queue is not durable",
      message: "Messages held only in memory are lost on a restart. Billing and tracking events should be persisted.",
    });
  }

  const dbs = of("database");
  const unguarded =
    problem.traffic.writeShare >= 0.5
      ? []
      : dbs.filter((db) =>
          edgesTo(db.id).some((e) => {
            const src = design.nodes.find((n) => n.id === e.source);
            if (!src || ["cache", "worker", "queue"].includes(src.blockId)) return false;
            return !edgesFrom(src.id).some((o) => design.nodes.find((n) => n.id === o.target)?.blockId === "cache");
          }),
        );
  if (unguarded.length) {
    out.push({
      id: "unguarded-db",
      severity: "warn",
      dimension: "scalability",
      nodeIds: unguarded.map((n) => n.id),
      title: "Unguarded database reads",
      message: "Every read goes straight to storage. As request volume grows, connection pools and I/O become the ceiling.",
      why: "A single unguarded database is both a reliability risk and a throughput ceiling: reads and writes compete for the same I/O. Put a cache in front of hot reads.",
    });
  }
  // ----- data model: queries, indexes, paging and shard keys -----
  if (problem.dataModel) {
    for (const db of dbs) {
      const dp = planQueries(problem, db.cfg, problem.capabilities ?? []);
      const scans = dp.queries.filter((q) => q.scan && q.factor >= 20);
      const slow = dp.queries.filter((q) => !scans.includes(q) && q.op === "read" && q.factor >= 1.5);
      if (scans.length) {
        out.push({
          id: `query-scan-${db.id}`,
          severity: "bad",
          dimension: "latency",
          nodeIds: [db.id],
          title: "A query reads a whole table",
          message: scans.map((q) => `"${q.label}": ${q.why[0] ?? q.plan}.`).join(" "),
          why: "Without a way to jump straight to the rows it needs, the database has to read every row. That is fine for a few thousand rows and ruinous for millions: each such request costs as much as hundreds or thousands of ordinary ones.",
        });
      }
      if (slow.length) {
        out.push({
          id: `query-slow-${db.id}`,
          severity: "warn",
          dimension: "latency",
          nodeIds: [db.id],
          title: "Some queries do more work than they need to",
          message: slow.map((q) => `"${q.label}": ${q.why.join("; ") || q.plan}.`).join(" "),
          why: "An index that matches both what a query filters on and how it sorts lets the database read just the rows it returns. Missing that, it reads extra rows, sorts in memory, steps over earlier pages, or asks every shard.",
        });
      }
      const writeQ = dp.queries.filter((q) => q.op === "write" && q.factor > 1.3);
      if (writeQ.length) {
        out.push({
          id: `index-overhead-${db.id}`,
          severity: "warn",
          dimension: "scalability",
          nodeIds: [db.id],
          title: "More indexes than the queries need",
          message: `Every write also updates ${dp.indexes.length} index${dp.indexes.length === 1 ? "" : "es"} (${dp.indexes.map(indexLabel).join("; ")}), which makes writes about ${Math.round((writeQ[0].factor - 1) * 100)}% more expensive than they need to be.`,
          why: "An index speeds up the reads it matches and slows down every write. Keep the ones your queries use, and drop the rest, especially when writes are frequent.",
        });
      }
      if (dp.skew < 0.7) {
        out.push({
          id: `shard-skew-${db.id}`,
          severity: "warn",
          dimension: "scalability",
          nodeIds: [db.id],
          title: "A shard key sends most traffic to one shard",
          message: `Only about ${Math.round(dp.skew * 100)}% of the shards' combined capacity is usable, because the shard key puts a lot of the load on a few of them.`,
          why: "A good shard key has very many different values and no trend over time. A key like a timestamp, a counter, or a category with only a few values makes one shard the busy one however many you add.",
        });
      }
    }
  }
  // ----- regions -----
  if (
    problem.regions &&
    problem.scenarios.some(
      (s) =>
        (s.regionMix && Object.keys(s.regionMix).some((r) => r !== problem.regions!.home && (s.regionMix![r] ?? 0) > 0.05)) ||
        s.failure?.target.region,
    )
  ) {
    const placed = design.nodes.filter((n) => isPlaceable(n.blockId));
    const used = new Set(placed.map((n) => regionId(n.cfg.region, regionId(problem.regions!.home))));
    if (placed.length && used.size === 1) {
      const only = [...used][0];
      out.push({
        id: "single-region",
        severity: "warn",
        dimension: "reliability",
        title: "Everything runs in one region",
        message: `All of this runs in ${regionLabel(only)}. Users on other continents wait for every call to cross the ocean, and if that region goes down nothing is left.`,
        why: "A second region needs its own servers and a copy of the data, and users have to be sent to whichever region is closest and still up. It costs more, which is why it is a trade-off and not a default.",
      });
    }
  }
  const spofDb = dbs.filter((d) => Number(d.cfg.readReplicas ?? 0) < 1 && Number(d.cfg.shards ?? 1) < 2);
  if (spofDb.length) {
    out.push({
      id: "db-spof",
      severity: "warn",
      dimension: "reliability",
      nodeIds: spofDb.map((n) => n.id),
      title: "Database has no replica",
      message: "A single database node means one failure stops every request that needs it.",
    });
  }

  if (!has("rate_limiter") && !has("api_gateway")) {
    out.push({
      id: "no-rate-limit",
      severity: "info",
      dimension: "faultIsolation",
      title: "No rate limiting",
      message: "Uncapped per-client load lets one misbehaving client use up capacity that every other user needs.",
    });
  }

  const searchy = design.nodes.filter((n) => n.responsibilities.some((r) => /search/i.test(r)));
  if (searchy.length && !has("search_index")) {
    out.push({
      id: "search-on-db",
      severity: "warn",
      dimension: "latency",
      title: "Search without a search index",
      message: "Text queries scan relational storage and slow down every other query under load.",
    });
  }

  const dead = of("queue").filter((q) => !edgesFrom(q.id).length);
  if (dead.length) {
    out.push({
      id: "queue-no-consumer",
      severity: "bad",
      dimension: "faultIsolation",
      nodeIds: dead.map((n) => n.id),
      title: "Queue with no consumer",
      message: "Messages go in but nothing reads them. Connect the queue to a Worker.",
    });
  }

  const nonIdem = of("worker").filter((w) => !w.cfg.idempotent && Number(w.cfg.maxRetries ?? 0) > 0);
  if (nonIdem.length) {
    out.push({
      id: "worker-idempotency",
      severity: "warn",
      dimension: "reliability",
      nodeIds: nonIdem.map((n) => n.id),
      title: "Retries without idempotency",
      message: "A retried job can be applied twice. Make the worker idempotent or turn retries off.",
    });
  }

  // a caller that runs something essential has no fallback, so a breaker is no remedy; only warn for optional callers
  const hostedAll = hostedCaps(design, problem);
  const risky = of("third_party").filter((t) =>
    edgesTo(t.id).some((e) => {
      const src = design.nodes.find((n) => n.id === e.source);
      if (!src || e.kind === "async" || !["server", "service", "websocket"].includes(src.blockId) || src.cfg.circuitBreaker) return false;
      return !requestCaps(hostedAll.get(src.id) ?? []).some((c) => c.critical);
    }),
  );
  if (risky.length) {
    out.push({
      id: "third-party-sync",
      severity: "warn",
      dimension: "faultIsolation",
      nodeIds: risky.map((n) => n.id),
      title: "Unprotected external call",
      message: "An external provider is called synchronously with no circuit breaker. If it slows down, your requests slow down with it.",
    });
  }

  // ----- capabilities: monolith vs microservices -----
  const capList = problem.capabilities ?? [];
  if (capList.length) {
    const hosted = hostedCaps(design, problem);
    const hostMap = hostsByCapability(hosted);
    const nameOf = (id: string) => labelOf(design, id);

    for (const c of capList) {
      if ((hostMap.get(c.id)?.length ?? 0) > 0) continue;
      const critical = !isBackground(c) && c.critical;
      out.push({
        id: `unhosted-${c.id}`,
        severity: critical ? "bad" : "warn",
        dimension: "reliability",
        title: `Nothing runs "${c.label}"`,
        message: critical
          ? "Some requests cannot be served without this. Select a Server or Service and tick it under Hosts."
          : isBackground(c)
            ? "No block runs this background job, so it never happens. Put it on a Worker, or on a server if you accept it competing with requests."
            : "No block runs this feature, so it is missing from the design.",
      });
    }

    for (const n of design.nodes) {
      for (const { cap, need } of missingNeeds(design, n.id, hosted.get(n.id) ?? [])) {
        const what = needLabel(need);
        out.push({
          id: `needs-${cap.id}-${n.id}`,
          severity: "bad",
          dimension: "reliability",
          nodeIds: [n.id],
          title: `"${cap.label}" has no ${what}`,
          message: `${nameOf(n.id)} runs "${cap.label}", which depends on an external provider. Connect it (directly, or through a cache) to a ${what}.`,
          why: "Providers have their own rate limits and latency. Put a cache in front, call them behind a timeout, and size for their limits.",
        });
      }
      for (const { cap, guarantee, fix } of unmetGuarantees(design, n.id, hosted.get(n.id) ?? [])) {
        out.push({
          id: `guarantee-${guarantee}-${cap.id}-${n.id}`,
          severity: "bad",
          dimension: "reliability",
          nodeIds: [n.id],
          title: `"${cap.label}" can give wrong results`,
          message: `It needs ${GUARANTEE_LABEL[guarantee]}. ${fix}`,
          why: "Without a lock or an idempotency guarantee, two requests at the same moment can both succeed (a double booking) or one request can be applied twice.",
        });
      }
      const list = hosted.get(n.id) ?? [];
      const req = requestCaps(list);
      if (req.length >= 2 && req.some((c) => c.critical) && req.some((c) => !c.critical)) {
        const optional = req
          .filter((c) => !c.critical)
          .map((c) => `"${c.label}"`)
          .join(", ");
        out.push({
          id: `shared-fate-${n.id}`,
          severity: "warn",
          dimension: "faultIsolation",
          nodeIds: [n.id],
          title: "Shared fate",
          message: `${nameOf(n.id)} runs ${optional} in the same process as "${req.find((c) => c.critical)!.label}". If the optional part slows or crashes, the core request goes down with it.`,
          why: "A monolith has one failure domain. That is fine when the parts are equally important. Split off the optional part and call it behind a circuit breaker.",
        });
      }
      const bg = list.filter(isBackground);
      if (bg.length && req.length) {
        out.push({
          id: `bg-on-path-${n.id}`,
          severity: "warn",
          dimension: "scalability",
          nodeIds: [n.id],
          title: "Background job shares a request server",
          message: `${bg.map((c) => `"${c.label}"`).join(", ")} runs inside ${nameOf(n.id)}, which also serves requests, so every sweep takes capacity from users.`,
        });
      }
      if (bg.length && !design.edges.some((e) => e.source === n.id)) {
        out.push({
          id: `bg-no-target-${n.id}`,
          severity: "info",
          dimension: "reliability",
          nodeIds: [n.id],
          title: "Background job has nothing to work on",
          message: `${nameOf(n.id)} runs ${bg.map((c) => `"${c.label}"`).join(", ")} but is not connected to the data it works on, so it adds no load and changes nothing.`,
        });
      }
    }

    // callers of an optional dependency need a circuit breaker, looking through plain plumbing (balancers, gateways)
    const callers = (id: string, seen = new Set<string>()): string[] => {
      const res: string[] = [];
      for (const e of design.edges.filter((x) => x.target === id && x.kind !== "async")) {
        if (seen.has(e.source)) continue;
        seen.add(e.source);
        const src = design.nodes.find((n) => n.id === e.source);
        if (!src || src.blockId === "user") continue;
        if (requestCaps(hosted.get(src.id) ?? []).length || src.blockId === "server" || src.blockId === "service") res.push(src.id);
        else res.push(...callers(src.id, seen));
      }
      return res;
    };
    for (const n of design.nodes) {
      if (!isOptionalHost(hosted.get(n.id) ?? [])) continue;
      const bad = callers(n.id).filter((cid) => !design.nodes.find((x) => x.id === cid)?.cfg.circuitBreaker);
      if (bad.length) {
        out.push({
          id: `optional-no-cb-${n.id}`,
          severity: "warn",
          dimension: "faultIsolation",
          nodeIds: [n.id, ...bad],
          title: "Optional service called without a circuit breaker",
          message: `${bad.map(nameOf).join(", ")} waits on ${nameOf(n.id)} but the page can work without it. Turn on the circuit breaker so a slow or failed ${nameOf(n.id)} is skipped instead of dragging requests down.`,
        });
      }
    }

    // long synchronous chains
    const depth = new Map<string, number>();
    const walk = (id: string, seen: Set<string>): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      let best = 0;
      const self = design.nodes.find((n) => n.id === id);
      // only calls made by application servers and services count; entry plumbing and cache or database lookups do not
      const counts = !!self && ["server", "service", "websocket"].includes(self.blockId);
      for (const e of design.edges.filter((x) => x.source === id && x.kind !== "async")) {
        const t = design.nodes.find((n) => n.id === e.target);
        if (!t) continue;
        best = Math.max(best, (counts ? 1 : 0) + walk(t.id, seen));
      }
      seen.delete(id);
      depth.set(id, best);
      return best;
    };
    const longest = Math.max(0, ...design.nodes.filter((n) => n.blockId === "user").map((u) => walk(u.id, new Set())));
    if (longest >= 4) {
      out.push({
        id: "chatty",
        severity: "warn",
        dimension: "latency",
        title: `${longest} service-to-service calls in a row`,
        message: `Every hop adds about ${HOP_MS} ms and another way to fail. Merge services that always run together, or move some calls off the request path with a queue.`,
      });
    }

    const reqCaps = capList.filter((c) => !isBackground(c));
    const reqHosts = new Set(reqCaps.flatMap((c) => hostMap.get(c.id) ?? []));
    if (reqCaps.length >= 2 && reqHosts.size === 1 && reqCaps.every((c) => hostMap.has(c.id))) {
      out.push({
        id: "monolith",
        severity: "info",
        dimension: "faultIsolation",
        nodeIds: [...reqHosts],
        title: "Monolith",
        message: `One block (${nameOf([...reqHosts][0])}) runs every request capability: no network hops and a single thing to deploy, but one failure domain and everything must scale together.`,
      });
    }
    if (
      reqHosts.size >= 2 &&
      reqCaps.some((c) => !c.critical) &&
      !out.some((f) => f.id.startsWith("optional-no-cb") || f.id.startsWith("shared-fate"))
    ) {
      out.push({
        id: "isolation-ok",
        severity: "ok",
        dimension: "faultIsolation",
        title: "Optional features are isolated",
        message: `Optional capabilities run in their own service behind a circuit breaker, so they cannot take the core request down. That isolation has a price: ${reqHosts.size} separate services to run and keep healthy (about ${money([...reqHosts].reduce((a, id) => a + blockCost(design.nodes.find((n) => n.id === id)!.blockId, design.nodes.find((n) => n.id === id)!.cfg, problem.traffic.writeShare), 0))} a month for those blocks), and up to ${Math.max(longest, 1)} service-to-service call${longest > 1 ? "s" : ""} in a row, each adding about ${HOP_MS} ms. Whether that is worth it depends on how bad it would be for the optional part to fail.`,
      });
    }
  }

  // positives
  if (has("cdn"))
    out.push({
      id: "cdn-ok",
      severity: "ok",
      dimension: "latency",
      title: "Edge delivery active",
      message: "The CDN serves repeat content from the nearest edge, reducing origin load and user-perceived latency.",
    });
  if (of("load_balancer").some((l) => Number(l.cfg.instances ?? 1) >= 2))
    out.push({
      id: "lb-ok",
      severity: "ok",
      dimension: "reliability",
      title: "Traffic is balanced",
      message: "A load balancer with multiple instances removes itself as a single point of failure.",
    });
  if (design.nodes.some((n) => n.cfg.circuitBreaker))
    out.push({
      id: "cb-ok",
      severity: "ok",
      dimension: "faultIsolation",
      title: "Circuit breaker in place",
      message: "Slow or failed dependencies are cut off with a fallback instead of dragging callers down.",
    });
  if (has("queue") && has("worker") && !dead.length)
    out.push({
      id: "async-ok",
      severity: "ok",
      dimension: "faultIsolation",
      title: "Work is decoupled",
      message: "Slow or bursty work is moved off the request path through a queue.",
    });
  if (of("cache").length && dbs.length && !unguarded.length)
    out.push({
      id: "cache-ok",
      severity: "ok",
      dimension: "scalability",
      title: "Reads are cached",
      message: "A cache absorbs hot reads so the database sees only misses.",
    });

  // from simulation: one finding per distinct set of saturated blocks
  const groups = new Map<string, { ids: string[]; titles: string[]; r: ScenarioResult }>();
  for (const r of results) {
    const hurt = r.saturated.filter((id) => r.nodes[id]?.incoming > 0);
    if (!hurt.length || r.pass) continue;
    const key = [...hurt].sort().join(",");
    const g = groups.get(key) ?? { ids: hurt, titles: [], r };
    g.titles.push(r.title);
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    out.push({
      id: `sat-${key}`,
      severity: "bad",
      dimension: "scalability",
      nodeIds: g.ids,
      title: `Capacity exceeded: ${g.ids.map((id) => labelOf(design, id)).join(", ")}`,
      message: `Cannot handle the load in: ${g.titles.join("; ")}. Peak offered ${Math.round(g.r.offered).toLocaleString()} rps with ${Math.round(g.r.served * 100)}% served.`,
      why: "Add instances, cache hot reads, or shed load earlier in the path.",
    });
  }
  return out;
}

export function confidenceFor(design: Design, problem: Problem, results: ScenarioResult[], findings: Finding[]): Record<Dimension, number> {
  const mean = (xs: number[], d: number) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : d);
  const failing = results.filter((r, i) => problem.scenarios[i].failure);
  const loading = results.filter((r, i) => !problem.scenarios[i].failure);
  const normal = results.find((r, i) => problem.scenarios[i].trafficMultiplier === 1 && !problem.scenarios[i].failure);

  const scalability = mean(
    loading.map((r) => r.score),
    0,
  );
  const parts = design.nodes.filter((n) => !["user", "queue", "third_party"].includes(n.blockId));
  const redundant = parts.length
    ? parts.filter((n) => (modelOf(n.blockId, n.cfg, problem.traffic.writeShare).instances ?? 1) >= 2).length / parts.length
    : 0;
  const reliability =
    0.5 * redundant * 100 +
    0.5 *
      mean(
        failing.map((r) => r.score),
        60,
      );
  const has = (id: string) => design.nodes.some((n) => n.blockId === id);
  let iso = 20;
  if (has("queue") && has("worker")) iso += 30;
  if (design.nodes.some((n) => n.cfg.circuitBreaker)) iso += 30;
  if (has("rate_limiter") || has("api_gateway")) iso += 20;
  if (findings.some((f) => f.id === "third-party-sync")) iso -= 15;
  const faultIsolation =
    0.6 * Math.max(0, Math.min(100, iso)) +
    0.4 *
      mean(
        failing.map((r) => (r.pass ? 100 : r.score * 0.6)),
        50,
      );
  const latency = normal ? (normal.latencyMs <= problem.latencyTargetMs ? 100 : (problem.latencyTargetMs / normal.latencyMs) * 100) : 0;

  const clamp = (x: number) => Math.round(Math.max(0, Math.min(100, x)));
  return {
    scalability: clamp(scalability),
    reliability: clamp(reliability),
    faultIsolation: clamp(faultIsolation),
    latency: clamp(latency),
  };
}

/** Spell out how each confidence score was made, so a learner can see which choices moved it. */
export function explainConfidence(
  design: Design,
  problem: Problem,
  results: ScenarioResult[],
  findings: Finding[],
): Record<Dimension, ConfidenceDetail> {
  const failing = results.filter((r, i) => problem.scenarios[i].failure);
  const loading = results.filter((r, i) => !problem.scenarios[i].failure);
  const normal = results.find((r, i) => problem.scenarios[i].trafficMultiplier === 1 && !problem.scenarios[i].failure);
  const has = (id: string) => design.nodes.some((n) => n.blockId === id);
  const label = (id: string) => labelOf(design, id);

  const parts = design.nodes.filter((n) => !["user", "queue", "third_party"].includes(n.blockId));
  const single = parts.filter((n) => (modelOf(n.blockId, n.cfg, problem.traffic.writeShare).instances ?? 1) < 2);
  const sat = [...new Set(loading.flatMap((r) => r.saturated))];
  const scenarioItems = (list: ScenarioResult[]) =>
    list.map((r) => ({ label: r.title, value: `${r.score}${r.pass ? "" : ", failed"}`, good: r.pass }));

  return {
    scalability: {
      how: "The average score of the scenarios that only add load. Each scenario scores requests served (55%), latency against the target (30%) and background work keeping up (15%).",
      items: scenarioItems(loading),
      tip: sat.length
        ? `Blocks that ran out of capacity: ${sat.map(label).join(", ")}. More replicas, a cache in front, or autoscaling would lift this.`
        : undefined,
    },
    reliability: {
      how: "Half from redundancy (the share of blocks you run that have two or more instances; outside providers are not counted, since you cannot replicate them) and half from how the failure scenarios score.",
      items: [
        {
          label: "Blocks running 2 or more instances",
          value: `${parts.length - single.length} of ${parts.length}`,
          good: single.length === 0,
        },
        ...scenarioItems(failing),
      ],
      tip: single.length
        ? `Single-instance blocks: ${single.map((n) => label(n.id)).join(", ")}. Each one is a place where a single failure takes a capability away.`
        : undefined,
    },
    faultIsolation: {
      how: "60% from isolation features, starting at 20 and adding points for each, and 40% from how the failure scenarios turned out. The goal is that one failure stays small.",
      items: [
        {
          label: "Queue and worker decouple slow work (+30)",
          value: has("queue") && has("worker") ? "present" : "missing",
          good: has("queue") && has("worker"),
        },
        {
          label: "A circuit breaker protects callers (+30)",
          value: design.nodes.some((n) => n.cfg.circuitBreaker) ? "present" : "missing",
          good: design.nodes.some((n) => n.cfg.circuitBreaker),
        },
        {
          label: "Rate limiter or API gateway (+20)",
          value: has("rate_limiter") || has("api_gateway") ? "present" : "missing",
          good: has("rate_limiter") || has("api_gateway"),
        },
        ...(findings.some((f) => f.id === "third-party-sync")
          ? [{ label: "Unprotected call to an outside provider (-15)", value: "found", good: false as boolean }]
          : []),
        ...scenarioItems(failing),
      ],
    },
    latency: {
      how: "How the typical-peak latency compares with the target: full marks at or under the target, otherwise the target divided by the latency.",
      items: normal
        ? [
            {
              label: "Typical peak latency",
              value: `${Math.round(normal.latencyMs)} ms (target ${problem.latencyTargetMs} ms)`,
              good: normal.latencyMs <= problem.latencyTargetMs,
            },
          ]
        : [],
      tip:
        normal && normal.latencyMs > problem.latencyTargetMs
          ? "The slowest block on the call path sets this. A cache in front of it, or less work on the request path, brings it down."
          : undefined,
    },
  };
}

export function evaluateRequirements(
  design: Design,
  problem: Problem,
  results: ScenarioResult[],
  verdicts?: Verdict[],
): RequirementResult[] {
  return problem.requirements.map((r) => {
    const c = r.check;
    let met: boolean | null = false;
    let byAi = false;
    let detail = "";
    if (c.type === "scenario") {
      const res = results.find((x) => x.scenarioId === c.scenario);
      if (!res) detail = "Scenario not found.";
      else {
        const v = c.metric === "latencyMs" ? res.latencyMs : res.served;
        met = res.offered > 0 && (c.op === "<=" ? v <= c.value : v >= c.value);
        detail =
          c.metric === "latencyMs"
            ? `${Math.round(v)} ms (target ${c.op} ${c.value} ms)`
            : `${(v * 100).toFixed(1)}% served (target ${c.op} ${c.value * 100}%)`;
      }
    } else if (c.type === "has") {
      const missing = c.blocks.filter((b) => !design.nodes.some((n) => n.blockId === b));
      met = missing.length === 0;
      detail = met ? "All required blocks are present." : `Missing: ${missing.map((b) => BLOCK_MAP[b]?.label ?? b).join(", ")}`;
    } else if (c.type === "asyncEdge") {
      met = design.edges.some((e) => e.kind === "async");
      detail = met ? "An async connection exists." : "No async connection yet. Select a connection and switch it to async.";
    } else if (c.type === "hosted" || c.type === "isolated") {
      const hostedMap = hostedCaps(design, problem);
      const hosts = hostsByCapability(hostedMap).get(c.capability) ?? [];
      const cap = problem.capabilities?.find((x) => x.id === c.capability);
      if (!hosts.length) {
        met = false;
        detail = `Nothing runs "${cap?.label ?? c.capability}".`;
      } else if (c.type === "hosted") {
        met = true;
        detail = `Runs on ${hosts.map((h) => labelOf(design, h)).join(", ")}.`;
      } else {
        const shared = hosts.filter((h) => requestCaps(hostedMap.get(h) ?? []).some((x) => x.critical && x.id !== c.capability));
        met = shared.length === 0;
        detail = met
          ? `Runs separately on ${hosts.map((h) => labelOf(design, h)).join(", ")}.`
          : `Shares ${shared.map((h) => labelOf(design, h)).join(", ")} with the core request.`;
      }
    } else if (c.type === "queryPlans") {
      const dbs = design.nodes.filter((n) => n.blockId === "database");
      if (!problem.dataModel || !dbs.length) {
        met = false;
        detail = "No database to check yet.";
      } else {
        const worst = dbs
          .flatMap((db) => planQueries(problem, db.cfg, problem.capabilities ?? []).queries)
          .sort((a, b) => b.factor - a.factor)[0];
        met = !worst || worst.factor < 3;
        detail = met
          ? "Every query is served by a key or an index, with no whole-table reads or large sorts."
          : `"${worst.label}" is ${Math.round(worst.factor).toLocaleString()} times more work than it needs to be: ${worst.why[0] ?? worst.plan}.`;
      }
    } else if (c.type === "scenarioPass") {
      const res = results.find((x) => x.scenarioId === c.scenario);
      met = !!res && res.pass;
      detail = !res
        ? "Scenario not found."
        : met
          ? `Passes: ${Math.round(res.served * 100)}% of requests served.`
          : (res.reasons[0] ?? res.notes[0] ?? "Scenario fails.");
    } else if (c.type === "budget") {
      const cost = totalCost(design, problem);
      met = problem.budget === undefined ? true : cost <= problem.budget;
      detail = problem.budget === undefined ? "No budget set." : `${money(cost)} a month (budget ${money(problem.budget)})`;
    } else if (c.type === "noSaturation") {
      const res = results.find((x) => x.scenarioId === c.scenario);
      met = !!res && res.saturated.length === 0;
      detail = met ? "Nothing saturates." : "Something saturates.";
    } else {
      // subjective: the problem author left this one to the AI review
      const v = verdicts?.find((x) => x.id === r.id);
      if (v) {
        met = v.met;
        byAi = true;
        detail = `Judged by the AI review: ${v.reason || (v.met ? "satisfied." : "not satisfied.")}`;
      } else {
        met = null;
        detail = "Judged by the AI review. Run it on the Analysis tab.";
      }
    }
    return { id: r.id, text: r.text, met, byAi: byAi || undefined, detail };
  });
}

/** `followUps` are the interviewer's extra tests (run, not scored); `verdicts` are AI decisions on subjective requirements. */
export function analyze(design: Design, problem: Problem, opts: { followUps?: Scenario[]; verdicts?: Verdict[] } = {}): RunResult {
  const scenarios = problem.scenarios.map((s) => simulate(design, problem, s));
  const findings = findingsFor(design, problem, scenarios);
  const confidence = confidenceFor(design, problem, scenarios, findings);
  const requirements = evaluateRequirements(design, problem, scenarios, opts.verdicts);
  // the interviewer's extra questions run on the same design, but do not change the score
  const interview = (opts.followUps ?? []).map((s) => simulate(design, problem, s));
  const confidenceTotal = Math.round(
    (confidence.scalability + confidence.reliability + confidence.faultIsolation + confidence.latency) / 4,
  );
  const scenAvg = scenarios.reduce((a, s) => a + s.score, 0) / Math.max(1, scenarios.length);
  const reqPct = requirements.filter((r) => r.met).length / Math.max(1, requirements.length);
  const cost = totalCost(design, problem);
  let score = design.nodes.length ? Math.round(0.5 * scenAvg + 0.25 * reqPct * 100 + 0.25 * confidenceTotal) : 0;
  // an over-budget design cannot be a good answer however well it performs
  if (problem.budget !== undefined && cost > problem.budget) score = Math.min(score, 60);
  const confidenceDetail = explainConfidence(design, problem, scenarios, findings);
  const scoreParts = {
    scenarios: Math.round(scenAvg),
    requirements: Math.round(reqPct * 100),
    confidence: confidenceTotal,
    capped: problem.budget !== undefined && cost > problem.budget ? "Over budget: the score is capped at 60." : undefined,
  };
  return {
    scenarios,
    findings,
    confidence,
    confidenceTotal,
    confidenceDetail,
    interview,
    scoreParts,
    requirements,
    score,
    cost,
    budget: problem.budget,
  };
}
