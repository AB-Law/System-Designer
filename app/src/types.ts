export type Cfg = Record<string, any>;

export type FieldDef = (
  | { type: "number"; unit?: string; min?: number; max?: number; step?: number; default: number }
  | { type: "ratio"; default: number; max?: number }
  | { type: "toggle"; default: boolean }
  | { type: "select"; options: string[]; default: string }
  | { type: "list"; placeholder?: string; addLabel?: string; default: string[] }
) & {
  key: string;
  label: string;
  showIf?: { key: string; equals: unknown };
  /** edited by a custom panel, not as a plain field */ hidden?: boolean;
};

export interface SectionDef {
  id: string;
  title: string;
  collapsed?: boolean;
  fields: FieldDef[];
}

/** What the simulator needs to know about one block, derived from its settings. */
export interface BlockModel {
  /** total rps the block can handle across all instances */
  capacity: number;
  /** latency added to a request passing through, in ms */
  latencyMs: number;
  /** fraction of handled requests forwarded downstream (caches absorb the rest) */
  passThrough: number;
  /** same, for writes. Caches and CDNs only absorb reads: a write still has to reach the store. Defaults to passThrough. */
  writePassThrough?: number;
  /** stores only: operations per second the block can do when everything it receives is a read (or a write). Overrides capacity. */
  readCapacity?: number;
  writeCapacity?: number;
  /** number of independent instances; losing one removes 1/instances of capacity */
  instances: number;
  /** how outgoing sync edges share traffic: split between them, or call all of them */
  fanout: "split" | "all";
  /** circuit breaker caps the damage of a slow dependency */
  timeoutMs?: number;
  circuitBreaker?: boolean;
  /** hard rps ceiling that drops (not queues) excess, e.g. rate limiter */
  dropAbove?: number;
  /** estimated monthly cost in dollars for everything this block is configured to run */
  cost: number;
}

export interface BlockDef {
  id: string;
  category: "entry" | "compute" | "data" | "async" | "external";
  label: string;
  summary: string;
  color: string;
  icon: string;
  sections: SectionDef[];
  /** `source` blocks generate traffic; `queue` blocks buffer async work; `consumer` drain queues */
  role?: "source" | "queue" | "consumer";
  model: (cfg: Cfg) => BlockModel;
}

export type EdgeKind = "sync" | "async" | "both";

export interface NodeData extends Record<string, unknown> {
  blockId: string;
  cfg: Cfg;
  responsibilities: string[];
  /** ids of the problem's capabilities this block runs. undefined (old saves) means "the primary request". */
  capabilities?: string[];
}

export interface EdgeData extends Record<string, unknown> {
  kind: EdgeKind;
}

export interface DesignNode {
  id: string;
  blockId: string;
  cfg: Cfg;
  responsibilities: string[];
  capabilities?: string[];
}
export interface DesignEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
}
export interface Design {
  nodes: DesignNode[];
  edges: DesignEdge[];
}

// ---------- problems ----------

export type Check =
  | { type: "scenario"; scenario: string; metric: "latencyMs" | "served"; op: "<=" | ">="; value: number }
  | { type: "has"; blocks: string[] }
  | { type: "asyncEdge" }
  | { type: "noSaturation"; scenario: string }
  | { type: "budget" }
  | { type: "scenarioPass"; scenario: string }
  | { type: "queryPlans" }
  | { type: "hosted"; capability: string }
  | { type: "isolated"; capability: string }
  | { type: "ai" };

export interface Requirement {
  id: string;
  text: string;
  check: Check;
}

/** One column of a table. `distinct` is how many different values it holds, which decides how well it narrows a search. */
export interface DataColumn {
  name: string;
  label?: string;
  distinct: number;
  pk?: boolean;
  /** values only ever grow (a timestamp, a counter): new rows always land at the end */
  monotonic?: boolean;
}
export interface DataTable {
  id: string;
  label: string;
  rows: number;
  columns: DataColumn[];
}
/** A query the system runs against a table, on behalf of one capability. */
export interface DataQuery {
  id: string;
  label: string;
  capability: string;
  table: string;
  op: "read" | "write";
  /** columns it filters on by equality */
  where?: string[];
  orderBy?: string[];
  /** rows it returns (or must read, for a count): default 1 */
  page?: number;
  /** rows a deep page skips when paging by offset */
  depth?: number;
  /** how many other tables it joins */
  joins?: number;
  /** how many rows match the filter, when that is not just rows divided by how selective each column is */
  matches?: number;
  /** times it runs per request of its capability: default 1 */
  perRequest?: number;
}
export interface DataModel {
  tables: DataTable[];
  queries: DataQuery[];
}

/**
 * Something the system must do. The player decides which block runs it, which is what makes a
 * monolith (one block runs everything) different from microservices (one block per capability).
 */
