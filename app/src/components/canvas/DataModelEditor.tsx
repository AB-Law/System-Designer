import { useMemo, useState } from "react";
import { KEYSET_PAGING, MAX_INDEXES, OFFSET_PAGING, indexLabel, indexText, planQueries, type QueryPlan } from "../../sim/data";
import { useProblem, useStore } from "../../store";
import type { Problem } from "../../types";

const verdict = (q: QueryPlan): "ok" | "warn" | "bad" => (q.factor >= 20 ? "bad" : q.factor >= 1.5 ? "warn" : "ok");
const fmt = (n: number) => Math.round(n).toLocaleString();

type Dm = NonNullable<Problem["dataModel"]>;

const colLabel = (dm: Dm, table: string, col: string) =>
  dm.tables.find((t) => t.id === table)?.columns.find((c) => c.name === col)?.label ?? col;

/** A query in plain words: which table, what it filters and sorts by. The learner works out the index from this. */
function askText(dm: Dm, q: Dm["queries"][number]): string {
  const t = dm.tables.find((x) => x.id === q.table)?.label ?? q.table;
  if (q.op === "write") return `Adds or changes a row in ${t}.`;
  const by = (q.where ?? []).map((c) => colLabel(dm, q.table, c));
  const sort = (q.orderBy ?? []).map((c) => colLabel(dm, q.table, c));
  return (
    [
      `Reads ${t}`,
      by.length ? `finding rows by ${by.join(" and ")}` : "",
      sort.length ? `in order of ${sort.join(", ")}` : "",
      q.page && q.page > 1 ? `${q.page} at a time` : "",
    ]
      .filter(Boolean)
      .join(", ") + "."
  );
}

/** An index whose first column is the table's primary key adds nothing: the key is indexed already. */
const pkFirst = (dm: Dm, i: { table: string; cols: string[] }) =>
  !!dm.tables.find((t) => t.id === i.table)?.columns.find((c) => c.name === i.cols[0])?.pk;

