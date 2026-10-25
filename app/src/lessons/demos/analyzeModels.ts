import { BLOCK_MAP, defaultCfg } from "../../blocks";
import { analyze } from "../../sim/analyze";
import type { Design, DesignEdge, DesignNode, Problem, Scenario } from "../../types";

/*
  Small, labelled example problems for the Module 0 demos. Each one builds a tiny Problem and a Design and runs the real
  `analyze`, so the figures are the ones the canvas would show for the same blocks and settings. Every number a learner sees
  (traffic, capacities) is invented for the lesson; the rules that turn them into "served", response time and cost are the app's.
*/

export const node = (id: string, blockId: string, over: Record<string, unknown> = {}): DesignNode => ({
  id,
  blockId,
  cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over },
  responsibilities: [],
});
export const edge = (source: string, target: string): DesignEdge => ({ id: `${source}-${target}`, source, target, kind: "sync" });

export const scenario = (id: string, over: Partial<Scenario> = {}): Scenario => ({
  id,
  title: id,
  description: id,
  trafficMultiplier: 1,
  interviewQuestion: "",
  ...over,
});

export const problem = (id: string, requestsPerSec: number, scenarios: Scenario[]): Problem => ({
  id,
  title: id,
  difficulty: "easy",
  brief: "",
  constraints: [],
  traffic: { users: requestsPerSec, reqPerUser: 1, writeShare: 0 },
  latencyTargetMs: 300,
  scenarios,
  requirements: [],
  rubric: [],
});

export interface Outcome {
  /** requests per second sent in */
  offered: number;
  /** share of requests answered, 0 to 1 */
  served: number;
  /** typical response time in ms */
  responseMs: number;
  /** estimated monthly cost of every block in the design, in dollars */
  monthlyCost: number;
  /** requests per second that reach the block named in the demo (the server, or the origin) */
  reaching: number;
  /** how busy that block is, as a share of its capacity (above 1 it cannot keep up) */
  busy: number;
}

function run(design: Design, p: Problem, scenarioId: string, watch: string, offered: number): Outcome {
  const result = analyze(design, p);
  const s = result.scenarios.find((x) => x.scenarioId === scenarioId)!;
  const n = s.nodes[watch];
  return {
    offered,
    served: s.served,
    responseMs: s.latencyMs,
    monthlyCost: result.cost,
    reaching: n?.incoming ?? 0,
    busy: n?.utilization ?? 0,
  };
}

// ----- demo 1: one server's limit -----
export const ONE_SERVER = { quietRps: 40, busyRps: 120, capacity: 100 };

/** A bakery's order page: visitors, one server. */
export function oneServer(requestsPerSec: number, capacity: number): Outcome {
  const design: Design = {
    nodes: [node("u", "user", { users: requestsPerSec, reqPerUser: 1 }), node("s", "server", { capacity, replicas: 1, autoscale: false })],
    edges: [edge("u", "s")],
  };
  return run(design, problem("bakery-one-server", requestsPerSec, [scenario("now")]), "now", "s", requestsPerSec);
}

// ----- demo 2: copies behind a balancer -----
export const COPIES = { rps: 120, capacityEach: 100 };

export interface CopiesOutcome {
  normal: Outcome;
  /** with one copy taken down; `survivors` copies are left */
  oneDown: Outcome;
  survivors: number;
}

/**
 * The bakery with `copies` identical servers behind a load balancer, with and without one copy failing.
 * With a single copy nothing is left standing when it fails, so that case is stated rather than simulated: the app's simulator
 * is not asked to describe a design with no working server.
 */
export function copies(count: number, rps = COPIES.rps, capacityEach = COPIES.capacityEach): CopiesOutcome {
  const design: Design = {
    nodes: [
      node("u", "user", { users: rps, reqPerUser: 1 }),
      node("lb", "load_balancer", { instances: 2, capacity: 50000 }),
      node("s", "server", { capacity: capacityEach, replicas: count, autoscale: false }),
    ],
    edges: [edge("u", "lb"), edge("lb", "s")],
  };
  const p = problem("bakery-copies", rps, [
    scenario("normal"),
    scenario("down", { failure: { target: { types: ["server"] }, mode: "down" } }),
  ]);
  const normal = run(design, p, "normal", "s", rps);
  if (count <= 1) return { normal, oneDown: { ...normal, served: 0, reaching: 0, busy: 0 }, survivors: 0 };
  return { normal, oneDown: run(design, p, "down", "s", rps), survivors: count - 1 };
}

// ----- demo 3: edge and origin -----
export const EDGE = { rps: 1000, originCapacity: 400, cdnCapacity: 5000 };

