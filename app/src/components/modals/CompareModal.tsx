import { useMemo, useState } from "react";
import { money } from "../../blocks";
import { diffDocs, diffIsEmpty, docToDesign, toDoc, type DesignDoc } from "../../cloud/doc";
import { analyze } from "../../sim/analyze";
import { useProblem, useStore } from "../../store";
import type { RunResult } from "../../types";
import { when } from "../canvas/VersionsTab";

const NOW = "now";

function run(doc: DesignDoc | undefined, problem: ReturnType<typeof useProblem>): RunResult | null {
  if (!doc || !problem || doc.nodes.length === 0) return null;
  try {
    return analyze(docToDesign(doc), problem);
  } catch {
    return null;
  }
}

/** Colour a change: green when it moved the right way, red when it did not, plain when it did not move. */
function delta(a: number | undefined, b: number | undefined, higherIsBetter: boolean, fmt: (n: number) => string = (n) => String(n)) {
  if (a === undefined || b === undefined || a === b) return <span className="cmp-same">no change</span>;
  const d = b - a;
  const good = higherIsBetter ? d > 0 : d < 0;
  return <span className={good ? "cmp-up" : "cmp-down"}>{(d > 0 ? "+" : "−") + fmt(Math.abs(d))}</span>;
}

export function CompareModal() {
  const problem = useProblem();
  const versions = useStore((s) => s.versions);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const start = useStore((s) => s.compareA);
  const close = () => useStore.getState().setCompareOpen(false);
  const [a, setA] = useState<string>(start ?? versions[0]?.id ?? NOW);
  const [b, setB] = useState<string>(NOW);

  const current = useMemo(() => toDoc(nodes, edges), [nodes, edges]);
  const docOf = (id: string): DesignDoc | undefined => (id === NOW ? current : versions.find((v) => v.id === id)?.doc);
  const docA = docOf(a);
  const docB = docOf(b);
  const ra = useMemo(() => run(docA, problem), [docA, problem]);
  const rb = useMemo(() => run(docB, problem), [docB, problem]);
  const diff = useMemo(() => (docA && docB ? diffDocs(docA, docB) : undefined), [docA, docB]);

  const options = [{ id: NOW, label: "Current canvas" }, ...versions.map((v) => ({ id: v.id, label: `${v.label} · ${when(v.created)}` }))];

  const passed = (r: RunResult | null) => r?.scenarios.filter((s) => s.pass).length;
  const met = (r: RunResult | null) => r?.requirements.filter((x) => x.met === true).length;

  return (
    <div className="overlay" onClick={close}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Compare designs">
        <button className="x" onClick={close} aria-label="Close">
          ×
        </button>
        <h3 className="m-h">Compare two designs</h3>
        <div className="m-body">
          <div className="cmp-pick">
            <div className="col">
              <label htmlFor="cmp-a">Before</label>
              <select id="cmp-a" value={a} onChange={(e) => setA(e.target.value)}>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn small ghost" title="Swap" onClick={() => (setA(b), setB(a))} aria-label="Swap the two designs">
              ⇄
            </button>
            <div className="col">
              <label htmlFor="cmp-b">After</label>
              <select id="cmp-b" value={b} onChange={(e) => setB(e.target.value)}>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!ra || !rb ? (
            <p className="muted">Pick two designs that each have at least one block.</p>
          ) : (
            <>
              <table className="tbl cmp">
                <thead>
                  <tr>
                    <th>What the simulator says</th>
                    <th>Before</th>
                    <th>After</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Score</td>
                    <td>{ra.score}</td>
                    <td>{rb.score}</td>
                    <td>{delta(ra.score, rb.score, true)}</td>
                  </tr>
                  <tr>
                    <td>Scenarios passed</td>
                    <td>
                      {passed(ra)} of {ra.scenarios.length}
                    </td>
                    <td>
                      {passed(rb)} of {rb.scenarios.length}
                    </td>
                    <td>{delta(passed(ra), passed(rb), true)}</td>
                  </tr>
                  <tr>
                    <td>Requirements met</td>
                    <td>
                      {met(ra)} of {ra.requirements.length}
                    </td>
                    <td>
                      {met(rb)} of {rb.requirements.length}
                    </td>
                    <td>{delta(met(ra), met(rb), true)}</td>
                  </tr>
                  <tr>
                    <td>Confidence</td>
                    <td>{ra.confidenceTotal}</td>
                    <td>{rb.confidenceTotal}</td>
                    <td>{delta(ra.confidenceTotal, rb.confidenceTotal, true)}</td>
                  </tr>
                  <tr>
                    <td>Monthly cost{ra.budget !== undefined && ` (budget ${money(ra.budget)})`}</td>
                    <td className={ra.budget !== undefined && ra.cost > ra.budget ? "cmp-down" : ""}>{money(ra.cost)}</td>
                    <td className={rb.budget !== undefined && rb.cost > rb.budget ? "cmp-down" : ""}>{money(rb.cost)}</td>
                    <td>{delta(ra.cost, rb.cost, false, money)}</td>
                  </tr>
                </tbody>
              </table>

              <h4 className="h">Scenario by scenario</h4>
              <table className="tbl cmp">
                <tbody>
                  {ra.scenarios.map((sa, i) => {
                    const sb = rb.scenarios[i];
                    return (
                      <tr key={sa.scenarioId}>
                        <td>{sa.title}</td>
                        <td>
                          <span className={`res ${sa.pass ? "pass" : "fail"}`}>{sa.pass ? "Pass" : "Fail"}</span>{" "}
                          <small>{Math.round(sa.latencyMs)} ms</small>
                        </td>
                        <td>
                          {sb && (
                            <>
                              <span className={`res ${sb.pass ? "pass" : "fail"}`}>{sb.pass ? "Pass" : "Fail"}</span>{" "}
                              <small>{Math.round(sb.latencyMs)} ms</small>
                            </>
                          )}
                        </td>
                        <td>
                          {sb && sa.pass !== sb.pass ? (
                            <span className={sb.pass ? "cmp-up" : "cmp-down"}>{sb.pass ? "fixed" : "broke"}</span>
                          ) : (
                            <span className="cmp-same">same</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {ra.requirements.some((x, i) => x.met !== rb.requirements[i]?.met) && (
                <>
                  <h4 className="h">Requirements that changed</h4>
                  <ul className="bul">
                    {ra.requirements.map((x, i) => {
                      const y = rb.requirements[i];
                      if (!y || x.met === y.met) return null;
                      return (
                        <li key={x.id}>
                          {x.text}:{" "}
                          <b className={y.met ? "cmp-up" : "cmp-down"}>
                            {y.met ? "now met" : y.met === null ? "now needs the AI review" : "no longer met"}
                          </b>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              <h4 className="h">What changed in the design</h4>
              {!diff || diffIsEmpty(diff) ? (
                <p className="muted">The two designs are the same.</p>
              ) : (
                <div className="cmp-diff">
                  <DiffList title="Blocks added" items={diff.added} cls="cmp-up" />
                  <DiffList title="Blocks removed" items={diff.removed} cls="cmp-down" />
                  <DiffList title="Settings changed" items={diff.changed} />
                  <DiffList title="Connections added" items={diff.linksAdded} cls="cmp-up" />
                  <DiffList title="Connections removed" items={diff.linksRemoved} cls="cmp-down" />
                </div>
              )}
            </>
          )}
        </div>
        <div className="m-foot">
          <button className="btn ghost" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffList({ title, items, cls }: { title: string; items: string[]; cls?: string }) {
  if (!items.length) return null;
  return (
    <div>
      <b>{title}</b>
      <ul className="bul">
        {items.map((x) => (
          <li key={x} className={cls}>
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}
