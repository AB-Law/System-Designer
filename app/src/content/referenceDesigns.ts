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
 * The photo portfolio: optionally a CDN in front, then a balancer, `replicas` servers, a database and (unless left out) blob storage.
 * The CDN's `capacity`, `staticShare` and `hitRatio` are what a learner has to set; they default to the values of the reference.
 */
export function portfolioDesign(o: {
  replicas: number;
  dbCapacity?: number;
  cdn?: { capacity?: number; staticShare?: number; hitRatio?: number } | false;
  blob?: boolean;
}): Design {
  const { replicas, dbCapacity = 1500, cdn = {}, blob = true } = o;
  const nodes = [
    block("u", "user", { users: 50000, reqPerUser: 0.02 }),
    ...(cdn ? [block("cdn", "cdn", { capacity: 6000, staticShare: 0.9, hitRatio: 0.9, ...cdn })] : []),
    block("lb", "load_balancer", { instances: 2, capacity: 5000 }),
    block("s", "server", { capacity: 1000, replicas }),
    block("db", "database", { capacity: dbCapacity }),
    ...(blob ? [block("b", "blob_storage", { capacity: 5000 })] : []),
  ];
  const edges = [
    link("u", cdn ? "cdn" : "lb"),
    ...(cdn ? [link("cdn", "lb")] : []),
    link("lb", "s"),
    link("s", "db"),
    ...(blob ? [link("s", "b")] : []),
  ];
  return { nodes, edges };
}

/**
 * Machine-readable reference designs for the problems Roadmap v2 adds. The 17 original problems only describe their reference in
 * words, so they are not checked here. Add an entry when a new problem is added (tasks 12, 13, 17, 20).
 */
export const REFERENCE_DESIGNS: Record<string, Design> = {
  personal_blog: blogDesign({ replicas: 3, capacity: 500 }),
  photo_portfolio: portfolioDesign({ replicas: 2 }),
};

/** Problem ids that must have an entry above. Each new-problem task appends its id. */
export const PROBLEMS_NEEDING_A_REFERENCE: string[] = ["personal_blog", "photo_portfolio"];
