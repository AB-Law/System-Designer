// Live simulation: turns the engine's numbers into what the canvas shows (block states, how busy each connection is)
// and a plain-language caption. Pure functions only; the animation itself lives in the canvas components.
import { BLOCK_MAP } from "../blocks";
import { simulate } from "./engine";
import { diagnoseNode } from "./diagnose";
import type { Design, Failure, Finding, NodeResult, Problem, Scenario, ScenarioResult } from "../types";

export type LiveState = "idle" | "healthy" | "busy" | "saturated" | "failing" | "degraded" | "down";

export interface NodeVisual {
  state: LiveState;
  /** short text cue, so colour is never the only signal */
  label: string;
  icon: string;
  /** requests waiting in this block's queue right now, when it has a backlog */
  queue?: number;
}

export interface EdgeFlow {
  /** requests per second crossing this connection */
  rate: number;
  /** 0..1 relative to the busiest connection */
  intensity: number;
  /** nothing can cross: an end is down */
  dead: boolean;
  /** share of the traffic that will be lost at the far end (0..1) */
  lossShare: number;
  /** how many particles to draw */
  particles: number;
}

export interface LiveControls {
  spike: boolean;
  /** node ids of the blocks that have been killed, all at once */
  killed?: string[];
}

export const MAX_PARTICLES = 5;
export const SPIKE_MIN = 3;

const fmt = (n: number) => Math.round(n).toLocaleString();

/** Scenario to simulate for the current controls: steady traffic, optionally a spike, optionally a dead block. */
export function liveScenario(base: Scenario | undefined, c: LiveControls): Scenario {
  const mult = c.spike ? Math.max(SPIKE_MIN, base?.trafficMultiplier ?? 1) : 1;
  const killed = c.killed ?? [];
  const down = (id: string): Failure => ({ target: { nodeId: id }, mode: "down" });
  return {
    id: "__live",
    title:
      killed.length > 1
        ? "Live: several blocks are down"
        : killed.length
          ? "Live: a block is down"
          : c.spike
            ? "Live: traffic spike"
            : "Live: steady traffic",
    description: "",
    trafficMultiplier: mult,
    capabilityLoad: c.spike ? base?.capabilityLoad : undefined,
    regionMix: base?.regionMix,
    failure: killed.length ? down(killed[0]) : undefined,
    alsoDown: killed.length > 1 ? killed.slice(1).map(down) : undefined,
    interviewQuestion: "",
  };
}

export function runLive(design: Design, problem: Problem, base: Scenario | undefined, c: LiveControls): ScenarioResult {
  return simulate(design, problem, liveScenario(base, c));
}

export function nodeVisual(res: NodeResult | undefined, blockId: string, queue = 0, lostCopy = false): NodeVisual {
  const q = queue >= 1 ? { queue } : {};
  if (!res || blockId === "user") return { state: "idle", label: "", icon: "", ...q };
  if (res.down) return { state: "down", label: "Down", icon: "✕", ...q };
  if (res.incoming <= 0) return { state: "idle", label: "", icon: "", ...q };
  const u = res.utilization;
  const lost = res.dropped / res.incoming;
  if (u >= 1.5 || lost > 0.25) return { state: "failing", label: "Dropping requests", icon: "⚠", ...q };
  if (u >= 1) return { state: "saturated", label: "Saturated", icon: "▲", ...q };
  // the killed block survived because it has spare copies: say so instead of looking untouched
  if (lostCopy) return { state: "degraded", label: "Lost a copy", icon: "✕", ...q };
  if (u >= 0.8) return { state: "busy", label: "Busy", icon: "◐", ...q };
  return { state: "healthy", label: "Healthy", icon: "✓", ...q };
}

export function nodeVisuals(
  design: Design,
  result: ScenarioResult,
  queues: Record<string, number> = {},
  killed: string[] = [],
): Record<string, NodeVisual> {
  const out: Record<string, NodeVisual> = {};
  for (const n of design.nodes) out[n.id] = nodeVisual(result.nodes[n.id], n.blockId, queues[n.id] ?? 0, killed.includes(n.id));
  return out;
}

/**
 * How much traffic crosses each connection. The engine knows what each block receives, not per connection, so a
 * block's incoming traffic is split between the connections feeding it in proportion to what their sources handled.
 */