export interface Capability {
  id: string;
  label: string;
  hint?: string;
  /** "request" is part of serving a request; "background" runs on its own schedule */
  mode?: "request" | "background";
  /** request: fraction of all requests that need it (0..1) */
  share: number;
  /** CPU work per use, relative to a plain request (1) */
  work: number;
  /** request: the request cannot succeed without it. false means it can be skipped with a fallback */
  critical: boolean;
  /** background: operations per second the job performs (it also loads whatever it writes to) */
  jobsPerSec?: number;
  /** block types the host must be connected to (directly or through a cache or balancer), e.g. ["third_party"] for an ad network */
  needs?: string[];
  /** fraction of this capability's requests that write (0 = pure read, 1 = pure write). Defaults to the problem's traffic.writeShare. */
  writes?: number;
  /** block types this capability reads from or writes to (e.g. search uses search_index, checkout uses database). Steers which child receives its share of the traffic. */
  uses?: string[];
  /**
   * Correctness guarantees the design must provide for this capability.
   * exclusive_access: only one writer wins (no double booking, no duplicate id). Needs database row locks or a lock service.
   * idempotent: running it twice has the same effect as once. Needs a worker with idempotent processing on.
   * unique_ids: no two things get the same id (short links, order numbers). The host needs an ID strategy, and a connected database with locking so ranges can be leased or collisions checked atomically.
   * transactions: several writes succeed or fail together (a ledger, an order with its payment). Needs a connected relational Database set to Serializable.
   * ordered_delivery: messages are handled in the order they were sent. The host must read from a Stream.
   * replay: past events can be re-read after a bug or a new feature. The host must read from a Stream that keeps at least a day.
   */
  requires?: ("exclusive_access" | "idempotent" | "ordered_delivery" | "replay" | "transactions" | "unique_ids")[];
}

export interface Failure {
  /** pick the target by capability, by block type preference list, or by responsibility keyword */
  target: {
    types?: string[];
    responsibility?: string;
    capability?: string;
    kind?: string;
    nodeId?: string;
    /** every block running in this region ("us", "eu" or "ap") goes down */ region?: string;
  };
  mode: "down" | "slow";
  factor?: number;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  trafficMultiplier: number;
  failure?: Failure;
  /** multiply how often a capability is needed in this scenario, e.g. {"post": 10} when a celebrity posts. Background jobs scale their rate. */
  capabilityLoad?: Record<string, number>;
  /** where the users are in this scenario, as shares that add up to 1 (default: all in the problem's home region) */
  regionMix?: Record<string, number>;
  /** how the reference design handles this scenario, shown on request */
  debrief?: string;
  /** invented by the AI interviewer after reading a design, not part of the problem */
  fromInterviewer?: boolean;
  interviewQuestion: string;
}

/** A worked alternative: a design known to pass every scenario, written out so a learner can compare. */
export interface Reference {
  summary: string;
  design: string[];
  tradeoffs: string[];
}

/** Mirrors backend/schema/problems.py; JSON Schema: backend/schema/problem.schema.json (and schemas/problem.schema.json). */
export interface Problem {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  brief: string;
  constraints: string[];
  traffic: { users: number; reqPerUser: number; writeShare: number };
  latencyTargetMs: number;
  /** set when the problem has scenarios with users in several regions; blocks then get a Region setting */
  regions?: { home: string };
  /** tables and the queries that run against them. When present, the database block gets a Data model section. */
  dataModel?: DataModel;
  capabilities?: Capability[];
  reference?: Reference;
  /** the best cache hit ratio this workload allows (the share of repeats it really contains). Caches cannot claim more. */
  cacheHitCap?: number;
  /** monthly spend the design must stay under */
  budget?: number;
  scenarios: Scenario[];
  requirements: Requirement[];
  rubric: string[];
}

// ---------- results ----------

export interface NodeResult {
  id: string;
  incoming: number;
  handled: number;
  dropped: number;
  utilization: number;
  latencyMs: number;
  /** work units one request costs on this block (a monolith hosting several capabilities is above 1) */
  work: number;
  /** how much of `incoming` is writes (the rest is reads) */
  incomingWrites?: number;
  /** the region the block ran in during this scenario (a database that failed over has moved) */
  region?: string;
  /** stores only: what the block could take if it were all reads, or all writes */
  readCapacity?: number;
  writeCapacity?: number;
  down?: boolean;
}

export interface Advice {
  /** what to change in the design */
  change: string;
  /** why that change helps */
  why: string;
}

export interface ConfidenceItem {
  label: string;
  value: string;
  /** true helps the score, false hurts it, null is neutral information */
  good: boolean | null;
}

