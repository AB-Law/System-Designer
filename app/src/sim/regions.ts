import type { Cfg } from "../types";

/*
  Three fixed regions. A block runs in one of them; users are spread across them by the scenario. A call that crosses regions
  pays the round-trip time between them. Data lives in a home region; a database can also keep copies elsewhere, which serve
  reads locally, while every write still goes home.
*/

export type RegionId = "us" | "eu" | "ap";

export const REGIONS: { id: RegionId; label: string; short: string }[] = [
  { id: "us", label: "US East", short: "US" },
  { id: "eu", label: "Europe", short: "EU" },
  { id: "ap", label: "Asia Pacific", short: "AP" },
];
export const REGION_LABELS = REGIONS.map((r) => r.label);
export const DEFAULT_REGION = REGIONS[0].label;

/** Round-trip milliseconds between regions. */
const RTT: Record<RegionId, Record<RegionId, number>> = {
  us: { us: 0, eu: 85, ap: 160 },
  eu: { us: 85, eu: 0, ap: 130 },
  ap: { us: 160, eu: 130, ap: 0 },
};
export const rtt = (a?: RegionId, b?: RegionId): number => (a && b ? RTT[a][b] : 0);

export function regionId(value: unknown, fallback: RegionId = "us"): RegionId {
  const r = REGIONS.find((x) => x.label === value || x.id === value);
  return r ? r.id : fallback;
}
export const regionLabel = (id: RegionId): string => REGIONS.find((r) => r.id === id)?.label ?? id;
export const regionShort = (id: RegionId): string => REGIONS.find((r) => r.id === id)?.short ?? id;

/** Blocks that sit in a region. Users, the CDN's edge and outside providers are everywhere, so they have none. */
const PLACEABLE = new Set([
  "load_balancer",
  "api_gateway",
  "reverse_proxy",
  "rate_limiter",
  "server",
  "service",
  "websocket",
  "worker",
  "database",
  "cache",
  "search_index",
  "geo_index",
  "blob_storage",
  "queue",
  "stream",
]);
export const isPlaceable = (blockId: string): boolean => PLACEABLE.has(blockId);

/** Other regions in which a database keeps a copy (serving reads locally). Anything unknown is ignored. */
export function copyRegions(cfg: Cfg, home: RegionId): RegionId[] {
  const raw: unknown[] = Array.isArray(cfg.replicaRegions) ? cfg.replicaRegions : [];
  const out: RegionId[] = [];
  for (const v of raw) {
    const r = REGIONS.find((x) => x.label === v || x.id === v)?.id;
    if (r && r !== home && !out.includes(r)) out.push(r);
  }
  return out;
}
