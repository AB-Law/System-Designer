/*
  The numbers behind the landing page's two live systems, kept apart from the drawing so they can be tested.
  Hero: three servers that each carry SERVER_CAP requests a second, a scripted incident, then the visitor takes over.
  Scene: one design, loaded from 100 to 1,000,000 requests a second as the page scrolls.
*/

export const SERVER_CAP = 3000;
export const SERVERS = ["a", "b", "c"] as const;

/** Share of requests the servers can answer, 0 to 100. */
export function servedPercent(up: number, rps: number): number {
  if (rps <= 0) return 100;
  return Math.min(100, Math.round(((up * SERVER_CAP) / rps) * 100));
}

export interface IncidentStep {
  at: number;
  rps?: number;
  down?: readonly string[];
  log: string;
}

/** The first eight seconds: a quiet day, a spike, Server B fails, then C, then both come back. The visitor takes over after. */
export const INCIDENT: readonly IncidentStep[] = [
  { at: 0, rps: 900, down: [], log: "900 requests a second. Everything is healthy." },
  { at: 1800, rps: 9000, log: "Traffic spike: 9,000 requests a second." },
  { at: 3300, down: ["b"], log: "Server B is down. Traffic reroutes to two servers." },
  { at: 4800, down: ["b", "c"], log: "Server C is down. One server is left." },
  { at: 6600, down: [], log: "Both servers are back." },
  { at: 8000, log: "Now you break it. Click a server." },
];

export const SPIKE_RPS = 9000;

export type Level = "ok" | "warn" | "bad";

export interface SceneState {
  rps: number;
  /** How many of the four fixes have landed, 0 to 4. */
  fixes: number;
  cache: Level;
  servers: Level;
  db: Level;
  queue: Level;
  /** 0 to 1: how far the queue has backed up. */
  backlog: number;
  served: number;
  caption: string;
  /** The part of the design that is failing now, named in the caption. */
  failing: string | null;
}

/** Requests a second for a scroll position p in 0..1, on a log scale from 100 to 1,000,000. */
export function sceneRps(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return Math.round(10 ** (2 + 4 * c));
}

export const FULL_SERVICE_RPS = 150_000;
export const PEAK_RPS = 1_000_000;

/** Load grows over the first part of the scroll; the rest of it adds the fixes while the load stays at its peak. */
export const BREAK_END = 0.62;
export const FIX_AT = [0.7, 0.78, 0.86, 0.94] as const;

/** Share of requests answered at the peak after each fix, from none to all four. */
const SERVED_AFTER_FIX = [15, 55, 80, 94, 99] as const;

export const FIXES = [
  { part: "cache", caption: "Fix one: cache the hot reads, so most requests never reach a server." },
  { part: "servers", caption: "Fix two: add servers behind the balancer to share the rest." },
  { part: "database", caption: "Fix three: add read replicas and split the data across shards." },
  { part: "queue", caption: "Fix four: add workers to drain the queue. Same traffic, and it is answered." },
] as const;

export function sceneState(rps: number, fixes = 0): SceneState {
  const level = (warnAt: number, badAt: number, fixedBy: number): Level =>
    fixes >= fixedBy ? "ok" : rps >= badAt ? "bad" : rps >= warnAt ? "warn" : "ok";
  const cache = level(20_000, 120_000, 1);
  const servers = level(80_000, FULL_SERVICE_RPS, 2);
  const db = level(100_000, 300_000, 3);
  const queue = level(300_000, 700_000, 4);
  const backlog = fixes >= 4 ? 0 : Math.min(1, Math.max(0, (rps - 300_000) / 700_000));
  const served = fixes > 0 ? SERVED_AFTER_FIX[fixes] : rps <= FULL_SERVICE_RPS ? 100 : Math.round((FULL_SERVICE_RPS / rps) * 100);

  let caption = "A few servers answer this without noticing.";
  let failing: string | null = null;
  if (fixes > 0) {
    caption = FIXES[fixes - 1].caption;
  } else if (rps >= 600_000) {
    caption = "Requests pile up in the queue and wait longer than anyone will.";
    failing = "queue";
  } else if (rps >= 200_000) {
    caption = "The database saturates. It cannot read and write this fast.";
    failing = "database";
  } else if (rps >= 60_000) {
    caption = "The servers saturate. One copy cannot answer this many.";
    failing = "servers";
  } else if (rps >= 10_000) {
    caption = "The cache fills, and hot reads still come back in milliseconds.";
    failing = "cache";
  }
  return { rps, fixes, cache, servers, db, queue, backlog, served, caption, failing };
}

/** The whole scene for a scroll position: the load climbs and breaks things, then the fixes land one by one at the peak. */
export function sceneFrame(p: number): SceneState {
  const c = Math.min(1, Math.max(0, p));
  if (c <= BREAK_END) return sceneState(sceneRps(c / BREAK_END));
  return sceneState(PEAK_RPS, FIX_AT.filter((at) => c >= at).length);
}
