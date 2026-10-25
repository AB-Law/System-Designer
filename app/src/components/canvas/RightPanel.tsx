import { useState } from "react";
import { BLOCK_MAP } from "../../blocks";
import { levelOf } from "../../sim/analyze";
import { hostedCaps, hostsByCapability } from "../../sim/caps";
import { useRun } from "../../hooks";
import { toDesign, useProblem, useStore } from "../../store";
import type { Dimension, Finding, RunResult, ScenarioResult } from "../../types";
import { blockCost, money } from "../../blocks";
import { ReviewView } from "./ReviewView";
import { EstimateWorksheet } from "./EstimateWorksheet";
import { WalkthroughCard } from "./WalkthroughCard";
import { beginTour } from "../tour/TourLayer";
import { tourFor } from "../../tour/tour";
import { QueryPlans } from "./DataModelEditor";
import { REGIONS, regionId, regionLabel, type RegionId } from "../../sim/regions";
import { VersionsTab } from "./VersionsTab";
import { TOTAL_STEPS, findStep, firstNotDone, stepProgress } from "../../roadmap";
import { glosser } from "../roadmap/GlossText";

export function RightPanel() {
  const tab = useStore((s) => s.rightTab);
  const setTab = useStore((s) => s.setRightTab);
  return (
    <aside className="right">
      <nav className="tabs">
        {(["problem", "simulate", "submissions", "versions"] as const).map((t) => (
          <button key={t} data-tour={`tab-${t}`} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      <div className="scroll pad">
        {tab === "problem" ? (
          <ProblemTab />
        ) : tab === "simulate" ? (
          <SimulateTab />
        ) : tab === "versions" ? (
          <VersionsTab />
        ) : (
          <SubmissionsTab />
        )}
      </div>
    </aside>
  );
}

function ProblemTab() {
  const p = useProblem();
  if (!p) return null;
  const g = glosser();
  return (
    <>
      <RoadmapHint problemId={p.id} />
      <span className={`diff ${p.difficulty}`}>{p.difficulty}</span>
      <p className="brief">{g(p.brief)}</p>
      {p.regions && (
        <div className="where-users">
          <b>Where the users are</b>
          {p.scenarios
            .filter((s) => s.regionMix)
            .map((s) => (
              <div key={s.id}>
                {s.title}:{" "}
                {REGIONS.filter((r) => (s.regionMix?.[r.id] ?? 0) > 0)
                  .map((r) => `${r.label} ${Math.round((s.regionMix![r.id] ?? 0) * 100)}%`)
                  .join(", ")}
              </div>
            ))}
          <small>
            In every other scenario they are all in {regionLabel(regionId(p.regions.home))}. Blocks have a Region setting; a call between
            regions pays the distance (US to Europe 85 ms, US to Asia 160 ms, Europe to Asia 130 ms).
          </small>
        </div>
      )}
      {tourFor(p.id) && (
        <button className="link" onClick={() => void beginTour(p.id)}>
          Take the guided tour
        </button>
      )}
      <EstimateWorksheet key={p.id} problem={p} />
      <h4 className="h">Constraints</h4>
      <ul className="bul">
        {p.constraints.map((c) => (
          <li key={c}>{g(c)}</li>
        ))}
      </ul>
      {p.capabilities && p.capabilities.length > 0 && (
        <>
          <h4 className="h">What the system does</h4>
          <p className="muted">
            <b>How to do this:</b> click a block on the canvas, then tick the jobs below that it should run in the "What this block runs"
            box.
          </p>
          <p className="muted">
            Each job has to run on a block. There is no better answer in general. Running things together is simpler, cheaper and has no
            network hops, but they share a failure and must scale together. Running them apart lets a failure stay small and each part scale
            on its own, at the price of more services to run, more cost and extra network time on every call. The goal is to match the split
            to how badly each part could hurt the rest.
          </p>
          {p.capabilities.map((c) => (
            <div className="scn" key={c.id}>
              <b>{c.label}</b>{" "}
              <span className="pill">
                {c.mode === "background"
                  ? "background job"
                  : `${Math.round(c.share * 100)}% of requests${c.critical ? ", essential" : ", optional"}`}
              </span>
              {c.hint && <p>{c.hint}</p>}
            </div>
          ))}
        </>
      )}
      <h4 className="h">Test scenarios</h4>
      {p.scenarios.map((s, i) => (
        <div className="scn" key={s.id}>
          <b>
            {i + 1}. {s.title}
          </b>
          <p>{g(s.description)}</p>
        </div>
      ))}
      <h4 className="h">Requirements</h4>
      <ul className="bul">
        {p.requirements.map((r) => (
          <li key={r.id}>{g(r.text)}</li>
        ))}
      </ul>
    </>
  );
}

/** Compact learning-path card when the current problem is on the roadmap. */
function RoadmapHint({ problemId }: { problemId: string }) {
  const found = findStep(problemId);
  const openPrimer = useStore((s) => s.openPrimer);
  const setView = useStore((s) => s.setView);
  const startRoadmapStep = useStore((s) => s.startRoadmapStep);
  const [open, setOpen] = useState(true);
  if (!found) return null;
  const prog = stepProgress(problemId);
  const nextId = firstNotDone();
  const nextIsOther = nextId && nextId !== problemId;

  return (
    <div className={"rm-hint" + (open ? "" : " collapsed")}>
      <button type="button" className="rm-hint-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          Step {found.index} of {TOTAL_STEPS} in Stage {prog?.stageIndex ?? "—"}
        </span>
        <span className="muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="rm-hint-body">
          <p className="muted">{found.stage.title}</p>
          <div className="rm-hint-actions">
            <button type="button" className="btn small" onClick={() => openPrimer(problemId)}>
              Primer
            </button>
            {nextIsOther && (
              <button type="button" className="btn small" onClick={() => void startRoadmapStep(nextId)}>
                Next step
              </button>
            )}
            <button type="button" className="btn ghost small" onClick={() => setView("roadmap")}>
              Roadmap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const SEV_ICON: Record<Finding["severity"], string> = { bad: "✕", warn: "⚑", info: "○", ok: "✓" };

function Finds({ items }: { items: Finding[] }) {
  if (!items.length) return <p className="muted">Nothing to flag.</p>;
  return (
    <>
      {items.map((f) => (
        <div key={f.id} className={`find ${f.severity}`}>
          <div className="find-t">
            <span>{SEV_ICON[f.severity]}</span> {f.title}
          </div>
          <div className="find-m">{f.message}</div>
        </div>
      ))}
    </>
  );
}

/** The reference design for this problem, hidden until asked for. */
function Worked({ scenarioId }: { scenarioId: string }) {
  const problem = useProblem();
  const [open, setOpen] = useState(false);
  const ref = problem?.reference;
  if (!ref) return null;
  const line = problem?.scenarios.find((s) => s.id === scenarioId)?.debrief;
  return (
    <div className="worked">
      <button className="link" onClick={() => setOpen(!open)}>
        {open ? "Hide the worked alternative" : "Show a worked alternative"}
      </button>
      {open && (
        <div className="worked-body">
          {line && (
            <p className="worked-line">
              <b>In the reference design:</b> {line}
            </p>
          )}
          <p>{ref.summary}</p>
          <small>The design</small>
          <ul>
            {ref.design.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <small>What it costs you</small>
          <ul>
            {ref.tradeoffs.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Debrief({ res }: { res: ScenarioResult }) {
  if (res.pass) {
    const room = res.peak ? Math.max(0, Math.round((1 - res.peak.utilization) * 100)) : null;
    return (
      <div className="debrief ok">
        <small>Why it passes</small>
        <p>
          {res.peak
            ? `The busiest block, ${res.peak.label}, runs at ${Math.round(res.peak.utilization * 100)}% of its capacity, so it has about ${room}% headroom here. Everything was served inside the latency target and no background work is piling up.`
            : "Nothing is under strain in this scenario."}
        </p>
        {res.peak && res.peak.utilization > 0.8 && (
          <p className="muted">
            That is close to the edge. Above about 70% requests start to queue, so a slightly bigger spike would break it.
          </p>
        )}
        <Worked key={res.scenarioId} scenarioId={res.scenarioId} />
      </div>
    );
  }
  return (
    <div className="debrief bad">
      <small>Why this fails</small>
      <ul>
        {res.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {res.advice.length > 0 && (
        <>
          <small>What to try, and why it helps</small>
          {res.advice.map((a) => (
            <div className="adv" key={a.change}>
              <b>{a.change}</b>
              <p>{a.why}</p>
            </div>
          ))}
        </>
      )}
      <Worked key={res.scenarioId} scenarioId={res.scenarioId} />
    </div>
  );
}

export function Confidence({ run }: { run: RunResult }) {
  const [open, setOpen] = useState(false);
  const detailRows: [string, Dimension][] = [
    ["Scalability", "scalability"],
    ["Reliability", "reliability"],
    ["Fault isolation", "faultIsolation"],
    ["Latency", "latency"],
  ];
  const rows: [string, number][] = [
    ["Scalability", run.confidence.scalability],
    ["Reliability", run.confidence.reliability],
    ["Fault isolation", run.confidence.faultIsolation],
    ["Latency", run.confidence.latency],
  ];
  return (
    <div className="conf">
      {rows.map(([name, v]) => {
        const lvl = levelOf(v);
        return (
          <div className="conf-row" key={name}>
            <span>{name}</span>
            <span className="dots">
              {[0, 1, 2].map((i) => (
                <i key={i} className={i <= (lvl === "Weak" ? 0 : lvl === "Fair" ? 1 : 2) ? lvl.toLowerCase() : ""} />
              ))}
            </span>
            <b className={lvl.toLowerCase()}>{lvl}</b>
          </div>
        );
      })}
      <button className="link how" onClick={() => setOpen(!open)}>
        {open ? "Hide how this is scored" : "How is this scored?"}
      </button>
      {open && (
        <div className="how-list">
          {detailRows.map(([name, key]) => {
            const d = run.confidenceDetail[key];
            return (
              <div className="how-block" key={key}>
                <b>
                  {name} <span>{run.confidence[key]}</span>
                </b>
                <p>{d.how}</p>
                {d.items.map((it) => (
                  <div className={"how-item " + (it.good === null ? "" : it.good ? "yes" : "no")} key={it.label}>
                    <span>{it.good === null ? "•" : it.good ? "✓" : "✕"}</span>
                    <em>{it.label}</em>
                    <b>{it.value}</b>
                  </div>
                ))}
                {d.tip && <p className="tip">{d.tip}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WhereRuns() {
  const problem = useProblem();
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  if (!problem?.capabilities?.length) return null;
  const design = toDesign(nodes, edges);
  const hosts = hostsByCapability(hostedCaps(design, problem));
  const name = (id: string) => {
    const n = design.nodes.find((x) => x.id === id)!;
    return BLOCK_MAP[n.blockId]?.label ?? n.blockId;
  };
  return (
    <>
      <h4 className="h">Where things run</h4>
      <div className="where">
        {problem.capabilities.map((c) => {
          const ids = hosts.get(c.id) ?? [];
          return (
            <div key={c.id} className={"where-row" + (ids.length ? "" : " missing")}>
              <span>{c.label}</span>
              <b>{ids.length ? ids.map(name).join(", ") : "not run anywhere"}</b>
            </div>
          );
        })}
      </div>
      <Tradeoff />
    </>
  );
}

/** Splitting work into more blocks is a trade, so show both sides of it with this design's own numbers. */
function Tradeoff() {
  const problem = useProblem();
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  if (!problem?.capabilities?.length) return null;
  const design = toDesign(nodes, edges);
  const hosted = hostedCaps(design, problem);
  const hosts = design.nodes.filter(
    (n) => ["server", "service", "websocket"].includes(n.blockId) && (hosted.get(n.id) ?? []).some((c) => c.mode !== "background"),
  );
  if (hosts.length === 0) return null;
  const cost = hosts.reduce((a, n) => a + blockCost(n.blockId, n.cfg, problem.traffic.writeShare, problem), 0);
  return (
    <p className="muted tradeoff">
      {hosts.length === 1
        ? `One block runs every request capability (${money(cost)} a month): no network hops and one thing to run, but a failure in any part affects all of it, and it all scales together.`
        : `${hosts.length} blocks run the request capabilities (${money(cost)} a month together). A failure can stay inside one of them and each scales on its own, but every extra service is more to run, more to pay for, and about 2 ms more on each call in a chain.`}
    </p>
  );
}

/** Reads and writes are limited separately, so show both against their own limit. */
function StoreLoad({ res }: { res: ScenarioResult }) {
  const nodes = useStore((s) => s.nodes);
  const rows = nodes
    .map((n) => ({ n, r: res.nodes[n.id] }))
    .filter((x) => x.r && x.r.readCapacity !== undefined && x.r.writeCapacity !== undefined && x.r.incoming > 0);
  if (!rows.length) return null;
  const f = (x: number) => Math.round(x).toLocaleString();
  return (
    <>
      <h4 className="h">Reads and writes at your stores</h4>
      {rows.map(({ n, r }) => {
        const w = r.incomingWrites ?? 0;
        const rd = Math.max(0, r.incoming - w);
        const ru = rd / Math.max(1, r.readCapacity!);
        const wu = w / Math.max(1, r.writeCapacity!);
        const bar = (label: string, load: number, cap: number, u: number) => (
          <div className="rw-line">
            <span>{label}</span>
            <div className="rw-bar" aria-hidden>
              <i className={u > 1 ? "bad" : u > 0.7 ? "warn" : ""} style={{ width: `${Math.min(100, u * 100)}%` }} />
            </div>
            <b>
              {f(load)}
              <em>/s of {f(cap)}</em>
            </b>
          </div>
        );
        return (
          <div className="rw-row" key={n.id}>
            <b>{BLOCK_MAP[n.data.blockId]?.label}</b>
            {bar("Reads", rd, r.readCapacity!, ru)}
            {bar("Writes", w, r.writeCapacity!, wu)}
            <small>
              Reads and writes share the block, so{" "}
              {ru + wu >= 1.5 ? "together they need far more than it has." : `together they fill ${Math.round((ru + wu) * 100)}% of it.`}
            </small>
          </div>
        );
      })}
    </>
  );
}

/** Per-query verdicts for each database block; the setup view keeps these behind a button. */
function DbQueries() {
  const problem = useProblem();
  const nodes = useStore((s) => s.nodes);
  const dbs = nodes.filter((n) => n.data.blockId === "database");
  if (!problem?.dataModel || !dbs.length) return null;
  return (
    <>
      <h4 className="h">How each database query runs</h4>
      {dbs.map((n) => (
        <div key={n.id}>
          {dbs.length > 1 && <small className="muted">{BLOCK_MAP[n.data.blockId]?.label}</small>}
          <QueryPlans nodeId={n.id} />
        </div>
      ))}
    </>
  );
}

function SimulateTab() {
  const problem = useProblem();
  const run = useRun();
  const sel = useStore((s) => s.simScenario);
  const setSel = useStore((s) => s.setSimScenario);
  const interview = useStore((s) => s.interview);
  if (!problem || !run) return null;
  const scenario = problem.scenarios.find((s) => s.id === sel) ?? interview.find((s) => s.id === sel);
  const res = run.scenarios.find((s) => s.scenarioId === sel) ?? run.interview.find((s) => s.scenarioId === sel);
  const issues = run.findings.filter((f) => f.severity === "bad" || f.severity === "warn");

  return (
    <>
      <div className="chips">
        {problem.scenarios.map((s) => (
          <button key={s.id} className={sel === s.id ? "active" : ""} onClick={() => setSel(s.id)}>
            {s.title}
          </button>
        ))}
        {interview.map((s) => {
          const r = run.interview.find((x) => x.scenarioId === s.id);
          return (
            <button
              key={s.id}
              className={"ai" + (sel === s.id ? " active" : "")}
              onClick={() => setSel(s.id)}
              title="A follow-up question from the AI interviewer"
            >
              ? {s.title}
              {r && <i className={r.pass ? "ok" : "no"} />}
            </button>
          );
        })}
        <button className={sel === "issues" ? "active" : ""} onClick={() => setSel("issues")}>
          Issues to fix{issues.length ? ` (${issues.length})` : ""}
        </button>
      </div>

      {sel === "issues" ? (
        <>
          <h4 className="h">Issues to fix</h4>
          <Finds items={issues} />
        </>
      ) : (
        scenario &&
        res && (
          <>
            <div className="metrics">
              <div>
                <small>Offered</small>
                <b>{Math.round(res.offered).toLocaleString()} rps</b>
              </div>
              <div>
                <small>Served</small>
                <b className={res.served >= 0.97 ? "good" : "badc"}>{(res.served * 100).toFixed(1)}%</b>
              </div>
              <div>
                <small>Latency</small>
                <b className={res.latencyMs <= problem.latencyTargetMs ? "good" : "badc"}>
                  {Math.round(res.latencyMs)} ms <em>/ {problem.latencyTargetMs}</em>
                </b>
              </div>
              <div>
                <small>Result</small>
                <b className={res.pass ? "good" : "badc"}>
                  {scenario.fromInterviewer ? (res.pass ? "Still serves" : "Breaks") : res.pass ? "Pass" : "Fail"}
                </b>
              </div>
            </div>
            {res.notes.length > 0 && (
              <div className="notes">
                {res.notes.map((n) => (
                  <p key={n}>{n}</p>
                ))}
              </div>
            )}
            {res.latencyByRegion && (
              <div className="region-lat">
                <h4 className="h">Latency by where the users are</h4>
                {Object.entries(res.latencyByRegion).map(([r, ms]) => (
                  <div key={r} className={ms <= problem.latencyTargetMs ? "ok" : "bad"}>
                    <span>{regionLabel(r as RegionId)}</span>
                    <b>{Math.round(ms)} ms</b>
                    <em>/ {problem.latencyTargetMs}</em>
                  </div>
                ))}
              </div>
            )}
            <StoreLoad res={res} />
            <Debrief res={res} />
            <WhereRuns />
            <DbQueries />
            <h4 className="h">Live events</h4>
            <Finds items={run.findings} />
            <h4 className="h">
              What happens if… <small>interview question</small>
            </h4>
            <div className="q">
              <span>?</span>
              {scenario.interviewQuestion}
            </div>
          </>
        )
      )}
      <WalkthroughCard />
      <h4 className="h">
        Architecture confidence <b className="score">{run.confidenceTotal}</b>
        <small>/100</small>
      </h4>
      <Confidence run={run} />
    </>
  );
}

function SubmissionsTab() {
  const subs = useStore((s) => s.submissions);
  const [open, setOpen] = useState<number | null>(null);
  if (!subs.length)
    return (
      <div className="emptybox">
        <b>No submissions yet</b>
        <p>Build your design and hit Submit to record your first attempt.</p>
      </div>
    );
  return (
    <>
      {subs.map((s, i) => (
        <div className="sub" key={s.at}>
          <button onClick={() => setOpen(open === i ? null : i)}>
            <span className="sub-score">{s.score}</span>
            <span>
              <b>
                {s.passed} of {s.total} scenarios passed
              </b>
              <small>{new Date(s.at).toLocaleString()}</small>
            </span>
            {s.review && <span className="pill">AI {s.review.score}</span>}
          </button>
          {open === i && (
            <div className="sub-body">
              {s.result.scenarios.map((r) => (
                <div key={r.scenarioId} className="line">
                  <span>{r.title}</span>
                  <b className={r.pass ? "good" : "badc"}>{r.pass ? "Pass" : "Fail"}</b>
                </div>
              ))}
              {s.review && <ReviewView review={s.review} />}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
