import { overallReadiness, readinessTier } from "./format";
import type { Summary, Tier, TopicCard } from "./types";

/*
  The numbers behind the Hub's readiness system: which modules feed your readiness and how well, which one is the weakest link,
  and the ring of topic segments. Kept apart from the drawing so they can be tested.
*/

export const SYSTEM_MODULES = [
  { id: "design", label: "Design", hash: "#/design" },
  { id: "cv", label: "CV", hash: "#/cv" },
  { id: "interview", label: "Interview", hash: "#/interview" },
  { id: "study", label: "Study", hash: "#/study" },
] as const;

export type ModuleId = (typeof SYSTEM_MODULES)[number]["id"];

export type Health = Tier | "quiet";

export interface ModuleNode {
  id: ModuleId;
  label: string;
  hash: string;
  available: boolean;
  /** Events recorded in the last seven days. */
  week: number;
  /** 0 to 1, or null when this module has no evidence behind it yet. */
  strength: number | null;
  health: Health;
  detail: string;
}

const WEEK_MS = 7 * 86_400_000;

/** How strong a module's own evidence is: the CV by its fit score, the rest by the topics they have recorded. */
function strengthOf(id: ModuleId, summary: Summary): number | null {
  if (id === "cv") return summary.fit?.total != null ? summary.fit.total / 100 : null;
  const seen = summary.readiness.filter((t) => t.sources.includes(id) && t.strength !== null && t.tier !== "none");
  if (seen.length === 0) return null;
  return seen.reduce((n, t) => n + (t.strength ?? 0), 0) / seen.length;
}

export function moduleNodes(summary: Summary, now: number = Date.now()): ModuleNode[] {
  return SYSTEM_MODULES.map((m) => {
    const available = m.id === "design" || summary.modules.includes(m.id);
    const week = summary.activity.filter((a) => a.module === m.id && now - a.at <= WEEK_MS).length;
    const strength = available ? strengthOf(m.id, summary) : null;
    const health: Health = strength !== null ? readinessTier(Math.round(strength * 100)) : week > 0 ? "building" : "quiet";
    const detail =
      m.id === "cv" && summary.fit?.total != null
        ? `${summary.fit.total} / 100`
        : m.id === "cv"
          ? "Not scored yet"
          : week > 0
            ? `${week} this week`
            : "Quiet this week";
    return { ...m, available, week, strength, health, detail };
  });
}

/** The module most holding your readiness back: the weakest evidence, else the first one that has gone quiet. Null when all are healthy. */
export function weakestLink(nodes: ModuleNode[]): ModuleNode | null {
  const live = nodes.filter((n) => n.available);
  const scored = live.filter((n) => n.strength !== null).sort((a, b) => (a.strength ?? 1) - (b.strength ?? 1));
  if (scored.length > 0 && (scored[0].strength ?? 1) < 0.75) return scored[0];
  return live.find((n) => n.health === "quiet") ?? null;
}

export interface RingSegment {
  slug: string;
  label: string;
  strength: number | null;
  tier: Tier;
}

export const MAX_SEGMENTS = 12;

/** One segment per topic that counts towards readiness, in the order the Hub lists them, capped so each stays a readable size. */
export function ringSegments(topics: TopicCard[]): RingSegment[] {
  return topics
    .filter((t) => !t.extra)
    .slice(0, MAX_SEGMENTS)
    .map((t) => ({ slug: t.slug, label: t.label, strength: t.tier === "none" ? null : t.strength, tier: t.tier }));
}

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;

/** An SVG arc path between two angles in degrees, 0 at the top, clockwise. */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const x = (a: number) => (cx + r * Math.cos(rad(a))).toFixed(2);
  const y = (a: number) => (cy + r * Math.sin(rad(a))).toFixed(2);
  const large = to - from > 180 ? 1 : 0;
  return `M${x(from)} ${y(from)} A${r} ${r} 0 ${large} 1 ${x(to)} ${y(to)}`;
}

/** The angular extent of segment i of n, leaving a small gap between neighbours. */
export function segmentSpan(i: number, n: number, gap = 4): { from: number; to: number } {
  const size = 360 / n;
  return { from: i * size + gap / 2, to: (i + 1) * size - gap / 2 };
}

export function overall(summary: Summary): number | null {
  return overallReadiness(summary.readiness)?.score ?? null;
}