export interface EdgeOutcome {
  withoutCdn: Outcome;
  withCdn: Outcome;
}

/** A school timetable PDF fetched by many parents at once, straight from blob storage and then through a CDN. */
export function edgeOrigin(hitRatio: number): EdgeOutcome {
  const { rps, originCapacity, cdnCapacity } = EDGE;
  const p = problem("timetable-edge", rps, [scenario("start")]);
  const direct: Design = {
    nodes: [node("u", "user", { users: rps, reqPerUser: 1 }), node("b", "blob_storage", { capacity: originCapacity })],
    edges: [edge("u", "b")],
  };
  const viaCdn: Design = {
    nodes: [
      node("u", "user", { users: rps, reqPerUser: 1 }),
      node("cdn", "cdn", { capacity: cdnCapacity, staticShare: 1, hitRatio }),
      node("b", "blob_storage", { capacity: originCapacity }),
    ],
    edges: [edge("u", "cdn"), edge("cdn", "b")],
  };
  return { withoutCdn: run(direct, p, "start", "b", rps), withCdn: run(viaCdn, p, "start", "b", rps) };
}

// ----- Module 1 demo: copies and slices of a database -----
export const FORUM = { rps: 1500, nodeCapacity: 500, writeShare: 0.03 };

export interface ForumOutcome {
  /** reads and writes a second the database is asked for */
  reads: number;
  writes: number;
  /** the most reads (or writes) a second the database could answer if that were all it did */
  readLimit: number;
  writeLimit: number;
  served: number;
  monthlyCost: number;
}

/** A hobbyist forum: one database with `copies` read copies and `slices` shards. Servers are sized so they are never the limit. */
export function forum(copies: number, slices: number, writeShare: number = FORUM.writeShare, rps: number = FORUM.rps): ForumOutcome {
  const design: Design = {
    nodes: [
      node("u", "user", { users: rps, reqPerUser: 1 }),
      node("s", "server", { capacity: 20000, replicas: 1, autoscale: false }),
      node("db", "database", { capacity: FORUM.nodeCapacity, readReplicas: copies, shards: slices }),
    ],
    edges: [edge("u", "s"), edge("s", "db")],
  };
  const p = problem("forum", rps, [scenario("now")]);
  p.traffic.writeShare = writeShare;
  const result = analyze(design, p);
  const s = result.scenarios[0];
  const db = s.nodes["db"];
  return {
    reads: rps * (1 - writeShare),
    writes: rps * writeShare,
    readLimit: db.readCapacity ?? 0,
    writeLimit: db.writeCapacity ?? 0,
    served: s.served,
    monthlyCost: result.cost,
  };
}

// ----- Module 1 demo: regions and distance -----
export const NOTICES = { rps: 300, mix: { us: 0.4, eu: 0.3, ap: 0.3 } };

export interface RegionsOutcome {
  /** the response time a visitor in each region sees, in ms */
  byRegion: { us: number; eu: number; ap: number };
  monthlyCost: number;
}

/**
 * A school-notices app. The data's home is US East. `servers` puts a server in every region; `copies` also keeps a read copy of
 * the data in Europe and Asia Pacific. A server in each region does not help much if the data it needs is still far away.
 */
export function notices(servers: boolean, copies: boolean): RegionsOutcome {
  const regionNames = ["US East", "Europe", "Asia Pacific"];
  const design: Design = {
    nodes: [
      node("u", "user", { users: NOTICES.rps, reqPerUser: 1 }),
      ...(servers
        ? regionNames.map((r, i) => node(`s${i}`, "server", { capacity: 2000, replicas: 1, autoscale: false, region: r }))
        : [node("s0", "server", { capacity: 2000, replicas: 1, autoscale: false, region: "US East" })]),
      node("db", "database", {
        capacity: 2000,
        region: "US East",
        ...(copies ? { replicaRegions: ["Europe", "Asia Pacific"] } : {}),
      }),
    ],
    edges: [],
  };
  const serverIds = servers ? ["s0", "s1", "s2"] : ["s0"];
  design.edges = [...serverIds.flatMap((id) => [edge("u", id), edge(id, "db")])];
  const p = problem("notices", NOTICES.rps, [scenario("now", { regionMix: NOTICES.mix })]);
  p.regions = { home: "us" };
  const result = analyze(design, p);
  const by = result.scenarios[0].latencyByRegion ?? { us: 0, eu: 0, ap: 0 };
  return { byRegion: { us: by.us ?? 0, eu: by.eu ?? 0, ap: by.ap ?? 0 }, monthlyCost: result.cost };
}
