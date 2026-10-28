import { BLOCK_MAP, modelOf } from "../blocks";
import type { BlockModel, Capability, Design, DesignNode, NodeResult, Problem, Scenario, ScenarioResult } from "../types";
import { applyDataPlan, planQueries } from "./data";
import { REGIONS, copyRegions, isPlaceable, regionId, regionLabel, regionShort, rtt, type RegionId } from "./regions";
import {
  GUARANTEE_LABEL,
  hostedCaps,
  hostsByCapability,
  isBackground,
  isOptionalHost,
  missingNeeds,
  needLabel,
  providerKindId,
  reachableNodes,
  shareOf,
  unmetGuarantees,
  workFactor,
} from "./caps";

/** Network time added by each synchronous call between two blocks, in ms. */
export const HOP_MS = 2;

interface SimNode {
  node: DesignNode;
  model: BlockModel;
  role?: "source" | "queue" | "consumer";
  caps: Capability[];
  /** largest request-capability share this block runs (undefined: runs none, so it is just plumbing) */
  share?: number;
  /** share of all requests that reach this point of the graph, inherited through plumbing blocks */
  ctx: number;
  /** work one request costs here (>1 for a monolith, <1 for a light dedicated service) */
  work: number;
  /** background work this block runs itself, in work units/s and operations/s */
  bgWork: number;
  bgOps: number;
  /** background operations/s arriving from upstream hosts (e.g. an expiry sweep deleting rows) */
  bgIn: number;
  incoming: number;
  /** where the traffic that reaches this block comes from (the users' region), when the scenario has several */
  byOrigin: Record<string, number>;
  /** the region it runs in; undefined for blocks that are everywhere (users, CDN edge, outside providers) */
  region?: RegionId;
  /** how much of `incoming` is writes; the rest is reads */
  inW: number;
  handled: number;
  down: boolean;
  /** what is left of the block's capacity after a failure took an instance (1 = untouched) */
  capLeft: number;
}

/** Latency grows as a block approaches its capacity (queueing), capped to keep numbers sane. */
function inflation(u: number): number {
  if (u <= 0.7) return 1;
  return Math.min(12, 1 + 3 * ((u - 0.7) / 0.3) ** 2 + Math.max(0, u - 1) * 8);
}

function pickFailureTarget(nodes: SimNode[], f: NonNullable<Scenario["failure"]>): SimNode | undefined {
  const { responsibility, types, capability, nodeId } = f.target;
  if (nodeId) {
    const hit = nodes.find((n) => n.node.id === nodeId);
    if (hit) return hit;
  }
  if (capability) {
    const hit = nodes.find((n) => n.caps.some((c) => c.id === capability));
    if (hit) return hit;
  }
  if (responsibility) {
    const re = new RegExp(responsibility, "i");
    const hit = nodes.find((n) => n.node.responsibilities.some((r) => re.test(r)));
    if (hit) return hit;
  }
  for (const t of types ?? []) {
    const hit = nodes.find((n) => n.node.blockId === t && (!f.target.kind || providerKindId(n.node.cfg) === f.target.kind));
    if (hit) return hit;
  }
  return undefined;
}

/** Take one copy of a block away. Returns true when a cache vanished entirely and reads fall through to the store. */
function takeCopyDown(n: SimNode): boolean {
  const m = n.model;
  n.capLeft = Math.max(0, m.instances - 1) / Math.max(1, m.instances);
  m.capacity = m.capacity * n.capLeft;
  m.instances = Math.max(0, m.instances - 1);
  n.down = m.capacity <= 0;
  if (n.down && n.node.blockId === "cache") {
    // cache-aside: with the cache gone every read falls through to whatever sits behind it
    m.capacity = Infinity;
    m.passThrough = 1;
    m.latencyMs = 0;
    return true;
  }
  return false;
}

