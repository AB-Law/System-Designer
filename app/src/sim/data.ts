import type { BlockModel, Capability, Cfg, DataQuery, DataTable, Problem } from "../types";

/*
  The data model: what the player chose for a database (indexes, shard keys, paging, denormalising) is checked against the
  queries the problem says the system runs. Each query is costed in "lookup units" (one primary-key lookup = about 1) and
  compared with the best plan that could exist for it. A design with the right data model behaves exactly like the
  calibrated numbers say; every shortfall (a scan, a sort in memory, deep offset paging, asking every shard, a hot shard key,
  indexes nobody needs) costs capacity and latency, and indexes cost writes and money.
*/

export const MAX_INDEXES = 6;
const SCAN_ROW = 1 / 1000; // reading a row in a sequential scan
const INDEX_ROW = 1 / 200; // fetching a row through an index
const SORT_ROW = 1 / 500; // sorting a row in memory
const OFFSET_ROW = 1 / 500; // stepping over a row to reach a deep page
const WRITE_PER_INDEX = 0.4; // every index is another thing a write must update
const JOIN_COST = 0.6; // each join multiplies a read's work
const MS_PER_UNIT = 0.5;
const SCATTER_MS = 3;

export const OFFSET_PAGING = "Offset (page numbers)";
export const KEYSET_PAGING = "Keyset (after the last item)";

export interface ParsedIndex {
  table: string;
  cols: string[];
}
export const indexText = (i: ParsedIndex): string => `${i.table}:${i.cols.join(",")}`;
export const indexLabel = (i: ParsedIndex): string => `${i.table} (${i.cols.join(", ")})`;

export interface QueryPlan {
  id: string;
  label: string;
  op: "read" | "write";
  table: string;
  /** how it runs, in plain words */
  plan: string;
  /** work in lookup units, and what the best possible plan would cost */
  units: number;
  ideal: number;
  /** extra milliseconds over the best plan */
  extraMs: number;
  /** units / ideal: 1 is as good as it gets */
  factor: number;
  /** why it is slower than it could be, in plain words (empty when it is as good as it gets) */
  why: string[];
  scan: boolean;
  scatter: boolean;
  weight: number;
}

export interface DataPlan {
  queries: QueryPlan[];
  readFactor: number;
  writeFactor: number;
  /** share of the shards' combined capacity actually usable, because of a hot shard key (1 = even) */
  skew: number;
  extraMs: number;
  indexes: ParsedIndex[];
  ignored: string[];
  /** monthly dollars for the indexes */
  indexCost: number;
}

const colOf = (t: DataTable, name: string) => t.columns.find((c) => c.name === name);
const pkOf = (t: DataTable): string | undefined => t.columns.find((c) => c.pk)?.name;
const distinct = (t: DataTable, name: string): number => Math.max(1, colOf(t, name)?.distinct ?? t.rows);

/** Read the player's index and shard-key settings, ignoring anything that does not match a real table and column. */
export function parseIndexes(problem: Problem, cfg: Cfg): { valid: ParsedIndex[]; ignored: string[] } {
  const raw: unknown[] = Array.isArray(cfg.indexes) ? cfg.indexes : [];
  const valid: ParsedIndex[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const text = String(item ?? "");
    const m = /^([\w-]+):([\w,-]+)$/.exec(text);
    const table = m && problem.dataModel?.tables.find((t) => t.id === m[1]);
    const cols = m ? m[2].split(",") : [];
    const ok = table && cols.length >= 1 && cols.length <= 3 && new Set(cols).size === cols.length && cols.every((c) => colOf(table, c));
    const pkOnly = ok && cols.length === 1 && pkOf(table!) === cols[0];
    if (!ok || pkOnly || seen.has(text)) {
      ignored.push(text);
      continue;
    }
    if (valid.length >= MAX_INDEXES) {
      ignored.push(text);
      continue;
    }
    seen.add(text);
    valid.push({ table: m![1], cols });
  }
  return { valid, ignored };
}

export function parseShardKeys(problem: Problem, cfg: Cfg): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of Array.isArray(cfg.shardKeys) ? cfg.shardKeys : []) {
    const [t, c] = String(item ?? "").split(":");
    const table = problem.dataModel?.tables.find((x) => x.id === t);
    if (table && c && colOf(table, c)) out.set(t, c);
  }
  return out;
}

/** How unevenly a shard key spreads load: 0 is perfectly even, near 1 puts nearly everything on one shard. */
export function skewOf(t: DataTable, col: string): number {
  const c = colOf(t, col);
  if (!c) return 0;
  if (c.monotonic) return 0.9; // new rows always land on the newest shard
  return Math.min(0.9, 8 / Math.sqrt(Math.max(1, c.distinct)));
}

const matchesOf = (t: DataTable, q: DataQuery): number => {
  if (q.matches !== undefined) return Math.max(1, q.matches);
  let rows = t.rows;
  for (const c of q.where ?? []) rows /= distinct(t, c);
  return Math.max(1, rows);
};

