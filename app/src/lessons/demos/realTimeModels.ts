import { analyze } from "../../sim/analyze";
import type { Design } from "../../types";
import { edge, node, problem, scenario } from "./analyzeModels";

/*
  Module 5 demo models. The region demo uses the app's own `analyze`, so its figures are the ones the canvas would show for the same
  blocks. The matching, payment and budget demos are small teaching models: deterministic functions with invented numbers, none of
  which is produced by the app's simulator.
*/

// ----- losing a region (a weather-alert app) -----
export const ALERTS = { rps: 600, mix: { us: 0.6, eu: 0.4 }, writeShare: 0.1, smallServer: 400, bigServer: 700 };

export type Placement = "one" | "servers" | "servers-and-data";

export interface FailureOutcome {
  /** share of requests answered on a normal day and when US East is gone */
  normalServed: number;
  downServed: number;
  /** what a visitor in Europe waits on a normal day, in ms */
  europeMs: number;
  monthlyCost: number;
}

/**
 * An app with visitors in US East and Europe. `one` runs everything in US East. `servers` adds a server in Europe, but the data stays
 * in US East. `servers-and-data` also gives the database a copy in Europe, which takes over when US East is lost. `full` sizes each
 * server to carry all the traffic by itself; otherwise each is sized for its own region's share (a single region always carries all of it).
 */
export function weatherAlerts(placement: Placement, full: boolean): FailureOutcome {
  const size = full || placement === "one" ? ALERTS.bigServer : ALERTS.smallServer;
  const nodes = [
    node("u", "user", { users: ALERTS.rps, reqPerUser: 1 }),
    node("s0", "server", { capacity: size, replicas: 1, autoscale: false, region: "US East" }),
    node("db", "database", {
      capacity: 2000,
      region: "US East",
      ...(placement === "servers-and-data" ? { replicaRegions: ["Europe"] } : {}),
    }),
  ];
  const edges = [edge("u", "s0"), edge("s0", "db")];
  if (placement !== "one") {
    nodes.push(node("s1", "server", { capacity: size, replicas: 1, autoscale: false, region: "Europe" }));
    edges.push(edge("u", "s1"), edge("s1", "db"));
  }
  const design: Design = { nodes, edges };
  const p = problem("weather-alerts", ALERTS.rps, [
    scenario("normal", { regionMix: ALERTS.mix }),
    scenario("down", { regionMix: ALERTS.mix, failure: { target: { region: "us" }, mode: "down" } }),
  ]);
  p.regions = { home: "us" };
  p.traffic.writeShare = ALERTS.writeShare;
  const result = analyze(design, p);
  const normal = result.scenarios.find((s) => s.scenarioId === "normal")!;
  const down = result.scenarios.find((s) => s.scenarioId === "down")!;
  return {
    normalServed: normal.served,
    downServed: down.served,
    europeMs: normal.latencyByRegion?.eu ?? 0,
    monthlyCost: result.cost,
  };
}

// ----- live matching (festival bikes) -----
export const BIKES = { areas: 4, perArea: 10, riders: 40, claimMs: 20 };
export type LockScope = "city" | "bike";

export interface MatchOutcome {
  /** riders asking in each area, the first being the busy one */
  ridersByArea: number[];
  matched: number;
  /** riders told that no bike is free */
  turnedAway: number;
  /** milliseconds until the last rider has an answer */
  lastAnswerMs: number;
}

/** Riders spread evenly over the areas, with `hotShare` of them in the first (the busy) one. */
export function ridersByArea(hotShare: number): number[] {
  const hot = Math.round(BIKES.riders * hotShare);
  const rest = BIKES.riders - hot;
  const others = BIKES.areas - 1;
  const base = Math.floor(rest / others);
  const extra = rest - base * others;
  return [hot, ...Array.from({ length: others }, (_, i) => base + (i < extra ? 1 : 0))];
}

/**
 * Every rider asks for the nearest free bike in their area at the same moment. Each ask takes the lock on what is being claimed for
 * `claimMs`. With one lock for the whole city every ask waits in a single line. With a lock on each bike, riders who want different
 * bikes go at once; this model assumes they do, which is the best case. A bike is claimed only once, so riders beyond the bikes in
 * their area are turned away.
 */
export function matchRiders(lock: LockScope, hotShare: number): MatchOutcome {
  const byArea = ridersByArea(hotShare);
  const matched = byArea.reduce((total, r) => total + Math.min(r, BIKES.perArea), 0);
  return {
    ridersByArea: byArea,
    matched,
    turnedAway: BIKES.riders - matched,
    lastAnswerMs: lock === "city" ? BIKES.riders * BIKES.claimMs : BIKES.claimMs,
  };
}

// ----- retries and ledgers (a gym fee) -----
export const FEE = { pounds: 12, taps: 3 };