export function edgeFlows(design: Design, result: ScenarioResult): Record<string, EdgeFlow> {
  const weight = (sourceId: string) => {
    const r = result.nodes[sourceId];
    return r ? Math.max(r.handled, r.incoming, 0) : 0;
  };
  const rates: Record<string, number> = {};
  for (const n of design.nodes) {
    const ins = design.edges.filter((e) => e.target === n.id);
    if (!ins.length) continue;
    const incoming = result.nodes[n.id]?.incoming ?? 0;
    const total = ins.reduce((a, e) => a + weight(e.source), 0);
    for (const e of ins) rates[e.id] = incoming * (total > 0 ? weight(e.source) / total : 1 / ins.length);
  }
  // a user block receives nothing; the traffic it emits is what its outgoing connections carry
  for (const e of design.edges) {
    if (rates[e.id] !== undefined) continue;
    rates[e.id] = 0;
  }
  const max = Math.max(0, ...Object.values(rates));
  const out: Record<string, EdgeFlow> = {};
  for (const e of design.edges) {
    const to = result.nodes[e.target];
    const from = result.nodes[e.source];
    const dead = !!to?.down || !!from?.down;
    const rate = dead ? 0 : rates[e.id];
    const intensity = max > 0 ? Math.sqrt(rate / max) : 0;
    const lossShare = !dead && to && to.incoming > 0 ? Math.min(1, to.dropped / to.incoming) : 0;
    out[e.id] = { rate, intensity, dead, lossShare, particles: rate > 0 ? 1 + Math.round(intensity * (MAX_PARTICLES - 1)) : 0 };
  }
  return out;
}

/** One step of queue depth: it grows by the backlog rate while a consumer falls behind, and drains once it catches up. */
export function stepQueues(depth: Record<string, number>, backlog: Record<string, number>, dtSec: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of new Set([...Object.keys(depth), ...Object.keys(backlog)])) {
    const rate = backlog[id] ?? 0;
    const next = rate > 0 ? (depth[id] ?? 0) + rate * dtSec : (depth[id] ?? 0) * Math.pow(0.5, dtSec);
    if (next >= 1) out[id] = next;
  }
  return out;
}

/**
 * Share of requests served. The engine treats a router whose only target is down as a leaf and reports full service,
 * so when a killed block went fully down and no sibling of the same kind picked up its traffic, count what it carried as lost.
 */
export function servedOf(design: Design, result: ScenarioResult, before: ScenarioResult, killed: string[] = []): number {
  if (before.offered <= 0) return result.served;
  let lost = 0;
  for (const id of killed) {
    const was = before.nodes[id];
    if (!result.nodes[id]?.down || !was) continue;
    const kind = design.nodes.find((n) => n.id === id)?.blockId;
    const takeover = design.nodes
      .filter((n) => !killed.includes(n.id) && n.blockId === kind)
      .reduce((a, n) => a + Math.max(0, (result.nodes[n.id]?.incoming ?? 0) - (before.nodes[n.id]?.incoming ?? 0)), 0);
    lost += Math.max(0, was.incoming - takeover) / before.offered;
  }
  if (lost <= 0) return result.served;
  return Math.max(0, Math.min(result.served, before.served - Math.min(1, lost)));
}

/** Requests lost per second, given the share served. */
export function droppedPerSec(result: ScenarioResult, served = result.served): number {
  return Math.max(0, result.offered * (1 - served));
}

const labelOf = (design: Design, id: string) => {
  const n = design.nodes.find((x) => x.id === id);
  return n ? (BLOCK_MAP[n.blockId]?.label ?? n.blockId) : "A block";
};

/** The busiest non-down block, the one worth explaining. */
function worstNode(design: Design, result: ScenarioResult) {
  return design.nodes
    .filter((n) => n.blockId !== "user" && result.nodes[n.id] && !result.nodes[n.id].down && result.nodes[n.id].incoming > 0)
    .sort((a, b) => result.nodes[b.id].utilization - result.nodes[a.id].utilization)[0];
}

export interface Caption {
  tone: "good" | "warn" | "bad";
  /** what just happened */
  what: string;
  /** why, and what it means */
  why: string;
}

