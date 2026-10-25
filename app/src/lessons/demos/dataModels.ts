import { analyze } from "../../sim/analyze";
import { planQueries } from "../../sim/data";
import type { Design, Problem } from "../../types";
import { edge, node, problem, scenario } from "./analyzeModels";

/*
  Module 3 demos that use the app's own data code. Each builds a small labelled Problem with a data model and runs `planQueries`
  (and `analyze`) on it, so the plans, work figures and limits are the ones the canvas would show for the same settings. The tables,
  row counts and traffic are invented for the lesson.
*/

// ----- demo: query plans and indexes (a town shop's orders) -----
export const SHOP = { rows: 1_000_000, rps: 900, nodeCapacity: 500, writeShare: 0.05 };

/** The indexes a learner can switch on, as the app writes them. */
export const SHOP_INDEXES = [
  { id: "orders:customer_id", label: "By customer" },
  { id: "orders:customer_id,placed_at", label: "By customer, then date" },
  { id: "orders:placed_at", label: "By date" },
  { id: "orders:status", label: "By status" },
];

function shopProblem(writeShare: number): Problem {
  const p = problem("shop-orders", SHOP.rps, [scenario("now")]);
  p.traffic.writeShare = writeShare;
  p.capabilities = [
    { id: "view", label: "Show a customer's latest orders", share: 1 - writeShare, work: 1, critical: true, writes: 0 },
    { id: "order", label: "Take an order", share: writeShare, work: 1, critical: true, writes: 1 },
  ];
  p.dataModel = {
    tables: [
      {
        id: "orders",
        label: "Orders",
        rows: SHOP.rows,
        columns: [
          { name: "id", distinct: SHOP.rows, label: "Order number", pk: true },
          { name: "customer_id", distinct: 20_000, label: "Customer" },
          { name: "placed_at", distinct: SHOP.rows, label: "Placed at", monotonic: true },
          { name: "status", distinct: 5, label: "Status" },
        ],
      },
    ],
    queries: [
      {
        id: "latest",
        label: "A customer's three latest orders",
        capability: "view",
        table: "orders",
        op: "read",
        where: ["customer_id"],
        orderBy: ["placed_at"],
        page: 3,
        matches: 50,
      },
      { id: "place", label: "Take an order", capability: "order", table: "orders", op: "write" },
    ],
  };
  return p;
}

export interface ShopOutcome {
  /** how the database answers "latest orders", in the app's words */
  plan: string;
  /** work for one such request, in lookup units (finding one order by its number is about 1) */
  readUnits: number;
  /** the least work any plan could do for it */
  bestUnits: number;
  /** work for taking one order, in the same units */
  writeUnits: number;
  scan: boolean;
  /** the most reads and writes a second the database can answer with these indexes */
  readLimit: number;
  writeLimit: number;
  served: number;
  monthlyCost: number;
  /** why the plan is slower than it could be, in words */
  why: string[];
}

export function shop(indexes: string[], writeShare: number = SHOP.writeShare): ShopOutcome {
  const p = shopProblem(writeShare);
  const design: Design = {
    nodes: [
      node("u", "user", { users: SHOP.rps, reqPerUser: 1 }),
      { ...node("s", "server", { capacity: 20000, replicas: 1, autoscale: false }), capabilities: ["view", "order"] },
      node("db", "database", { capacity: SHOP.nodeCapacity, readReplicas: 1, indexes }),
    ],
    edges: [edge("u", "s"), edge("s", "db")],
  };
  const dbCfg = design.nodes[2].cfg;
  const plans = planQueries(p, dbCfg, p.capabilities ?? []);
  const read = plans.queries.find((q) => q.id === "latest")!;
  const write = plans.queries.find((q) => q.id === "place")!;
  const result = analyze(design, p);
  const s = result.scenarios[0];
  const db = s.nodes["db"];
  return {
    plan: read.plan,
    readUnits: read.units,
    bestUnits: read.ideal,
    writeUnits: write.units,
    scan: read.scan,
    readLimit: db.readCapacity ?? 0,
    writeLimit: db.writeCapacity ?? 0,
    served: s.served,
    monthlyCost: result.cost,
    why: read.why,
  };
}

// ----- demo: choosing a partition key (a delivery company's scan log) -----
export const PARCELS = { rows: 1_000_000_000, rps: 4000, nodeCapacity: 1000, shards: 8 };

export const PARCEL_KEYS = [
  { id: "parcel_id", label: "Parcel number" },
  { id: "depot_id", label: "Depot" },
  { id: "scanned_at", label: "Time of the scan" },
  { id: "none", label: "No key chosen" },
];