export interface TapsOutcome {
  /** times the customer was charged */
  charges: number;
  /** lines added to the ledger: money out of the customer and money into the shop for each charge */
  ledgerLines: { who: string; pounds: number }[];
  /** what all the lines add up to, which should always be nothing */
  lineTotal: number;
  customerOut: number;
}

/**
 * The customer taps Pay `taps` times because the screen did not answer, and every tap reaches the processor. Without a key to say
 * "this is the same payment", each tap is a new payment. With one, the first tap is carried out and the others are told the result.
 */
export function payTaps(taps: number, withKey: boolean): TapsOutcome {
  const charges = withKey ? Math.min(1, taps) : taps;
  const ledgerLines = Array.from({ length: charges }, () => [
    { who: "Customer", pounds: -FEE.pounds },
    { who: "Gym", pounds: FEE.pounds },
  ]).flat();
  return {
    charges,
    ledgerLines,
    lineTotal: ledgerLines.reduce((total, l) => total + l.pounds, 0),
    customerOut: charges * FEE.pounds,
  };
}

// ----- reconciliation (a day's payments) -----
export interface Payment {
  id: string;
  pounds: number;
  /** made after the provider's end-of-day cut-off, so it is on tomorrow's statement */
  late?: boolean;
}
export const OURS: Payment[] = [
  { id: "A1", pounds: 12 },
  { id: "A2", pounds: 30 },
  { id: "A3", pounds: 8.5 },
  { id: "A4", pounds: 45 },
  { id: "A5", pounds: 20 },
  { id: "A6", pounds: 60 },
  { id: "A7", pounds: 9, late: true },
];
export const THEIRS: Payment[] = [
  { id: "A1", pounds: 12 },
  { id: "A2", pounds: 30 },
  { id: "A3", pounds: 8.5 },
  { id: "A4", pounds: 54 },
  { id: "A6", pounds: 60 },
  { id: "A8", pounds: 22 },
];

export type Finding = "agree" | "amount" | "only-ours" | "only-theirs" | "late";
export interface Line {
  id: string;
  ours?: number;
  theirs?: number;
  finding: Finding;
}

/** Match our books to the provider's statement by payment id. `allowLate` treats a payment made after the cut-off as timing, not an error. */
export function reconcile(allowLate: boolean): Line[] {
  const ids = [...new Set([...OURS.map((p) => p.id), ...THEIRS.map((p) => p.id)])].sort();
  return ids.map((id) => {
    const o = OURS.find((p) => p.id === id);
    const t = THEIRS.find((p) => p.id === id);
    let finding: Finding;
    if (o && t) finding = o.pounds === t.pounds ? "agree" : "amount";
    else if (o) finding = allowLate && o.late ? "late" : "only-ours";
    else finding = "only-theirs";
    return { id, ours: o?.pounds, theirs: t?.pounds, finding };
  });
}

// ----- a time and money budget (a pizza shop's order page) -----
export const BUDGET = { ms: 120, dollars: 500, limitMs: 50, backgroundDollars: 90, badDayFactor: 10 };
export type Handling = "before" | "background" | "limited" | "out";
export const PLACEMENTS: { id: Handling; label: string }[] = [
  { id: "before", label: "Before answering" },
  { id: "background", label: "After answering, in the background" },
  { id: "limited", label: "Before answering, with a time limit" },
  { id: "out", label: "Leave it out" },
];
export const STEPS = [
  { id: "stock", label: "Check the stock", ms: 10, dollars: 80, essential: true },
  { id: "price", label: "Work out the price", ms: 15, dollars: 60, essential: true },
  { id: "save", label: "Save the order", ms: 25, dollars: 110, essential: true },
  { id: "loyalty", label: "Apply the loyalty discount", ms: 45, dollars: 70, essential: false },
  { id: "suggest", label: "Pick a suggested extra", ms: 70, dollars: 120, essential: false },
];

export interface BudgetOutcome {
  ms: number;
  dollars: number;
  withinTime: boolean;
  withinMoney: boolean;
}

/**
 * The time a customer waits is the sum of the steps done before answering. A step in the background adds no waiting but needs a queue
 * and a worker. A time limit caps a step's wait, and what the step would have said is thrown away when it is cut off. On a bad day an
 * optional step takes `badDayFactor` times as long.
 */
export function budget(choice: Record<string, Handling>, badDay: boolean): BudgetOutcome {
  let ms = 0;
  let dollars = 0;
  let background = false;
  for (const s of STEPS) {
    const where: Handling = s.essential ? "before" : (choice[s.id] ?? "before");
    if (where === "out") continue;
    dollars += s.dollars;
    const takes = s.ms * (badDay && !s.essential ? BUDGET.badDayFactor : 1);
    if (where === "background") background = true;
    else if (where === "limited") ms += Math.min(takes, BUDGET.limitMs);
    else ms += takes;
  }
  if (background) dollars += BUDGET.backgroundDollars;
  return { ms, dollars, withinTime: ms <= BUDGET.ms, withinMoney: dollars <= BUDGET.dollars };
}