/** A short explanation of the current live state, in terms of what the controls just changed. */
export function captionFor(
  design: Design,
  problem: Problem,
  result: ScenarioResult,
  before: ScenarioResult,
  c: LiveControls,
  findings: Finding[] = [],
): Caption {
  const sv = servedOf(design, result, before, c.killed ?? []);
  const served = Math.round(sv * 100);
  const servedBefore = Math.round(before.served * 100);
  const worst = worstNode(design, result);
  const wres = worst ? result.nodes[worst.id] : undefined;
  const diag = worst ? diagnoseNode(worst, wres, result, findings, design, problem) : undefined;

  const killed = c.killed ?? [];
  if (killed.length > 1) {
    const names = killed.map((id) => labelOf(design, id));
    const fullyDown = killed.filter((id) => result.nodes[id]?.down).map((id) => labelOf(design, id));
    const lost = before.served - sv;
    return {
      tone: lost <= 0.02 ? "good" : sv < 0.95 ? "bad" : "warn",
      what: `${killed.length} blocks went down together (${names.join(", ")}), and ${served}% of requests are served${lost > 0.02 ? `, down from ${servedBefore}%` : ""}.`,
      why:
        lost <= 0.02
          ? "Every one of them had spare copies, so the rest took over and users barely notice."
          : fullyDown.length
            ? `${fullyDown.join(", ")} had no copy left to take over, and failures at the same moment leave the others less room to help. About ${fmt(droppedPerSec(result, sv))} requests a second are lost.`
            : `The surviving copies cannot carry the whole load, so about ${fmt(droppedPerSec(result, sv))} requests a second are lost.`,
    };
  }
  if (killed.length === 1) {
    const id = killed[0];
    const name = labelOf(design, id);
    // the engine takes one copy of a block away: with spares the block lives on at lower capacity
    if (!result.nodes[id]?.down) {
      if (before.served - sv <= 0.02)
        return {
          tone: "good",
          what: `One copy of ${name} went down, and ${served}% of requests are still served.`,
          why: `${name} runs more than one copy, so the rest took over its share and users barely notice. That is what spare copies buy you.`,
        };
      return {
        tone: sv < 0.95 ? "bad" : "warn",
        what: `One copy of ${name} went down, and ${served}% of requests are served now, down from ${servedBefore}%.`,
        why: `The remaining copies of ${name} cannot carry the whole load, so about ${fmt(droppedPerSec(result, sv))} requests a second are lost. Add spare capacity.`,
      };
    }
    if (sv >= before.served - 0.02)
      return {
        tone: "good",
        what: `${name} went down, and ${served}% of requests are still served.`,
        why: `Other copies took over its share, so users barely notice. That is what running more than one copy buys you.`,
      };
    const lost = before.served - sv;
    return {
      tone: "bad",
      what: `${name} went down, and ${served}% of requests are served now, down from ${servedBefore}%.`,
      why:
        lost > 0.5
          ? `Everything that needs ${name} stops, because nothing can take over. Run a second copy so one failure is not the whole block.`
          : (diag?.causes[0] ??
            `The survivors cannot take its share, so about ${fmt(droppedPerSec(result, sv))} requests a second are lost.`),
    };
  }
  if (c.spike) {
    const x = Math.round(result.offered / Math.max(1, before.offered));
    if (sv >= 0.98 && (!wres || wres.utilization < 0.8))
      return {
        tone: "good",
        what: `Traffic jumped to about ${fmt(result.offered)} requests a second${x > 1 ? ` (${x}x)` : ""}, and every block coped.`,
        why: `Each block has headroom: the busiest runs at ${Math.round((wres?.utilization ?? 0) * 100)}% of what it can handle.`,
      };
    return {
      tone: sv < 0.95 ? "bad" : "warn",
      what: `Traffic jumped to about ${fmt(result.offered)} requests a second. ${served}% are served.`,
      why: diag ? `${diag.headline} ${diag.causes[0] ?? ""}`.trim() : "The busiest block is close to its limit.",
    };
  }
  return {
    tone: wres && wres.utilization >= 1 ? "bad" : wres && wres.utilization >= 0.8 ? "warn" : "good",
    what: `Steady traffic: about ${fmt(result.offered)} requests a second, ${served}% served.`,
    why: wres
      ? `The busiest block is ${labelOf(design, worst!.id)} at ${Math.round(wres.utilization * 100)}%. Try a traffic spike, or kill a block, to see how the design holds up.`
      : "Connect a User block to your design to give it traffic.",
  };
}
