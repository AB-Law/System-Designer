import { BLOCK_MAP, defaultCfg } from "../../blocks";
import { analyze } from "../../sim/analyze";
import type { Design, Problem } from "../../types";
import type { MapData } from "./designMapModel";

/*
  The home screen's hero runs the real simulator on a starter design, so what it says about a scenario is what the canvas would say.
  The starter is the smallest thing that could work: users, one server, one database.
*/

const IDS = ["users", "server", "database"] as const;
const BLOCKS = { users: "user", server: "server", database: "database" } as const;

export const STARTER_MAP: MapData = {
  nodes: [
    { id: "users", blockId: "user", x: 0, y: 80 },
    { id: "server", blockId: "server", x: 300, y: 80 },
    { id: "database", blockId: "database", x: 600, y: 80 },
  ],
  edges: [
    { id: "e1", source: "users", target: "server", kind: "sync" },
    { id: "e2", source: "server", target: "database", kind: "sync" },
  ],
};

export function starterDesign(): Design {
  return {
    nodes: IDS.map((id) => ({ id, blockId: BLOCKS[id], cfg: defaultCfg(BLOCK_MAP[BLOCKS[id]]), responsibilities: [] })),
    edges: STARTER_MAP.edges.map((e) => ({ ...e })),
  };
}

/** One scenario's outcome, in the words the hero shows. */
export interface Take {
  id: string;
  title: string;
  /** Percent of requests answered, 0 to 100. */
  served: number;
  latencyMs: number;
  pass: boolean;
  /** The simulator's first reason a scenario failed, if it did. */
  reason: string | null;
  /** Blocks that saturated or failed in this scenario. */
  bad: string[];
}

export function takesFor(design: Design, problem: Problem): Take[] {
  return analyze(design, problem).scenarios.map((r) => ({
    id: r.scenarioId,
    title: r.title,
    served: Math.round(Math.min(1, Math.max(0, r.served)) * 100),
    latencyMs: Math.round(r.latencyMs),
    pass: r.pass,
    reason: r.reasons[0] ?? null,
    bad: [...new Set([...r.saturated, ...(r.failureTarget ? [r.failureTarget] : [])])],
  }));
}