export function simulate(design: Design, problem: Problem, scenario: Scenario): ScenarioResult {
  const notes: string[] = [];
  const advice: { change: string; why: string }[] = [];
  const hasCaps = (problem.capabilities?.length ?? 0) > 0;
  const regionsOn = !!problem.regions;
  const home: RegionId = regionId(problem.regions?.home);
  // where the users are: spread by the scenario, otherwise all at home
  const mix: Record<string, number> = {};
  if (regionsOn) {
    const raw = scenario.regionMix ?? { [home]: 1 };
    const total = Object.values(raw).reduce((a, b) => a + Math.max(0, b), 0) || 1;
    for (const r of REGIONS) if ((raw[r.id] ?? 0) > 0) mix[r.id] = raw[r.id] / total;
  }
  const origins: string[] = regionsOn ? REGIONS.map((r) => r.id).filter((r) => (mix[r] ?? 0) > 0) : ["_"];
  // a scenario can make some capabilities busier (a celebrity posts, a deploy storm of metrics)
  const scaledCaps = (problem.capabilities ?? []).map((c) => {
    const m = scenario.capabilityLoad?.[c.id];
    if (!m) return c;
    return isBackground(c) ? { ...c, jobsPerSec: (c.jobsPerSec ?? 0) * m } : { ...c, share: Math.min(1, c.share * m) };
  });
  const hosted = hostedCaps(design, { ...problem, capabilities: scaledCaps });
  const hostIds = hostsByCapability(hosted);

  const sim = new Map<string, SimNode>();
  for (const node of design.nodes) {
    const def = BLOCK_MAP[node.blockId];
    if (!def) continue;
    const caps = hosted.get(node.id) ?? [];
    const localBurst = scenario.trafficMultiplier * Math.max(1, ...caps.map((c) => scenario.capabilityLoad?.[c.id] ?? 1));
    const cfgForModel =
      node.blockId === "cache" && problem.cacheHitCap !== undefined
        ? { ...node.cfg, hitRatio: Math.min(Number(node.cfg.hitRatio ?? 0.8), problem.cacheHitCap) }
        : node.cfg;
    let model = modelOf(node.blockId, cfgForModel, problem.traffic.writeShare, localBurst);
    // what the player chose for indexes, shard keys and paging decides what each query really costs
    if (node.blockId === "database" && problem.dataModel)
      model = applyDataPlan(model, planQueries(problem, node.cfg, scaledCaps), problem.traffic.writeShare);
    let bgWork = 0;
    let bgOps = 0;
    for (const c of caps.filter(isBackground)) {
      const share = (c.jobsPerSec ?? 0) / Math.max(1, hostIds.get(c.id)?.length ?? 1);
      bgOps += share;
      bgWork += share * c.work;
    }
    sim.set(node.id, {
      node,
      model: { ...model },
      role: def.role,
      caps,
      share: shareOf(caps),
      ctx: 1,
      work: caps.length > 0 && caps.every(isBackground) ? 0.005 : workFactor(caps),
      bgWork,
      bgOps,
      bgIn: 0,
      incoming: 0,
      byOrigin: {},
      region: regionsOn && isPlaceable(node.blockId) ? regionId(node.cfg.region, home) : undefined,
      inW: 0,
      handled: 0,
      down: false,
      capLeft: 1,
    });
  }
  const all = [...sim.values()];

  // ----- failure injection -----
  let failureTarget: SimNode | undefined;
  let peers: SimNode[] = [];
  let failedInstancesBefore = 0;
  const failedNodes: SimNode[] = [];
  let regionDown: RegionId | undefined;
  if (scenario.failure && scenario.failure.target.region && regionsOn) {
    // a whole region goes away: everything running there stops. A database with a copy elsewhere fails over and keeps going.
    const R = regionId(scenario.failure.target.region);
    regionDown = R;
    const gone: string[] = [];
    for (const n of all) {
      if (n.role === "source" || n.region === undefined) continue;
      const m = n.model;
      if (n.node.blockId === "database") {
        const copies = copyRegions(n.node.cfg, n.region);
        const left = 1 + Number(n.node.cfg.readReplicas ?? 0) + copies.length;
        const survivors = copies.filter((c) => c !== R);
        if (n.region === R && survivors.length) {
          n.capLeft = (left - 1) / left;
          m.capacity *= n.capLeft;
          n.region = survivors[0];
          notes.push(
            `${label(n)} lost its primary in ${regionLabel(R)} and failed over to its copy in ${regionLabel(survivors[0])}, at reduced capacity.`,
          );
          failedNodes.push(n);
          continue;
        }
        if (n.region !== R && copies.includes(R)) {
          n.capLeft = (left - 1) / left;
          m.capacity *= n.capLeft;
          notes.push(`${label(n)} lost its copy in ${regionLabel(R)} and kept running.`);
          failedNodes.push(n);
          continue;
        }
      }
      if (n.region !== R) continue;
      n.capLeft = 0;
      m.capacity = 0;
      m.instances = 0;
      if (m.readCapacity !== undefined) m.readCapacity = 0;
      if (m.writeCapacity !== undefined) m.writeCapacity = 0;
      n.down = true;
      gone.push(label(n));
      failedNodes.push(n);
    }
    notes.push(
      gone.length
        ? `${regionLabel(R)} went down: ${gone.join(", ")} stopped.`
        : `${regionLabel(R)} went down, but nothing in your design runs there.`,
    );
  } else if (scenario.failure) {
    failureTarget = pickFailureTarget(all, scenario.failure);
    if (!failureTarget) {
      const cap = scenario.failure.target.capability;
      const name = cap ? problem.capabilities?.find((c) => c.id === cap)?.label : undefined;
      notes.push(
        name
          ? `Nothing in your design runs "${name}", so this failure had no effect.`
          : "No block in your design matches this failure, so it had no effect.",
      );
    } else if (scenario.failure.mode === "down") {
      failedInstancesBefore = failureTarget.model.instances;
      const cacheGone = takeCopyDown(failureTarget);
      if (cacheGone) {
        notes.push(`${label(failureTarget)} went down, so every read now goes straight to the store behind it.`);
      } else {
        const target = failureTarget;
        // a block with no spare copy of its own is not the same as a design with no spare: another block of the same kind may take over
        peers = all.filter((n) => n !== target && n.role !== "source" && n.node.blockId === target.node.blockId && !n.down);
        notes.push(
          !target.down
            ? `${label(target)} lost one of its instances and kept running at reduced capacity.`
            : peers.length
              ? `${label(target)} went down. ${peers.map(label).join(" and ")} take${peers.length === 1 ? "s" : ""} over its traffic.`
              : `${label(target)} went down and no other block can do its job.`,
        );
      }
    } else {
      failureTarget.model.latencyMs *= scenario.failure.factor ?? 5;
      notes.push(`${label(failureTarget)} became ${scenario.failure.factor ?? 5}x slower.`);
    }
    if (failureTarget && scenario.failure.target.capability && failureTarget.caps.length > 1) {
      const others = failureTarget.caps.filter((c) => c.id !== scenario.failure!.target.capability && !isBackground(c));
      if (others.length) notes.push(`It also runs ${others.map((c) => `"${c.label}"`).join(", ")}, so those suffer too (shared fate).`);
    }
    // more blocks going down at the same moment: each loses a copy, and peers that were killed too cannot take over
    for (const f of scenario.alsoDown ?? []) {
      const extra = pickFailureTarget(all, f);
      if (!extra || extra === failureTarget || failedNodes.includes(extra)) continue;
      const cacheGone = takeCopyDown(extra);
      failedNodes.push(extra);
      notes.push(
        cacheGone
          ? `${label(extra)} went down, so every read now goes straight to the store behind it.`
          : extra.down
            ? `${label(extra)} went down.`
            : `${label(extra)} lost one of its instances and kept running at reduced capacity.`,
      );
    }
    peers = peers.filter((n) => !n.down);
  }

  // ----- adjacency -----
  const syncOut = new Map<string, string[]>();
  const asyncOut = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  for (const e of design.edges) {
    if (!sim.has(e.source) || !sim.has(e.target)) continue;
    const map = e.kind === "async" ? asyncOut : syncOut;
    (map.get(e.source) ?? map.set(e.source, []).get(e.source)!).push(e.target);
    (parents.get(e.target) ?? parents.set(e.target, []).get(e.target)!).push(e.source);
  }
  const outs = (id: string) => [...(syncOut.get(id) ?? []), ...(asyncOut.get(id) ?? [])];

  // ----- topological order over reachable nodes (back edges ignored) -----
  const sources = all.filter((n) => n.role === "source");
  const order: string[] = [];
  const state = new Map<string, 1 | 2>();
  const dfs = (id: string) => {
    state.set(id, 1);
    for (const t of outs(id)) if (!state.has(t)) dfs(t);
    state.set(id, 2);
    order.push(id);
  };
  for (const s of sources) if (!state.has(s.node.id)) dfs(s.node.id);
  order.reverse();
  const pos = new Map(order.map((id, i) => [id, i]));

  // share context: plumbing blocks inherit how much of the traffic reaches them from the blocks upstream
  for (const id of order) {
    const s = sim.get(id)!;
    if (s.share !== undefined) s.ctx = s.share;
    else {
      const ps = (parents.get(id) ?? []).filter((p) => (pos.get(p) ?? Infinity) < (pos.get(id) ?? 0)).map((p) => sim.get(p)!.ctx);
      s.ctx = ps.length ? Math.max(...ps) : 1;
    }
  }

  let offered = 0;
  const srcLoad = new Map<string, number>();
  for (const s of sources) {
    const load = Number(s.node.cfg.users ?? 0) * Number(s.node.cfg.reqPerUser ?? 0) * scenario.trafficMultiplier;
    srcLoad.set(s.node.id, load);
    offered += load;
  }
  if (sources.length === 0) notes.push("Add a User block: nothing generates traffic yet.");
  const expected = problem.traffic.users * problem.traffic.reqPerUser * scenario.trafficMultiplier;
  const underLoaded = offered > 0 && offered < expected * 0.95;
  if (underLoaded) {
    notes.push(
      `Your User blocks send ${Math.round(offered).toLocaleString()} rps, but this scenario expects ${Math.round(expected).toLocaleString()} rps. Raise Users or Req / User.`,
    );
  }

  // ----- reads and writes -----
  // Every flow is split into reads and writes. They are told apart by what asks for them: a capability can say what share of its
  // requests write (`writes`), otherwise the problem's overall write share applies. Caches and CDNs only absorb reads.
  const W0 = problem.traffic.writeShare;
  const anyWrites = (problem.capabilities ?? []).some((c) => c.writes !== undefined);
  const capMix = (caps: Capability[]): number | undefined => {
    const req = caps.filter((c) => !isBackground(c));
    const total = req.reduce((a, c) => a + c.share, 0);
    if (!anyWrites || !req.length || total <= 0) return undefined;
    return req.reduce((a, c) => a + c.share * (c.writes ?? W0), 0) / total;
  };

  // ----- routing weights -----
  // A child that runs a capability used by only part of the traffic receives that fraction of its caller's flow.
  // plain data blocks (search index, database) receive the share of traffic whose capabilities declare they use that type
  const usesRatio = (parent: SimNode, kid: SimNode): number => {
    const decl = parent.caps.filter((c) => !isBackground(c) && (c.uses?.length ?? 0) > 0);
    if (!decl.length) return 1;
    const reach = new Set([kid.node.blockId, ...reachableNodes(design, kid.node.id).map((n) => n.blockId)]);
    const hit = decl.filter((c) => c.uses!.some((t) => reach.has(t)));
    if (!hit.length) return 1;
    return Math.min(1, hit.reduce((a, c) => a + c.share, 0) / Math.max(1e-9, parent.share ?? 1));
  };
  // queues and streams only carry the events their consumers care about (the largest share among everything downstream)
  const downstreamShare = (startId: string): number | undefined => {
    const seen = new Set<string>([startId]);
    const queue = [startId];
    let best: number | undefined;
    while (queue.length) {
      const id = queue.shift()!;
      for (const t of outs(id)) {
        if (seen.has(t)) continue;
        seen.add(t);
        const sn = sim.get(t)!;
        if (sn.share !== undefined) best = Math.max(best ?? 0, sn.share);
        queue.push(t);
      }
    }
    return best;
  };
  const ratio = (parent: SimNode, kid: SimNode) => {
    if (kid.share !== undefined) return Math.min(1, kid.share / Math.max(1e-9, parent.ctx));
    if (kid.role === "queue") {
      const d = downstreamShare(kid.node.id);
      if (d !== undefined) return Math.min(1, d / Math.max(1e-9, parent.ctx));
    }
    return usesRatio(parent, kid);
  };
  /** share of the traffic that reaches `kid` from `parent` that writes, when what asks for it says so; otherwise undefined (inherit) */
  const mixFor = (parent: SimNode, kid: SimNode): number | undefined => {
    if (kid.share !== undefined) return capMix(kid.caps);
    if (kid.role === "queue") return undefined;
    const decl = parent.caps.filter((c) => !isBackground(c) && (c.uses?.length ?? 0) > 0);
    if (!decl.length) return undefined;
    const reach = new Set([kid.node.blockId, ...reachableNodes(design, kid.node.id).map((n) => n.blockId)]);
    const hit = decl.filter((c) => c.uses!.some((t) => reach.has(t)));
    return hit.length ? capMix(hit) : undefined;
  };
  const fan = new Map<string, "split" | "all">();
  const routing = new Set<string>(); // balancers and gateways that send different request classes to different services
  const kidWeights = new Map<string, Map<string, number>>();
  for (const id of order) {
    const s = sim.get(id)!;
    const kids = (syncOut.get(id) ?? []).filter((k) => (pos.get(k) ?? -1) > (pos.get(id) ?? 0));
    // a balancer spreads copies of one thing; a gateway that fronts different services routes each request class
    const sigs = new Set(
      kids.map((k) =>
        sim
          .get(k)!
          .caps.map((c) => c.id)
          .sort()
          .join("+"),
      ),
    );
    const mode: "split" | "all" = s.model.fanout === "all" || sigs.size > 1 ? "all" : "split";
    fan.set(id, mode);
    if (s.model.fanout === "split" && sigs.size > 1) routing.add(id);
    const w = new Map<string, number>();
    if (mode === "all") kids.forEach((k) => w.set(k, ratio(s, sim.get(k)!)));
    else {
      const healthy = kids.filter((k) => sim.get(k)!.model.capacity > 0);
      healthy.forEach((k) => w.set(k, ratio(s, sim.get(k)!) / healthy.length));
    }
    kidWeights.set(id, w);
  }

  // ----- regions: which copy of a service a caller uses -----
  // Callers prefer a healthy block in the same region as the users they are serving; failing that, any healthy one.
  const isUp = (k: SimNode) => k.model.capacity > 0;
  const sigOf = (k: SimNode) =>
    k.node.blockId +
    "|" +
    k.caps
      .map((c) => c.id)
      .sort()
      .join("+");
  const prefer = (kidIds: string[], o: string): string[] => {
    if (!regionsOn || o === "_") return kidIds;
    const groups = new Map<string, string[]>();
    for (const k of kidIds) {
      const g = sigOf(sim.get(k)!);
      (groups.get(g) ?? groups.set(g, []).get(g)!).push(k);
    }
    const out: string[] = [];
    for (const g of groups.values()) {
      const alive = g.filter((k) => isUp(sim.get(k)!));
      const near = alive.filter((k) => sim.get(k)!.region === o || sim.get(k)!.region === undefined);
      out.push(...(near.length ? near : alive.length ? alive : g));
    }
    return out;
  };
  const forward = (id: string, ids: string[] | undefined) => (ids ?? []).filter((k) => (pos.get(k) ?? -1) > (pos.get(id) ?? 0));
  const weightMemo = new Map<string, Map<string, number>>();
  const weightsFor = (id: string, o: string): Map<string, number> => {
    if (!regionsOn) return kidWeights.get(id)!;
    const key = id + "|" + o;
    const hit = weightMemo.get(key);
    if (hit) return hit;
    const s = sim.get(id)!;
    const kids = prefer(forward(id, syncOut.get(id)), o);
    const w = new Map<string, number>();
    if (fan.get(id) === "all") kids.forEach((k) => w.set(k, ratio(s, sim.get(k)!)));
    else {
      const healthy = kids.filter((k) => isUp(sim.get(k)!));
      healthy.forEach((k) => w.set(k, ratio(s, sim.get(k)!) / healthy.length));
    }
    weightMemo.set(key, w);
    return w;
  };

  // ----- flow propagation -----
  const unitsCap = (s: SimNode) => (s.model.dropAbove !== undefined ? Math.min(s.model.capacity, s.model.dropAbove) : s.model.capacity);
  const edgeWrites = new Map<string, number>(); // writes per second carried by each call, to judge which calls are write-heavy for the users waiting on them
  const send = (kid: SimNode, total: number, writeMix: number, o: string, from?: string) => {
    if (from) edgeWrites.set(from + ">" + kid.node.id, (edgeWrites.get(from + ">" + kid.node.id) ?? 0) + total * writeMix);
    kid.incoming += total;
    kid.inW += total * writeMix;
    kid.byOrigin[o] = (kid.byOrigin[o] ?? 0) + total;
  };
  for (const id of order) {
    const s = sim.get(id)!;
    if (s.role === "source") {
      s.incoming = srcLoad.get(id) ?? 0;
      s.inW = s.incoming * (capMix(scaledCaps) ?? W0);
      for (const o of origins) s.byOrigin[o] = s.incoming * (regionsOn ? (mix[o] ?? 0) : 1);
    }
    // a store takes reads and writes at different rates, so what it can do depends on what actually arrives
    const m = s.model;
    if (m.readCapacity !== undefined && m.writeCapacity !== undefined && s.incoming > 0) {
      const rc = m.readCapacity * s.capLeft;
      const wc = m.writeCapacity * s.capLeft;
      const r = s.incoming - s.inW;
      const need = (r > 0 ? (rc > 0 ? r / rc : Infinity) : 0) + (s.inW > 0 ? (wc > 0 ? s.inW / wc : Infinity) : 0);
      m.capacity = need === Infinity ? 0 : need > 0 ? s.incoming / need : m.capacity;
      if (m.capacity <= 0) s.down = true;
    }
    const avail = Math.max(0, unitsCap(s) - s.bgIn - s.bgWork);
    s.handled = Math.min(s.incoming, avail / s.work);
    const h = s.incoming > 0 ? s.handled / s.incoming : 0;
    // a block that only runs background jobs reads what reaches it but does not pass it on; its jobs load things via bgOps
    const bgOnly = s.caps.length > 0 && s.caps.every(isBackground);
    const outR = (s.incoming - s.inW) * h * s.model.passThrough;
    const outW = s.inW * h * (s.model.writePassThrough ?? s.model.passThrough);
    const out = bgOnly ? 0 : outR + outW;
    const mixOut = out > 0 ? outW / out : W0;
    for (const o of origins) {
      const f = s.incoming > 0 ? (s.byOrigin[o] ?? 0) / s.incoming : 0;
      if (f <= 0) continue;
      for (const [k, w] of weightsFor(id, o)) {
        const kid = sim.get(k)!;
        send(kid, out * f * w, mixFor(s, kid) ?? mixOut, o, id);
      }
      if (!bgOnly) {
        for (const k of prefer(forward(id, asyncOut.get(id)), o)) {
          const kid = sim.get(k)!;
          send(kid, s.handled * f * ratio(s, kid), mixFor(s, kid) ?? (s.incoming > 0 ? s.inW / s.incoming : W0), o);
        }
      }
    }
    // background operations (an expiry sweep, say) load whatever this block writes to
    const bg = s.bgOps + s.bgIn;
    if (bg > 0) for (const [k, w] of kidWeights.get(id)!) sim.get(k)!.bgIn += bg * s.model.passThrough * w;
  }

  // ----- latency + served ratio (recursive over sync edges) -----
  const demand = (s: SimNode) => s.incoming * s.work + s.bgIn + s.bgWork;
  const util = (s: SimNode) => {
    const cap = unitsCap(s);
    if (cap === Infinity) return 0;
    if (cap <= 0) return demand(s) > 0 ? 2 : 0;
    return demand(s) / cap;
  };
  const memoS = new Map<string, number>();
  const kidsOf = (id: string, o: string) => [...weightsFor(id, o)].filter(([k]) => sim.has(k));
  const degraded = new Set<string>();
  const regionNotes = new Set<string>();

  /** can the caller carry on without this dependency, using a fallback? */
  const optional = (kid: SimNode) => (hasCaps ? isOptionalHost(kid.caps) : true);

  /** time for one call from `parent` to `kid` for users in region `o`: the hop itself, plus the distance when it crosses regions */
  const edgeMs = (parent: SimNode, kid: SimNode, o: string, thr: number): number => {
    const base = parent.role === "source" ? 0 : HOP_MS;
    if (!regionsOn || kid.region === undefined) return base;
    const from: RegionId | undefined =
      parent.role === "source" ? (o as RegionId) : (parent.region ?? (parent.node.blockId === "cdn" ? (o as RegionId) : undefined));
    if (!from) return base;
    const toHome = rtt(from, kid.region);
    let near = toHome;
    let cross = toHome;
    if (kid.node.blockId === "database") {
      // reads use the nearest copy; writes must reach the primary
      const copies = copyRegions(kid.node.cfg, kid.region);
      near = Math.min(toHome, ...copies.map((c) => rtt(from, c)));
      // the writes this call carries, as a share of the requests the caller handles (a cache thins the reads, and background jobs are not waited on)
      const writes = parent.incoming > 0 ? (edgeWrites.get(parent.node.id + ">" + kid.node.id) ?? 0) / parent.incoming : 0;
      cross = writes >= 0.25 ? Math.max(near, toHome) : near;
      if (writes >= 0.01 && writes < 0.25 && toHome > near + 1)
        regionNotes.add(
          `Writes (about ${Math.round(writes * 100)}% of requests) go to ${regionLabel(kid.region)}, ${Math.round(toHome - near)} ms further for users in ${regionLabel(from)}, which is not counted against the latency target.`,
        );
    }
    return base + cross;
  };

  // p99-style latency includes slow branches taken by even 1% of requests; the typical latency only those taken by half
  const memoL = [new Map<string, number>(), new Map<string, number>()];
  const latencyAt = (id: string, typical: boolean, o: string): number => {
    const memo = memoL[typical ? 1 : 0];
    const mkey = id + "|" + o;
    if (memo.has(mkey)) return memo.get(mkey)!;
    memo.set(mkey, 0);
    const s = sim.get(id)!;
    const thr = typical ? 0.5 : 0.01;
    const own = s.model.latencyMs * Math.max(0.5, s.work) * inflation(util(s));
    let ks = kidsOf(id, o).filter(([, w]) => w > thr);
    if (routing.has(id)) {
      const essential = ks.filter(([k]) => {
        const kid = sim.get(k)!;
        return kid.caps.length === 0 || kid.caps.some((c) => !isBackground(c) && c.critical);
      });
      if (essential.length) ks = essential;
    }
    let child = 0;
    if (ks.length && s.model.passThrough > thr) {
      const cs = ks.map(([k, w]) => {
        const kid = sim.get(k)!;
        let c = latencyAt(k, typical, o) + edgeMs(s, kid, o, thr);
        if (s.model.circuitBreaker && s.model.timeoutMs !== undefined && optional(kid)) {
          // a timeout shorter than the dependency's normal response time means it is skipped almost every time
          if (typical && c > s.model.timeoutMs) kid.caps.forEach((cap) => degraded.add(cap.label));
          c = Math.min(c, s.model.timeoutMs);
        }
        return { c, w };
      });
      child =
        fan.get(id) === "split" ? cs.reduce((a, x) => a + x.c * x.w, 0) / cs.reduce((a, x) => a + x.w, 0) : Math.max(...cs.map((x) => x.c));
    }
    const v = own + child;
    memo.set(mkey, v);
    return v;
  };
  const latency = (id: string, o: string): number => latencyAt(id, false, o);

  const served = (id: string, o: string): number => {
    const mkey = id + "|" + o;
    if (memoS.has(mkey)) return memoS.get(mkey)!;
    memoS.set(mkey, 1);
    const s = sim.get(id)!;
    const h = s.incoming > 0 ? s.handled / s.incoming : 1;
    const ks = kidsOf(id, o);
    // traffic that never reaches any block is not served
    if (s.role === "source" && ks.length === 0) {
      memoS.set(mkey, 0);
      return 0;
    }
    // a balancer whose every target is down has nowhere to send the traffic: that is a failure, not a pass
    const hadKids = (syncOut.get(id) ?? []).some((k) => (pos.get(k) ?? -1) > (pos.get(id) ?? 0));
    let childS = ks.length === 0 && hadKids ? 0 : 1;
    if (ks.length) {
      const cs = ks.map(([k, w]) => {
        const kid = sim.get(k)!;
        let c = served(k, o);
        // a caller with a circuit breaker falls back when an optional dependency fails or is overloaded
        const mask = hasCaps ? isOptionalHost(kid.caps) : kid.down;
        if (s.model.circuitBreaker && mask && c < 0.999) {
          if (hasCaps) kid.caps.forEach((cap) => degraded.add(cap.label));
          c = 1;
        }
        return { c, w };
      });
      if (fan.get(id) === "split") {
        const total = cs.reduce((a, x) => a + x.w, 0);
        childS = total > 0 ? cs.reduce((a, x) => a + x.c * x.w, 0) / total : 0;
      } else {
        // every request class needs its branch; classes are independent
        childS = cs.reduce((a, x) => a * (1 - x.w * (1 - x.c)), 1);
      }
    }
    const pt = s.model.passThrough;
    const v = h * (1 - pt + pt * childS);
    memoS.set(mkey, v);
    return v;
  };

  let servedRatio = 0;
  let lat = 0;
  const latByOrigin: Record<string, number> = {};
  if (offered > 0) {
    for (const s of sources) {
      const sw = (srcLoad.get(s.node.id) ?? 0) / offered;
      for (const o of origins) {
        const w = sw * (regionsOn ? (mix[o] ?? 0) : 1);
        if (w <= 0) continue;
        servedRatio += w * served(s.node.id, o);
        latByOrigin[o] = Math.max(latByOrigin[o] ?? 0, latency(s.node.id, o));
        latencyAt(s.node.id, true, o); // records optional features that always time out
      }
    }
  }
  // the slowest region that has a real share of the users sets the latency
  lat = regionsOn ? Math.max(0, ...origins.filter((o) => (mix[o] ?? 0) >= 0.05).map((o) => latByOrigin[o] ?? 0)) : (latByOrigin["_"] ?? 0);
  if (regionsOn) for (const n of [...regionNotes].slice(0, 2)) notes.push(n);
  // a fallback is fine when the scenario broke that feature on purpose; if it is only overloaded, the feature is not really working
  const failed = failureTarget ? [failureTarget, ...failedNodes] : failedNodes;
  const expectedBroken = new Set(failed.flatMap((f) => f.caps.map((c) => c.label)));
  // anything that depends on a failed block is expected to degrade too
  for (const sn of all)
    if (reachableNodes(design, sn.node.id).some((n) => failed.some((f) => f.node.id === n.id)))
      sn.caps.forEach((c) => expectedBroken.add(c.label));
  const overloadedFeatures = [...degraded].filter((l) => !expectedBroken.has(l));
  if (degraded.size) {
    notes.push(`Served without ${[...degraded].map((x) => `"${x}"`).join(", ")} (fallback), so the page still loads.`);
    if (overloadedFeatures.length)
      notes.push(
        `${overloadedFeatures.map((x) => `"${x}"`).join(", ")} is being skipped even though nothing broke: it is overloaded, or its timeout is shorter than its normal response time.`,
      );
  }

  // ----- capabilities whose provider is not connected -----
  const broken: string[] = [];
  for (const sn of all) {
    for (const { cap, need } of missingNeeds(design, sn.node.id, sn.caps)) {
      const what = needLabel(need);
      broken.push(cap.label);
      notes.push(`"${cap.label}" needs a ${what}, but ${label(sn)} is not connected to one.`);
      advice.push({
        change: `Connect ${label(sn)} (directly, or through a cache) to a ${what}.`,
        why: `"${cap.label}" cannot work without it, so every scenario fails until it is connected.`,
      });
      if (!isBackground(cap) && cap.critical) servedRatio = 0;
    }
  }

  // ----- correctness guarantees (locks, idempotency) -----
  for (const sn of all) {
    for (const { cap, guarantee, fix } of unmetGuarantees(design, sn.node.id, sn.caps)) {
      broken.push(cap.label);
      advice.push({
        change: fix,
        why: `Without ${GUARANTEE_LABEL[guarantee] ?? guarantee}, "${cap.label}" can give wrong answers even when the system is fast, so it fails every scenario.`,
      });
      notes.push(
        `"${cap.label}" needs ${GUARANTEE_LABEL[guarantee] ?? guarantee}, which this design does not provide, so it can produce wrong results (double booking, duplicates).`,
      );
    }
  }

  // ----- capabilities that nothing runs -----
  for (const c of problem.capabilities ?? []) {
    if ((hostIds.get(c.id)?.length ?? 0) > 0) continue;
    if (!isBackground(c) && c.critical) {
      // requests that need the missing capability cannot be served; the rest are unaffected
      servedRatio *= 1 - Math.min(1, c.share);
      notes.push(
        `Nothing runs "${c.label}", which ${Math.round(c.share * 100)}% of requests need. Select a Server or Service and tick it under Hosts.`,
      );
    }
  }

  // ----- queues / consumers -----
  const backlog: Record<string, number> = {};
  let queueDropped = 0;
  let queueIn = 0;
  for (const s of all) {
    if (s.incoming <= 0) continue;
    if (s.role === "queue") {
      queueIn += s.incoming;
      queueDropped += s.incoming - s.handled;
    }
    if (s.role === "consumer" && s.incoming * s.work > Math.max(0, s.model.capacity - s.bgIn - s.bgWork)) {
      backlog[s.node.id] = s.incoming * s.work - Math.max(0, s.model.capacity - s.bgIn - s.bgWork);
    }
  }
  const queueBacklogged = Object.keys(backlog).length > 0;
  // a block that runs a background job but has no room for it falls behind: work piles up
  for (const s of all) {
    if (s.bgWork <= 0 || backlog[s.node.id] !== undefined) continue;
    const cap = unitsCap(s);
    if (cap !== Infinity && demand(s) > cap) {
      backlog[s.node.id] = demand(s) - cap;
      const jobs = s.caps
        .filter(isBackground)
        .map((c) => `"${c.label}"`)
        .join(", ");
      notes.push(`${label(s)} cannot keep up with ${jobs}, so the work piles up.`);
    }
  }
  const queueDropFrac = queueIn > 0 ? queueDropped / queueIn : 0;
  if (queueDropFrac > 0.02) notes.push(`${Math.round(queueDropFrac * 100)}% of events could not be queued and would be lost.`);
  if (queueBacklogged) notes.push("A consumer cannot keep up, so the queue backlog keeps growing.");

  const saturated = all
    .filter((s) => s.role !== "source" && (s.incoming > 0 || s.bgIn + s.bgWork > 0) && !s.down && util(s) >= 1)
    .map((s) => s.node.id);
  if (saturated.length) notes.push(`Saturated: ${saturated.map((id) => label(sim.get(id)!)).join(", ")}.`);

  // a worker cannot finish its jobs if the provider or store behind it is saturated
  for (const sn of all) {
    if (sn.role !== "consumer" || sn.incoming <= 0 || backlog[sn.node.id] !== undefined) continue;
    const stuck = reachableNodes(design, sn.node.id).filter((n) => saturated.includes(n.id));
    if (stuck.length) {
      backlog[sn.node.id] = 1;
      notes.push(`${label(sn)} cannot finish its jobs: ${stuck.map((n) => label(sim.get(n.id)!)).join(", ")} is saturated.`);
    }
  }

  // ----- scoring -----
  const target = problem.latencyTargetMs;
  const latScore = lat <= target ? 1 : Math.max(0, target / lat);
  if (failureTarget?.down && peers.length && servedRatio < 0.97) {
    notes.push(
      `${peers.map(label).join(" and ")} could not carry the extra load, so only ${Math.round(servedRatio * 100)}% of requests were served.`,
    );
  }
  const servedScore = servedRatio >= 0.99 ? 1 : Math.max(0, servedRatio) ** 3;
  const eventScore = 1 - Math.min(1, queueDropFrac * 2 + (Object.keys(backlog).length ? 0.3 : 0));
  let score = offered > 0 ? Math.round(100 * (0.55 * servedScore + 0.3 * latScore + 0.15 * eventScore)) : 0;
  if (underLoaded) score = Math.min(score, 40);
  if (overloadedFeatures.length) score = Math.min(score, 80);
  if (broken.length) score = Math.min(score, 70);
  const pass =
    offered > 0 &&
    !underLoaded &&
    overloadedFeatures.length === 0 &&
    broken.length === 0 &&
    servedRatio >= 0.97 &&
    lat <= target &&
    queueDropFrac <= 0.02 &&
    Object.keys(backlog).length === 0;

  // ----- why it failed, and what to try -----
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const reasons: string[] = [];
  // a worker that is stuck because something behind it is saturated is fixed by fixing that block, not by adding workers
  const blockedBy = (id: string) =>
    reachableNodes(design, id)
      .filter((n) => saturated.includes(n.id))
      .map((n) => label(sim.get(n.id)!));
  const stuckLabels = Object.keys(backlog).map((id) => {
    const why = blockedBy(id);
    return why.length ? `${label(sim.get(id)!)} (held up by ${why.join(", ")})` : label(sim.get(id)!);
  });
  if (offered > 0) {
    if (underLoaded)
      reasons.push(
        `The User blocks send ${Math.round(offered).toLocaleString()} requests/s, but this scenario expects ${Math.round(expected).toLocaleString()}.`,
      );
    if (servedRatio < 0.97)
      reasons.push(
        `Only ${pct(servedRatio)} of requests were served; the rest were dropped, timed out or had nothing able to handle them.`,
      );
    if (lat > target) {
      reasons.push(`The slowest typical path takes ${Math.round(lat)} ms, over the ${target} ms target.`);
      if (regionsOn) {
        const slow = origins
          .filter((o) => (mix[o] ?? 0) >= 0.05 && (latByOrigin[o] ?? 0) > target)
          .map((o) => `${regionLabel(o as RegionId)} (${Math.round(latByOrigin[o])} ms)`);
        if (slow.length)
          reasons.push(
            `Users in ${slow.join(" and ")} are too far from where the work happens: every call that crosses a region adds its round-trip time.`,
          );
      }
    }
    if (queueDropFrac > 0.02)
      reasons.push(`${pct(queueDropFrac)} of the events sent to the queue could not be accepted and would be lost.`);
    if (stuckLabels.length)
      reasons.push(
        servedRatio >= 0.97
          ? `Every request was accepted (${pct(servedRatio)} served), but background work is piling up: ${stuckLabels.join(", ")} cannot finish what reaches it, so the backlog grows without bound. Callers see no errors, yet this is still a failure.`
          : `Background work is also piling up: ${stuckLabels.join(", ")} cannot finish what reaches it.`,
      );
    if (broken.length)
      reasons.push(
        `Something the design relies on does not work: ${[...new Set(broken)].map((x) => `"${x}"`).join(", ")}. The notes above say what is missing.`,
      );
    if (overloadedFeatures.length)
      reasons.push(
        `${overloadedFeatures.map((x) => `"${x}"`).join(", ")} is being skipped although nothing broke, so that feature is not really working.`,
      );
  }
  if (!pass) {
    for (const id of saturated) {
      const sn = sim.get(id)!;
      const u = util(sn);
      const more = Math.round((Math.min(5, u / 0.75) - 1) * 100);
      const rc = sn.model.readCapacity;
      const wc = sn.model.writeCapacity;
      if (rc !== undefined && wc !== undefined && sn.incoming > 0) {
        const reads = sn.incoming - sn.inW;
        const ru = reads / Math.max(1, rc * sn.capLeft);
        const wu = sn.inW / Math.max(1, wc * sn.capLeft);
        const n0 = (x: number) => Math.round(x).toLocaleString();
        if (wu > ru) {
          advice.push({
            change: `${label(sn)} is filled by writes (${n0(sn.inW)}/s against a write limit of about ${n0(wc * sn.capLeft)}/s). Add shards, or put a queue and workers in front so writes are applied at a steady pace.`,
            why: "Only the primary copy of each shard accepts writes, so read replicas and caches do not help here. A cache only absorbs reads: every write still goes through to the store.",
          });
        } else {
          advice.push({
            change: `${label(sn)} is filled by reads (${n0(reads)}/s against a read limit of about ${n0(rc * sn.capLeft)}/s). Add read replicas, or put a cache in front of it.`,
            why: "Any copy can answer a read, so replicas add read capacity, and a cache answers repeated reads without reaching the store at all.",
          });
        }
        continue;
      }
      advice.push({
        change: `Give ${label(sn)} about ${more}% more capacity: more replicas, bigger instances, or autoscaling.`,
        why: `It runs at ${Math.round(u * 100)}% of capacity here. Above about 70% requests start to queue and latency climbs, and above 100% work is dropped or left waiting.`,
      });
    }
    for (const id of Object.keys(backlog)) {
      if (saturated.includes(id) || blockedBy(id).length) continue;
      advice.push({
        change: `Add consumers for ${label(sim.get(id)!)}, or let it autoscale.`,
        why: "Work arrives faster than it is finished, so the queue ahead of it grows for as long as the load lasts.",
      });
    }
    if (queueDropFrac > 0.02)
      advice.push({
        change: "Add partitions to the Queue or Stream, or raise its throughput.",
        why: "Events are arriving faster than it can take them, so the extra ones are lost.",
      });
    if (lat > target) {
      const slow = all
        .filter((s) => s.role !== "source" && s.incoming > 0)
        .sort((a, b) => b.model.latencyMs * inflation(util(b)) - a.model.latencyMs * inflation(util(a)))[0];
      if (slow)
        advice.push({
          change: `The slowest block is ${label(slow)} (${Math.round(slow.model.latencyMs * Math.max(0.5, slow.work) * inflation(util(slow)))} ms). Put a cache in front of it, keep it under 70% utilisation, or move that work behind a queue.`,
          why: "Latency adds up along the call chain, and every block gets sharply slower as it fills up.",
        });
    }
    if (regionsOn && lat > target) {
      const far = origins.filter((o) => (mix[o] ?? 0) >= 0.05 && (latByOrigin[o] ?? 0) > target);
      if (far.length)
        advice.push({
          change: `Run a copy of the front of the system in ${far.map((o) => regionLabel(o as RegionId)).join(" and ")}: a load balancer, servers and a cache there, connected from the User block. Give the database a copy in each of those regions so reads stay local.`,
          why: "A call across an ocean costs 85 to 160 ms on its own, which a 100 ms budget cannot absorb. Serving users from the region they are in removes it; only writes have to travel to the primary.",
        });
    }
    if (regionDown && servedRatio < 0.97)
      advice.push({
        change: `Run the system in a second region as well, connect the User block to both, and give the database a copy there so it can take over when ${regionLabel(regionDown)} is gone.`,
        why: "Everything in one region fails together. A second region only helps if it has its own servers and a copy of the data, and if users are sent to whichever region is still up.",
      });
    if (scenario.failure?.mode === "slow" && failureTarget)
      advice.push({
        change: `Call ${label(failureTarget)} behind a circuit breaker with a timeout shorter than your latency budget, and run it as its own service if it is optional.`,
        why: "A caller without a breaker waits for its slowest dependency. With one it gives up early and keeps its own response time, at the price of one more service to run.",
      });
    if (scenario.failure?.mode === "down" && failureTarget && failedInstancesBefore <= 1)
      advice.push({
        change: `Run at least two instances of ${label(failureTarget)}.`,
        why: "With a single instance, losing it means losing the whole capability. With two, the survivor keeps serving at reduced capacity.",
      });
  }
  const seen = new Set<string>();
  const uniqueAdvice = advice.filter((a) => (seen.has(a.change) ? false : (seen.add(a.change), true))).slice(0, 5);
  const busy = all
    .filter((s) => s.role !== "source" && s.incoming > 0 && Number.isFinite(unitsCap(s)))
    .sort((a, b) => util(b) - util(a))[0];
  const peak = busy ? { label: label(busy), utilization: util(busy) } : undefined;

  const nodes: Record<string, NodeResult> = {};
  for (const s of all) {
    nodes[s.node.id] = {
      id: s.node.id,
      incoming: s.incoming,
      handled: s.handled,
      dropped: Math.max(0, s.incoming - s.handled),
      utilization: util(s),
      latencyMs: s.model.latencyMs * Math.max(0.5, s.work) * inflation(util(s)),
      work: s.work,
      incomingWrites: s.inW,
      region: s.region,
      readCapacity: s.model.readCapacity !== undefined ? s.model.readCapacity * s.capLeft : undefined,
      writeCapacity: s.model.writeCapacity !== undefined ? s.model.writeCapacity * s.capLeft : undefined,
      down: s.down || undefined,
    };
  }

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    offered,
    served: servedRatio,
    latencyMs: lat,
    nodes,
    latencyByRegion: regionsOn && origins.length > 1 ? Object.fromEntries(origins.map((o) => [o, latByOrigin[o] ?? 0])) : undefined,
    saturated,
    queueBacklog: backlog,
    score,
    pass,
    failureTarget: failureTarget?.node.id,
    notes,
    reasons,
    advice: uniqueAdvice,
    peak,
  };
}

function label(s: SimNode): string {
  const base = BLOCK_MAP[s.node.blockId]?.label ?? s.node.blockId;
  const what = s.node.responsibilities[0] ?? (s.caps.length === 1 ? s.caps[0].label : undefined);
  return what ? `${base} (${what})` : base;
}