export interface ConfidenceDetail {
  how: string;
  items: ConfidenceItem[];
  tip?: string;
}

export interface ScenarioResult {
  scenarioId: string;
  title: string;
  offered: number;
  served: number; // 0..1
  latencyMs: number;
  nodes: Record<string, NodeResult>;
  /** the typical-peak latency users in each region see, when the scenario has users in several */
  latencyByRegion?: Record<string, number>;
  saturated: string[];
  queueBacklog: Record<string, number>; // msgs/s above drain rate
  score: number;
  pass: boolean;
  failureTarget?: string;
  notes: string[];
  /** plain-language reasons a scenario failed, in order of importance */
  reasons: string[];
  /** what to change, and why it helps */
  advice: Advice[];
  /** the busiest block in this scenario, to show how much headroom a passing design has */
  peak?: { label: string; utilization: number };
}

export type Severity = "bad" | "warn" | "info" | "ok";
export type Dimension = "scalability" | "reliability" | "faultIsolation" | "latency";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  why?: string;
  dimension: Dimension;
  nodeIds?: string[];
}

export interface RequirementResult {
  id: string;
  text: string;
  met: boolean | null; // null = needs AI review
  /** true when the AI review decided this one, not the simulator */
  byAi?: boolean;
  detail: string;
}

export interface RunResult {
  scenarios: ScenarioResult[];
  findings: Finding[];
  confidence: Record<Dimension, number>;
  confidenceTotal: number;
  confidenceDetail: Record<Dimension, ConfidenceDetail>;
  /** results of the interviewer's follow-up tests on this design. Shown, but not part of the score. */
  interview: ScenarioResult[];
  /** the three parts the overall score is made of, each 0 to 100 */
  scoreParts: { scenarios: number; requirements: number; confidence: number; capped?: string };
  requirements: RequirementResult[];
  score: number;
  cost: number;
  budget?: number;
}

/** The reviewer's decision on a requirement that only a person could judge. */
export interface Verdict {
  id: string;
  met: boolean;
  reason: string;
}

export interface AiReview {
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  requirementNotes?: string[];
  /** the reviewer's verdict on each subjective requirement the problem author marked for AI judgement */
  verdicts?: Verdict[];
  /** the interviewer's follow-up tests, already checked against this design and runnable by the simulator */
  followUps?: Scenario[];
}

export interface Submission {
  at: number;
  score: number;
  passed: number;
  total: number;
  result: RunResult;
  review?: AiReview;
}

// ---------- accounts, sharing, AI coach ----------

export interface User {
  id: number;
  username: string;
}

export interface SharedComment {
  id: number;
  text: string;
  created: number;
  author: string;
  userId: number;
}

/** A design someone else sent: from a revocable link on the server, or a self-contained link. */
export interface SharedView {
  source: "server" | "link";
  token?: string;
  problemId: string;
  label: string;
  owner?: string;
  score?: number | null;
  created?: number;
  doc: import("./cloud/doc").DesignDoc;
  comments: SharedComment[];
  mine: boolean;
}

export interface AiSettings {
  provider: "off" | "lmstudio" | "openai";
  baseUrl: string;
  apiKey: string;
  model: string;
  /** LM Studio reasoning models: "default" lets the model decide, "off" skips thinking, "low" thinks briefly */
  thinking: "default" | "off" | "low";
}

/** A change the coach suggests. Nothing here touches the canvas until the learner approves it. */
export type Change =
  | { op: "add_block"; ref: string; blockId: string; settings: Cfg; capabilities?: string[] }
  | { op: "set_settings"; nodeId: string; settings: Cfg; capabilities?: string[] }
  | { op: "connect"; from: string; to: string; kind: EdgeKind }
  | { op: "disconnect"; from: string; to: string };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  changes?: Change[];
  /** the changes in plain words, written when they were proposed so the wording does not change after they are applied */
  summary?: string[];
  /** pending: waiting for the learner to approve or dismiss */
  status?: "pending" | "applied" | "dismissed";
}

/** One self-contained suggestion from the AI advisor: a few changes that belong together, and why they help. */
export interface AdvisorProposal {
  id: string;
  title: string;
  /** the reasoning, in plain words, so the learner can see why the change helps */
  why: string;
  changes: Change[];
  /** the changes in plain words, written when they were proposed */
  summary: string[];
  /** what the simulator says happens if this proposal is applied on its own */
  effect?: string;
  /** the simulator scores the design lower with this applied */
  worse?: boolean;
  status: "pending" | "applied" | "rejected" | "stale";
}

export interface AdvisorResult {
  /** fix: build what is missing for a weak rating. tune: review the current setup and suggest changes */
  mode: "fix" | "tune";
  focus?: Dimension;
  summary: string;
  proposals: AdvisorProposal[];
}
