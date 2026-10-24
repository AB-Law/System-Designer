// "Why is this red?": a plain-language reason for one block being overloaded, close to its limit, or down, and what to try.
// Built from numbers the simulator already has; it does not re-run anything.
import { BLOCK_MAP } from "../blocks";
import { planQueries } from "./data";
import type { Design, DesignNode, Finding, NodeResult, Problem, ScenarioResult } from "../types";

export interface Diagnosis {
  tone: "bad" | "warn";
  headline: string;
  /** what is going on, in order of importance */
  causes: string[];
  /** what to try */
  tries: string[];
}

const fmt = (n: number) => Math.round(n).toLocaleString();
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

const feeds = (design: Design, from: (n: DesignNode) => boolean, to: string) =>
  design.edges.some((e) => e.target === to && from(design.nodes.find((n) => n.id === e.source) ?? ({} as DesignNode)));

/** Returns undefined when the block is fine in this scenario. */
export function diagnoseNode(
  node: DesignNode,
  res: NodeResult | undefined,
  scenario: ScenarioResult | undefined,
  findings: Finding[],
  design: Design,
  problem: Problem | undefined,
): Diagnosis | undefined {
  if (!res || !scenario || node.blockId === "user") return undefined;
  const label = BLOCK_MAP[node.blockId]?.label ?? node.blockId;
  const cfg = node.cfg;
  const own = findings.filter((f) => f.nodeIds?.includes(node.id) && (f.severity === "bad" || f.severity === "warn"));

  if (res.down) {
    return {
      tone: "bad",
      headline: `${label} is down in "${scenario.title}".`,
      causes: [
        scenario.failureTarget
          ? "This scenario takes it out on purpose, to see whether the rest of the design survives without it."
          : "It stopped working in this scenario.",
      ],
      tries: [
        "Run more than one copy (replicas or instances) so one failure is not the whole block.",
        node.blockId === "database"
          ? "Keep a read replica that can take over."
          : "Put a Load Balancer in front so traffic can move to a healthy copy.",
      ],
    };
  }

  if (res.incoming <= 0 || res.utilization < 0.8) return undefined;
  const over = res.utilization >= 1;
  const can = res.incoming / res.utilization;
  const d: Diagnosis = {
    tone: over ? "bad" : "warn",
    headline: over
      ? can * 20 < res.incoming
        ? `${label} is being sent about ${fmt(res.incoming)} requests a second, many times more than it can handle.`
        : `${label} is being sent about ${fmt(res.incoming)} requests a second but can only handle about ${fmt(can)}.`
      : `${label} is close to its limit: ${fmt(res.incoming)} requests a second against about ${fmt(can)} it can handle.`,
    causes: [],
    tries: [],
  };
  if (over) d.causes.push("Past its limit, requests wait or are dropped, and the problem spreads to everything that depends on it.");

  const writes = num(res.incomingWrites);
  const writeShare = res.incoming > 0 ? writes / res.incoming : 0;
  const instances = Math.max(1, num(cfg.replicas, num(cfg.instances, 1)));

  // the database's own queries: the most surprising reason, and the one with the most dramatic numbers
  if (node.blockId === "database" && problem?.dataModel) {
    const plan = planQueries(problem, cfg, problem.capabilities ?? []);
    const worst = [...plan.queries].sort((a, b) => b.factor - a.factor)[0];
    if (worst && worst.factor >= 5) {
      d.causes.unshift(
        `Each request costs far more than it should: "${worst.label}" ${worst.plan.toLowerCase()}, about ${fmt(worst.factor)} times the work it needs.`,
      );
      d.tries.unshift("Open Advanced: tune the queries on this block and check which index each question needs.");
      if (worst.factor >= 20) {
        // the queries are the whole story: more replicas or a cache would only hide it
        d.headline = `${label} is overwhelmed, mostly because its queries do far more work than they need to.`;
        d.tries.push("Once the queries are cheap, check the load again before adding replicas.");
        return d;
      }
    }
  }

  switch (node.blockId) {
    case "database": {
      if (writeShare > 0.5) {
        d.causes.push(
          `About ${Math.round(writeShare * 100)}% of what reaches it is writes. Read replicas only help with reads; every write goes to the primary.`,
        );
        d.tries.push(
          "Put a Queue and Workers in front of the writes so they arrive smoothly and in batches.",
          "Shard the database so each shard takes part of the writes.",
        );
      } else {
        if (!feeds(design, (n) => n.blockId === "cache", node.id)) {
          d.causes.push("Nothing sits in front of it to absorb repeated reads.");
          d.tries.push("Add a Cache between the server and the database.");
        } else {
          d.causes.push("The cache in front lets too many reads through, or is too small to hold what people ask for.");
          d.tries.push("Raise the cache's hit ratio or give it more replicas.");
        }
        d.tries.push("Add read replicas, or raise the database's capacity.");
      }
      break;
    }
    case "cache":
      d.causes.push("A cache only helps if most requests find what they want in it; every miss goes on to the database.");
      d.tries.push("Add cache replicas, and check the hit ratio is realistic for this workload.");
      break;
    case "server":
    case "service":
      if (res.work > 1.05) {
        d.causes.push(`It runs several jobs together, so each request costs about ${res.work.toFixed(1)} times the work of a single job.`);
        d.tries.push("Move the heaviest job onto its own block so each can scale separately.");
      }
      d.causes.push(instances === 1 ? "There is only one copy of it." : `There are ${instances} copies, each handling a share.`);
      d.tries.push(
        cfg.autoscale
          ? "Raise the maximum number of copies it may grow to."
          : "Add replicas, or turn on autoscale so it grows with traffic.",
      );
      break;
    case "worker":
    case "queue":
      d.causes.push("Work arrives faster than it is processed, so a backlog builds up behind it.");
      d.tries.push("Add workers (or partitions for the queue), or let them process in larger batches.");
      break;
    case "third_party":
      d.causes.push("An outside service has a limit you cannot raise.");
      d.tries.push("Cache what it returns, and add a circuit breaker so a slow answer does not stall everything calling it.");
      break;
    case "load_balancer":
      d.tries.push("Add load balancer instances, or raise their capacity.");
      break;
    default:
      d.tries.push("Add replicas or raise this block's capacity, and check what is calling it so often.");
  }

  for (const f of own.slice(0, 2)) if (!d.causes.includes(f.message)) d.causes.push(f.message);
  d.tries = [...new Set(d.tries)].slice(0, 4);
  d.causes = d.causes.slice(0, 4);
  return d;
}
