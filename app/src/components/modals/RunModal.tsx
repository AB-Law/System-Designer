import { useState } from "react";
import { money } from "../../blocks";
import { useReviewStale, useRun } from "../../hooks";
import { useProblem, useStore } from "../../store";
import { Confidence } from "../canvas/RightPanel";
import { ReviewView } from "../canvas/ReviewView";

export function RunModal() {
  const run = useRun();
  const stale = useReviewStale();
  const problem = useProblem();
  const close = () => useStore.getState().setRunOpen(false);
  const submit = useStore((s) => s.submit);
  const review = useStore((s) => s.review);
  const reviewing = useStore((s) => s.reviewing);
  const reviewError = useStore((s) => s.reviewError);
  const runReview = useStore((s) => s.runReview);
  const interview = useStore((s) => s.interview);
  const clearInterview = useStore((s) => s.clearInterview);
  const ai = useStore((s) => s.ai);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const [tab, setTab] = useState<"scn" | "req" | "ana">("scn");
  const [open, setOpen] = useState<string | null>(null);
  if (!run || !problem) return null;

  const passed = run.scenarios.filter((s) => s.pass).length;
  const met = run.requirements.filter((r) => r.met).length;
  const scoreClass = run.score >= 80 ? "good" : run.score >= 50 ? "mid" : "badc";

  return (
    <div className="overlay" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Run result">
        <button className="x" onClick={close} aria-label="Close">
          ×
        </button>
        <div className="m-head">
          <div>
            <small>Score</small>
            <div className={`big ${scoreClass}`}>
              {run.score}
              <span>/100</span>
            </div>
          </div>
          <div className="m-title">
            <b>Run result</b>
            <small>{problem.title}</small>
          </div>
          <div className="m-status">
            <small>Status</small>
            <b>Preview</b>
            <small>Run only, not saved</small>
          </div>
        </div>
        <div className="m-bars">
          <div>
            <small>
              {passed} of {run.scenarios.length} scenarios passed
            </small>
            <div className="seg">
              {run.scenarios.map((s) => (
                <i key={s.scenarioId} className={s.pass ? "g" : "r"} />
              ))}
            </div>
          </div>
          <div>
            <small>
              {met} of {run.requirements.length} requirements met
            </small>
            <div className="seg">
              {run.requirements.map((r) => (
                <i key={r.id} className={r.met ? "g" : r.met === null ? "y" : "r"} />
              ))}
            </div>
          </div>
        </div>
        {run.budget !== undefined && (
          <div className={"m-cost" + (run.cost > run.budget ? " over" : "")}>
            Monthly cost <b>{money(run.cost)}</b> of {money(run.budget)} budget
            {run.cost > run.budget && <span> · over budget, score capped at 60</span>}
          </div>
        )}
        <nav className="tabs sm">
          <button className={tab === "scn" ? "active" : ""} onClick={() => setTab("scn")}>
            Test scenarios <em>{run.scenarios.length}</em>
          </button>
          <button className={tab === "req" ? "active" : ""} onClick={() => setTab("req")}>
            Requirements <em>{run.requirements.length}</em>
          </button>
          <button className={tab === "ana" ? "active" : ""} onClick={() => setTab("ana")}>
            Analysis
          </button>
        </nav>
        <div className="m-body">
          {tab === "scn" && (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Test scenario</th>
                  <th>Score</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {run.scenarios.map((s) => (
                  <>
                    <tr key={s.scenarioId} onClick={() => setOpen(open === s.scenarioId ? null : s.scenarioId)} className="click">
                      <td>{s.title}</td>
                      <td>{s.score}</td>
                      <td>
                        <span className={`res ${s.pass ? "pass" : "fail"}`}>{s.pass ? "Pass" : "Fail"}</span>
                      </td>
                    </tr>
                    {open === s.scenarioId && (
                      <tr key={s.scenarioId + "d"} className="detail">
                        <td colSpan={3}>
                          Offered {Math.round(s.offered).toLocaleString()} rps · served {(s.served * 100).toFixed(1)}% · latency{" "}
                          {Math.round(s.latencyMs)} ms (target {problem.latencyTargetMs} ms)
                          {s.notes.map((n) => (
                            <div key={n}>• {n}</div>
                          ))}
                          {!s.pass && s.reasons.length > 0 && (
                            <div className="why-list">
                              <b>Why it failed</b>
                              {s.reasons.map((r) => (
                                <div key={r}>– {r}</div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
          {tab === "req" && stale && (
            <p className="err-soft">
              The design changed since the AI review, so its verdicts no longer count. Run the review again on the Analysis tab.
            </p>
          )}
          {tab === "req" &&
            run.requirements.map((r) => (
              <div className="req" key={r.id}>
                <span className={`dot ${r.met ? "g" : r.met === null ? "y" : "r"}`} />
                <div>
                  <div>
                    {r.text}{" "}
                    {r.byAi && (
                      <span className="pill ai" title="Decided by the AI review, not the simulator">
                        AI
                      </span>
                    )}
                  </div>
                  <small>{r.detail}</small>
                </div>
              </div>
            ))}
          {tab === "ana" && (
            <>
              <h4 className="h">How the overall score is made</h4>
              <div className="parts">
                <div>
                  <b>{run.scoreParts.scenarios}</b>
                  <span>Scenarios, 50%</span>
                  <small>Average of each scenario's score: requests served, latency, background work keeping up.</small>
                </div>
                <div>
                  <b>{run.scoreParts.requirements}</b>
                  <span>Requirements met, 25%</span>
                  <small>The share of this problem's requirements that are green.</small>
                </div>
                <div>
                  <b>{run.scoreParts.confidence}</b>
                  <span>Confidence, 25%</span>
                  <small>The four ratings below.</small>
                </div>
              </div>
              {run.scoreParts.capped && <p className="err-soft">{run.scoreParts.capped}</p>}
              <h4 className="h">
                Architecture confidence <b className="score">{run.confidenceTotal}</b>
                <small>/100</small>
              </h4>
              <Confidence run={run} />
              <h4 className="h">AI review</h4>
              {ai.provider === "off" ? (
                <p className="muted">
                  AI review is off.{" "}
                  <button className="link" onClick={() => setAiOpen(true)}>
                    Set up LM Studio or OpenAI
                  </button>
                </p>
              ) : (
                <button className="btn" disabled={reviewing} onClick={() => void runReview()}>
                  {reviewing ? "Reviewing… reasoning models can take a few minutes" : review ? "Re-run AI review" : "Run AI review"}
                </button>
              )}
              {reviewError && <p className="err">{reviewError}</p>}
              {review && <ReviewView review={review} />}
              {interview.length > 0 && (
                <>
                  <h4 className="h">
                    The interviewer's questions <small>run on your design as it changes, and are not part of the score</small>
                  </h4>
                  {run.interview.map((r, i) => (
                    <div className={"iv " + (r.pass ? "ok" : "bad")} key={r.scenarioId}>
                      <div className="iv-head">
                        <b>{r.title}</b>
                        <span className={`res ${r.pass ? "pass" : "fail"}`}>{r.pass ? "Pass" : "Fail"}</span>
                      </div>
                      <p className="iv-q">“{interview[i]?.interviewQuestion}”</p>
                      <small>{interview[i]?.description}</small>
                      {!r.pass &&
                        r.reasons.map((x) => (
                          <div className="iv-why" key={x}>
                            – {x}
                          </div>
                        ))}
                      {!r.pass && r.advice[0] && <div className="iv-try">Try: {r.advice[0].change}</div>}
                    </div>
                  ))}
                  <button className="link" onClick={clearInterview}>
                    Clear the interviewer's questions
                  </button>
                </>
              )}
            </>
          )}
        </div>
        <div className="m-foot">
          <button className="btn ghost" onClick={close}>
            Close
          </button>
          <button className="btn success" onClick={() => void submit()}>
            Submit this design
          </button>
        </div>
      </div>
    </div>
  );
}