/** The database block's data model: which indexes exist, how it is sharded and paged, and how each query of the problem runs as a result. */
export function DataModelEditor({ nodeId }: { nodeId: string }) {
  const problem = useProblem();
  const node = useStore((s) => s.nodes.find((n) => n.id === nodeId));
  const setCfg = useStore((s) => s.setCfg);
  const dm = problem?.dataModel;
  const [table, setTable] = useState(dm?.tables[0]?.id ?? "");
  const [cols, setCols] = useState<string[]>(["", "", ""]);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);
  const cfg = node?.data.cfg ?? {};
  const plan = useMemo(() => (problem ? planQueries(problem, cfg, problem.capabilities ?? []) : null), [problem, cfg]);
  if (!problem || !dm || !node || !plan) return null;

  const t = dm.tables.find((x) => x.id === table) ?? dm.tables[0];
  const have: string[] = Array.isArray(cfg.indexes) ? cfg.indexes : [];
  const shards = Number(cfg.shards ?? 1);
  const keys: string[] = Array.isArray(cfg.shardKeys) ? cfg.shardKeys : [];
  const picked = cols.filter(Boolean);
  const draft = t && picked.length ? `${t.id}:${picked.join(",")}` : "";
  const canAdd = !!draft && new Set(picked).size === picked.length && !have.includes(draft) && have.length < MAX_INDEXES;

  const setKey = (tableId: string, col: string) =>
    setCfg(nodeId, "shardKeys", [...keys.filter((k) => !k.startsWith(tableId + ":")), ...(col ? [`${tableId}:${col}`] : [])]);

  return (
    <div className="sec dm">
      <button className="sec-h dm-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{open ? "⌄" : "›"}</span> Advanced: tune the queries
      </button>
      {!open && <p className="muted dm-note">Optional. Indexes decide how fast this database finds its rows.</p>}
      {open && (
        <>
          <label className="dm-label">What the app asks this database</label>
          <ul className="dm-asks">
            {dm.queries.map((q) => (
              <li key={q.id}>
                <b>{q.label}</b>
                <small>{askText(dm, q)}</small>
              </li>
            ))}
          </ul>

          <label className="dm-label">Indexes</label>
          <p className="muted dm-note">
            An index lets a question jump to its rows instead of reading the whole table. Match it to what each question filters and sorts
            by.
          </p>
          <ul className="dm-idx">
            {plan.indexes.map((i) => (
              <li key={indexText(i)}>
                <span>
                  {indexLabel(i)}
                  {pkFirst(dm, i) && <small className="dm-warn">Starts with the primary key, which is already indexed.</small>}
                </span>
                <button
                  aria-label={`Remove the index on ${indexLabel(i)}`}
                  onClick={() =>
                    setCfg(
                      nodeId,
                      "indexes",
                      have.filter((x) => x !== indexText(i)),
                    )
                  }
                >
                  ×
                </button>
              </li>
            ))}
            {plan.indexes.length === 0 && <li className="dm-none">None yet. Every table can still be found by its primary key.</li>}
          </ul>
          <div className="dm-add">
            <select aria-label="Table" value={t?.id} onChange={(e) => (setTable(e.target.value), setCols(["", "", ""]))}>
              {dm.tables.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            {[0, 1, 2].map((i) => (
              <select
                key={i}
                aria-label={`Column ${i + 1}`}
                value={cols[i]}
                disabled={i > 0 && !cols[i - 1]}
                onChange={(e) => setCols(cols.map((c, j) => (j === i ? e.target.value : j > i ? "" : c)))}
              >
                <option value="">{i === 0 ? "column…" : "then…"}</option>
                {t?.columns
                  .filter((c) => !cols.slice(0, i).includes(c.name))
                  .map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.label ?? c.name}
                    </option>
                  ))}
              </select>
            ))}
            <button
              className="btn small"
              disabled={!canAdd}
              title={
                have.length >= MAX_INDEXES
                  ? `At most ${MAX_INDEXES} indexes`
                  : "Order matters: an index on (a, b) helps filter by a, or by a and b, and keeps b in order within a"
              }
              onClick={() => {
                setCfg(nodeId, "indexes", [...have, draft]);
                setCols(["", "", ""]);
              }}
            >
              Add index
            </button>
          </div>
          <small className="muted">Order matters. Each index costs a little on every write and some storage.</small>

          {shards > 1 && (
            <>
              <label className="dm-label">Shard key</label>
              {dm.tables.map((x) => (
                <div className="row" key={x.id}>
                  <label htmlFor={`sk-${x.id}`}>{x.label}</label>
                  <select
                    id={`sk-${x.id}`}
                    value={keys.find((k) => k.startsWith(x.id + ":"))?.split(":")[1] ?? ""}
                    onChange={(e) => setKey(x.id, e.target.value)}
                  >
                    <option value="">Spread arbitrarily</option>
                    {x.columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.label ?? c.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <small className="muted">
                The key decides which shard holds a row. A query that filters by it asks one shard; any other asks all of them.
              </small>
            </>
          )}

          <div className="col">
            <label htmlFor="dm-paging">Paging through long lists</label>
            <select
              id="dm-paging"
              value={String(cfg.pagination ?? OFFSET_PAGING)}
              onChange={(e) => setCfg(nodeId, "pagination", e.target.value)}
            >
              <option>{OFFSET_PAGING}</option>
              <option>{KEYSET_PAGING}</option>
            </select>
          </div>
          <div className="row">
            <label htmlFor="dm-den">Store joined data together</label>
            <button
              id="dm-den"
              role="switch"
              aria-checked={!!cfg.denormalize}
              className={"switch" + (cfg.denormalize ? " on" : "")}
              onClick={() => setCfg(nodeId, "denormalize", !cfg.denormalize)}
            />
          </div>
          {cfg.denormalize && (
            <small className="muted">Reads that joined other tables get faster; every write must now update each copy.</small>
          )}

          <button className="link dm-check" aria-expanded={checking} onClick={() => setChecking(!checking)}>
            {checking ? "Hide how each query runs" : "Check how each query runs"}
          </button>
          {checking && <QueryPlans nodeId={nodeId} />}
        </>
      )}
    </div>
  );
}

/** How each query of the problem runs on one database block. Kept out of the setup view so it does not hand over the answer; the Simulate tab shows it too. */
export function QueryPlans({ nodeId }: { nodeId: string }) {
  const problem = useProblem();
  const node = useStore((s) => s.nodes.find((n) => n.id === nodeId));
  const cfg = node?.data.cfg ?? {};
  const plan = useMemo(() => (problem ? planQueries(problem, cfg, problem.capabilities ?? []) : null), [problem, cfg]);
  if (!problem?.dataModel || !plan) return null;
  return (
    <div className="dm-results">
      <ul className="dm-plans">
        {plan.queries.map((q) => (
          <li key={q.id} className={"dm-" + verdict(q)}>
            <div className="dm-q">
              <b>{q.label}</b>
              <span className="dm-tag">{verdict(q) === "ok" ? "good" : verdict(q) === "warn" ? "slow" : "very slow"}</span>
            </div>
            <div className="dm-plan">{q.plan}.</div>
            <small>
              {q.factor <= 1.05
                ? "As cheap as it can be."
                : `About ${q.factor >= 10 ? fmt(q.factor) : q.factor.toFixed(1)} times the work it needs${q.extraMs >= 1 ? `, adding ${fmt(q.extraMs)} ms` : ""}.`}
              {q.why.length > 0 && ` ${q.why[0][0].toUpperCase()}${q.why[0].slice(1)}.`}
            </small>
          </li>
        ))}
      </ul>
      {plan.skew < 0.95 && (
        <small className="muted">The shard key leaves about {Math.round(plan.skew * 100)}% of the shards' combined capacity usable.</small>
      )}
      {plan.indexCost > 0 && <small className="muted">The indexes add about ${fmt(plan.indexCost)} a month.</small>}
    </div>
  );
}
