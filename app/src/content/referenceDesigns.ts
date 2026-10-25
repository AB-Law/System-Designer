import { BLOCK_MAP, defaultCfg } from "../blocks";
import type { Design, DesignEdge, DesignNode } from "../types";

/** A block with its default settings, plus whatever the design changes. */
export const block = (id: string, blockId: string, over: Record<string, unknown> = {}, capabilities?: string[]): DesignNode => ({
  id,
  blockId,
  cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over },
  responsibilities: [],
  ...(capabilities ? { capabilities } : {}),
});
export const link = (source: string, target: string, kind: DesignEdge["kind"] = "sync"): DesignEdge => ({
  id: `${source}-${target}-${kind}`,
  source,
  target,
  kind,
});

/** The personal blog: a balancer in front of `replicas` servers of `capacity` requests a second each, and one database. */
export function blogDesign(o: { replicas: number; capacity: number; balancer?: boolean; dbCapacity?: number }): Design {
  const { replicas, capacity, balancer = true, dbCapacity = 1500 } = o;
  return {
    nodes: [
      block("u", "user", { users: 5000, reqPerUser: 0.02 }),
      ...(balancer ? [block("lb", "load_balancer", { instances: 2, capacity: 5000 })] : []),
      block("s", "server", { capacity, replicas }),
      block("db", "database", { capacity: dbCapacity }),
    ],
    edges: [link("u", balancer ? "lb" : "s"), ...(balancer ? [link("lb", "s")] : []), link("s", "db")],
  };
}

/**
 * Machine-readable reference designs for the problems Roadmap v2 adds. The 17 original problems only describe their reference in
 * words, so they are not checked here. Add an entry when a new problem is added (tasks 12, 13, 17, 20).
 */
export const REFERENCE_DESIGNS: Record<string, Design> = {
  personal_blog: blogDesign({ replicas: 3, capacity: 500 }),
};

/** Problem ids that must have an entry above. Each new-problem task appends its id. */
export const PROBLEMS_NEEDING_A_REFERENCE: string[] = ["personal_blog"];