function parcelProblem(): Problem {
  const p = problem("parcel-scans", PARCELS.rps, [scenario("now")]);
  p.traffic.writeShare = 0.3;
  p.capabilities = [
    { id: "track", label: "Show a parcel's history", share: 0.6, work: 1, critical: true, writes: 0 },
    { id: "depot", label: "List a depot's latest scans", share: 0.1, work: 1, critical: true, writes: 0 },
    { id: "scan", label: "Record a scan", share: 0.3, work: 1, critical: true, writes: 1 },
  ];
  p.dataModel = {
    tables: [
      {
        id: "scans",
        label: "Scans",
        rows: PARCELS.rows,
        columns: [
          { name: "id", distinct: PARCELS.rows, label: "Scan number", pk: true },
          { name: "parcel_id", distinct: 50_000_000, label: "Parcel" },
          { name: "depot_id", distinct: 200, label: "Depot" },
          { name: "scanned_at", distinct: PARCELS.rows, label: "Scanned at", monotonic: true },
        ],
      },
    ],
    queries: [
      {
        id: "history",
        label: "A parcel's history",
        capability: "track",
        table: "scans",
        op: "read",
        where: ["parcel_id"],
        orderBy: ["scanned_at"],
        page: 20,
        matches: 20,
      },
      {
        id: "depot-list",
        label: "A depot's latest scans",
        capability: "depot",
        table: "scans",
        op: "read",
        where: ["depot_id"],
        orderBy: ["scanned_at"],
        page: 50,
        matches: 5000,
      },
      { id: "record", label: "Record a scan", capability: "scan", table: "scans", op: "write" },
    ],
  };
  return p;
}

export interface ParcelOutcome {
  /** share of the slices' combined capacity that can actually be used: 1 is perfectly even */
  usable: number;
  /** the share of all the work that lands on the busiest slice */
  busiest: number;
  /** true when the question has to be asked of every slice */
  historyScatters: boolean;
  depotScatters: boolean;
  served: number;
  monthlyCost: number;
}

export function parcels(key: string): ParcelOutcome {
  const p = parcelProblem();
  const design: Design = {
    nodes: [
      node("u", "user", { users: PARCELS.rps, reqPerUser: 1 }),
      { ...node("s", "server", { capacity: 50000, replicas: 1, autoscale: false }), capabilities: ["track", "depot", "scan"] },
      node("db", "database", {
        capacity: PARCELS.nodeCapacity,
        readReplicas: 1,
        shards: PARCELS.shards,
        indexes: ["scans:parcel_id,scanned_at", "scans:depot_id,scanned_at"],
        shardKeys: key === "none" ? [] : [`scans:${key}`],
      }),
    ],
    edges: [edge("u", "s"), edge("s", "db")],
  };
  const plans = planQueries(p, design.nodes[2].cfg, p.capabilities ?? []);
  const result = analyze(design, p);
  const s = result.scenarios[0];
  return {
    usable: plans.skew,
    busiest: 1 / (plans.skew * PARCELS.shards),
    historyScatters: plans.queries.find((q) => q.id === "history")!.scatter,
    depotScatters: plans.queries.find((q) => q.id === "depot-list")!.scatter,
    served: s.served,
    monthlyCost: result.cost,
  };
}

// ----- demo: a first look at search (order notes) -----
export const NOTES = { rows: 1_000_000, rps: 600 };

export interface SearchOutcome {
  /** the ids of the app's findings about the search part of the design */
  searchFinding: boolean;
  monthlyCost: number;
  /** the notes a word search reads on the main database: all of them with no search index, none with one */
  notesRead: number;
}

/** A shop's order notes: word searches go to the database, or to a search index filled from it. */
export function orderNotes(withIndex: boolean): SearchOutcome {
  const p = problem("order-notes", NOTES.rps, [scenario("now")]);
  const server = node("s", "server", { capacity: 20000, replicas: 1, autoscale: false });
  server.responsibilities = ["Search order notes"];
  const design: Design = {
    nodes: [
      node("u", "user", { users: NOTES.rps, reqPerUser: 1 }),
      server,
      node("db", "database", { capacity: 1000, readReplicas: 1 }),
      ...(withIndex ? [node("si", "search_index", { capacity: 3000 })] : []),
    ],
    edges: [edge("u", "s"), edge("s", "db"), ...(withIndex ? [edge("s", "si")] : [])],
  };
  const result = analyze(design, p);
  return {
    searchFinding: result.findings.some((f) => f.id === "search-on-db"),
    monthlyCost: result.cost,
    notesRead: withIndex ? 0 : NOTES.rows,
  };
}