const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The cheapest index or scan for one read, and the best any plan could do. */
function planRead(t: DataTable, q: DataQuery, tableIdx: ParsedIndex[], paging: string, denormalize: boolean) {
  const where = q.where ?? [];
  const order = q.orderBy ?? [];
  const m = matchesOf(t, q);
  const returned = Math.min(q.page ?? 1, m);
  const pk = pkOf(t);
  const idxs: { cols: string[]; pk: boolean }[] = [
    ...(pk ? [{ cols: [pk], pk: true }] : []),
    ...tableIdx.map((i) => ({ cols: i.cols, pk: false })),
  ];

  let best = {
    cost: 1 + t.rows * SCAN_ROW + (order.length ? m * SORT_ROW : 0),
    plan: `Reads every one of the ${Math.round(t.rows).toLocaleString()} rows`,
    scan: true,
    sorted: !order.length,
    examined: t.rows,
  };
  for (const x of idxs) {
    let k = 0;
    while (k < x.cols.length && where.includes(x.cols[k])) k++;
    let cost: number;
    let sorted: boolean;
    let examined: number;
    if (where.length === 0) {
      // no filter: only an index in the sort order helps, by reading the top of it
      if (!order.length || !sameOrder(x.cols.slice(0, order.length), order)) continue;
      sorted = true;
      examined = returned;
      cost = 1 + returned * INDEX_ROW;
    } else if (k === 0) {
      continue;
    } else {
      const full = k === where.length;
      sorted = !order.length || sameOrder(x.cols.slice(k, k + order.length), order);
      const candidates = Math.max(m, t.rows / x.cols.slice(0, k).reduce((a, c) => a * distinct(t, c), 1));
      examined = full && sorted ? returned : candidates;
      cost = 1 + examined * INDEX_ROW + (sorted ? 0 : m * SORT_ROW);
    }
    if (cost < best.cost) {
      const name = x.pk ? "primary key" : `index on (${x.cols.join(", ")})`;
      best = {
        cost,
        plan: `Uses the ${name}${sorted && order.length ? ", already in order" : ""}${!sorted ? `, then sorts ${Math.round(m).toLocaleString()} rows in memory` : ""}`,
        scan: false,
        sorted,
        examined,
      };
    }
  }

  const idealCore = 1 + returned * INDEX_ROW;
  let cost = best.cost;
  const why: string[] = [];
  if (best.scan) why.push(`reads all ${Math.round(t.rows).toLocaleString()} rows to find ${Math.round(m).toLocaleString()}`);
  else if (best.examined > returned * 3)
    why.push(`looks at ${Math.round(best.examined).toLocaleString()} rows to return ${Math.round(returned).toLocaleString()}`);
  if (!best.sorted && !best.scan) why.push("sorts the matches in memory");
  let plan = best.plan;
  if ((q.depth ?? 0) > 0 && paging === OFFSET_PAGING) {
    cost += (q.depth ?? 0) * OFFSET_ROW;
    plan += `, and skips ${Math.round(q.depth ?? 0).toLocaleString()} rows for a deep page`;
    if ((q.depth ?? 0) * OFFSET_ROW > 0.5) why.push("deep pages step over every earlier row");
  }
  const joinMul = 1 + JOIN_COST * (q.joins ?? 0);
  const ideal = idealCore * joinMul; // the comparison is a normalised schema: denormalising can beat it
  if ((q.joins ?? 0) > 0) {
    if (denormalize) plan += ", with the joined data stored alongside";
    else {
      cost *= joinMul;
      plan += `, joined with ${q.joins} other table${q.joins === 1 ? "" : "s"}`;
    }
  }
  return { cost, ideal, plan, scan: best.scan, why };
}

/** Cost every query of the problem against one database's settings. `caps` carry the scenario's request shares. */
export function planQueries(problem: Problem, cfg: Cfg, caps: Capability[]): DataPlan {
  const dm = problem.dataModel;
  const empty: DataPlan = { queries: [], readFactor: 1, writeFactor: 1, skew: 1, extraMs: 0, indexes: [], ignored: [], indexCost: 0 };
  if (!dm) return empty;
  const { valid, ignored } = parseIndexes(problem, cfg);
  const keys = parseShardKeys(problem, cfg);
  const paging = String(cfg.pagination ?? OFFSET_PAGING);
  const denormalize = !!cfg.denormalize;
  const shards = Math.max(1, Number(cfg.shards ?? 1));
  const rr = Math.max(0, Number(cfg.readReplicas ?? 0));

  // how many indexes each table needs, judged by the reads that cannot be answered from the primary key alone
  const need = new Map<string, Set<string>>();
  for (const q of dm.queries) {
    const t = dm.tables.find((x) => x.id === q.table);
    if (!t || q.op !== "read") continue;
    const where = q.where ?? [];
    if (where.length === 1 && where[0] === pkOf(t)) continue;
    const set = need.get(t.id) ?? new Set<string>();
    set.add(`${where.join(",")}|${(q.orderBy ?? []).join(",")}`);
    need.set(t.id, set);
  }

  const queries: QueryPlan[] = [];
  const tableWeight = new Map<string, number>();
  for (const q of dm.queries) {
    const t = dm.tables.find((x) => x.id === q.table);
    const cap = caps.find((c) => c.id === q.capability && c.mode !== "background");
    if (!t || !cap) continue;
    const weight = cap.share * (q.perRequest ?? 1);
    const mine = valid.filter((i) => i.table === t.id);
    let units: number;
    let ideal: number;
    let plan: string;
    let scan = false;
    let scatter = false;
    const why: string[] = [];
    if (q.op === "read") {
      const r = planRead(t, q, mine, paging, denormalize);
      units = r.cost;
      ideal = r.ideal;
      plan = r.plan;
      scan = r.scan;
      why.push(...r.why);
      if (shards > 1) {
        const key = keys.get(t.id);
        const routed = !!key && (q.where ?? []).includes(key);
        if (!routed) {
          scatter = true;
          plan += ", asked of every shard";
          why.push(
            key
              ? `it does not filter by the shard key (${key}), so every shard is asked`
              : "no shard key is chosen, so every shard is asked",
          );
          if (!scan) units *= shards;
        }
      }
    } else {
      units = 1 + WRITE_PER_INDEX * mine.length;
      ideal = 1 + WRITE_PER_INDEX * (need.get(t.id)?.size ?? 0);
      plan = mine.length ? `Insert, updating ${mine.length} index${mine.length === 1 ? "" : "es"} as well` : "Insert";
      if (denormalize && (q.joins ?? 0) > 0) {
        units *= 1 + WRITE_PER_INDEX * (q.joins ?? 0);
        plan += ", and every stored copy of the joined data";
      }
      if (units > ideal * 1.15)
        why.push(
          `every write updates ${mine.length} index${mine.length === 1 ? "" : "es"}, and about ${need.get(t.id)?.size ?? 0} would do`,
        );
    }
    const extraMs = Math.max(0, (units - ideal) * MS_PER_UNIT) + (scatter ? SCATTER_MS : 0);
    queries.push({
      id: q.id,
      label: q.label,
      op: q.op,
      table: t.id,
      plan,
      units,
      ideal,
      extraMs,
      factor: units / Math.max(1e-9, ideal),
      why,
      scan,
      scatter,
      weight,
    });
    tableWeight.set(t.id, (tableWeight.get(t.id) ?? 0) + weight);
  }

  const sum = (qs: QueryPlan[], f: (q: QueryPlan) => number) => qs.reduce((a, q) => a + q.weight * f(q), 0);
  const reads = queries.filter((q) => q.op === "read");
  const writes = queries.filter((q) => q.op === "write");
  const ratio = (qs: QueryPlan[]) => (sum(qs, (q) => q.ideal) > 0 ? sum(qs, (q) => q.units) / sum(qs, (q) => q.ideal) : 1);
  const totalW = queries.reduce((a, q) => a + q.weight, 0);

  let skew = 1;
  if (shards > 1 && totalW > 0) {
    skew = 0;
    for (const [tid, w] of tableWeight) {
      const t = dm.tables.find((x) => x.id === tid)!;
      const key = keys.get(tid);
      skew += w / totalW / (1 + (key ? skewOf(t, key) : 0) * (shards - 1));
    }
  }

  const copies = 1 + rr;
  const indexCost = valid.reduce((a, i) => {
    const t = dm.tables.find((x) => x.id === i.table)!;
    return a + Math.min(120, (t.rows / 1e6) * 4 + 4 * shards) * copies;
  }, 0);

  return {
    queries,
    readFactor: Math.max(0.5, ratio(reads)),
    writeFactor: Math.max(0.7, ratio(writes)),
    skew,
    extraMs: totalW > 0 ? sum(queries, (q) => q.extraMs) / totalW : 0,
    indexes: valid,
    ignored,
    indexCost,
  };
}

/** Apply the data model to a database block's read and write capacity and latency. */
export function applyDataPlan(model: BlockModel, dp: DataPlan, writeShare: number): BlockModel {
  if (model.readCapacity === undefined || model.writeCapacity === undefined) return model;
  const rc = (model.readCapacity / dp.readFactor) * dp.skew;
  const wc = (model.writeCapacity / dp.writeFactor) * dp.skew;
  const w = Math.min(1, Math.max(0, writeShare));
  return { ...model, readCapacity: rc, writeCapacity: wc, capacity: 1 / ((1 - w) / rc + w / wc), latencyMs: model.latencyMs + dp.extraMs };
}

/** Monthly cost of the indexes a database is configured with (zero when the problem has no data model). */
export function dataCost(problem: Problem | undefined, cfg: Cfg): number {
  if (!problem?.dataModel) return 0;
  return planQueries(problem, cfg, []).indexCost;
}
