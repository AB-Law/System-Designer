import { useEffect, useState } from "react";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { ProgressBar } from "../../../ui/ProgressBar";
import { ScoreRing } from "../../../ui/ScoreRing";
import { Table } from "../../../ui/Table";
import { cvApi, watchJob } from "../api";
import { STRENGTH, bandLabel, bandTone, cite, statusTone } from "../format";
import { go } from "../route";
import { featureOn } from "../../../shell/registry";
import { useAction } from "../hooks";
import { errText, useCv } from "../store";
import "../cv-woah.css";
import type { Component, Job, Match, Mode, Run } from "../types";
import { RunComparison } from "./Compare";

const FINAL = new Set(["done", "failed", "cancelled"]);

function Breakdown({ components }: { components: Component[] }) {
  return (
    <div className="cv-bars">
      {components.map((c) => (
        <div key={c.key} className={"cv-bar" + (c.score === null ? " off" : "")}>
          <div className="cv-bar-head">
            <b>{c.label}</b>
            <span>{c.score === null ? "not rated" : `${Math.round(c.score)} / 100`}</span>
            <small>{c.weight ? `${c.weight}% of the total` : "left out of the total"}</small>
          </div>
          <ProgressBar value={c.score ?? 0} label={c.label} />
          <small className="cv-hint">{c.detail}</small>
        </div>
      ))}
    </div>
  );
}

function Requirements({ rows }: { rows: Match[] }) {
  return (
    <Table<Match>
      rowKey={(m) => m.id}
      rows={rows}
      columns={[
        {
          key: "req",
          header: "Requirement",
          render: (m) => (
            <>
              {m.text} <Badge tone={m.kind === "must" ? "gold" : "neutral"}>{m.kind === "must" ? "must have" : "nice to have"}</Badge>
            </>
          ),
        },
        {
          key: "status",
          header: "In your CV",
          render: (m) => (
            <Badge tone={statusTone(m.status)}>{m.status === "met" ? "Met" : m.status === "partial" ? "Partly" : "Missing"}</Badge>
          ),
        },
        {
          key: "evidence",
          header: "Evidence",
          render: (m) =>
            m.evidence.length ? (
              <div className="cv-evidence">
                {m.evidence.map((e, i) => (
                  <blockquote key={i}>
                    “{e.quote}”{cite(e) && <small> {cite(e)}</small>}
                  </blockquote>
                ))}
                <small className="cv-hint">
                  {STRENGTH[m.strength]}
                  {m.reason ? ` · ${m.reason}` : ""}
                </small>
              </div>
            ) : (
              <span className="cv-hint">Nothing found</span>
            ),
        },
      ]}
    />
  );
}

export function ScoreResult({ runId }: { runId: number }) {
  const [run, setRun] = useState<Run | null>(null);
  const [prev, setPrev] = useState<Run | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy, run: act } = useAction();
  const cvs = useCv((s) => s.cvs);
  const loadCvs = useCv((s) => s.loadCvs);

  useEffect(() => {
    let dead = false;
    let stop = () => {};
    setRun(null);
    setPrev(null);
    setJob(null);
    void loadCvs();
    void (async () => {
      try {
        const r = await cvApi.run(runId);
        if (dead) return;
        setRun(r);
        if ((r.status === "queued" || r.status === "running") && r.jobId) {
          stop = watchJob(r.jobId, (j) => {
            if (dead) return;
            setJob(j);
            if (FINAL.has(j.status)) void cvApi.run(runId).then((x) => !dead && setRun(x));
          });
        }
      } catch (e) {
        if (!dead) setError(errText(e));
      }
    })();
    return () => {
      dead = true;
      stop();
    };
  }, [runId, loadCvs]);

  const before = run?.rescoredFrom ?? null;
  useEffect(() => {
    if (before === null) return;
    let dead = false;
    cvApi
      .run(before)
      .then((r) => !dead && setPrev(r))
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [before]);

  if (error)
    return (
      <EmptyState title="Could not open this score" action={<Button onClick={() => go({ name: "history" })}>Back to history</Button>}>
        {error}
      </EmptyState>
    );
  if (!run) return <EmptyState title="Loading" />;

  const scoreAgain = async (mode: Mode) => {
    const r = await act(() => cvApi.score([{ text: run.jdText, title: run.jdTitle }], mode, run.cvId));
    if (r) go({ name: "result", runId: r.runs[0].id });
  };

  if (run.status === "queued" || run.status === "running")
    return (
      <Card title={run.jdTitle || "Scoring"}>
        <ProgressBar value={(job?.progress ?? 0.02) * 100} label="Scoring progress" />
        <p className="cv-hint" role="status">
          {job?.message || "Waiting to start…"}
        </p>
      </Card>
    );

  if (run.status === "failed")
    return (
      <EmptyState
        title="This score did not finish"
        action={
          <Button variant="primary" onClick={() => void scoreAgain(run.mode)}>
            Try again
          </Button>
        }
      >
        {run.error || "Something went wrong."}
      </EmptyState>
    );

  const latest = cvs?.find((c) => c.id === run.cvId)?.latest?.id;
  const newer = latest !== undefined && latest !== run.cvVersionId;
  const must = run.evidence.filter((m) => m.kind === "must");
  const nice = run.evidence.filter((m) => m.kind === "nice");
  const a = run.analysis;

  const rescore = async () => {
    const r = await act(() => cvApi.rescore(run.id));
    if (r) go({ name: "result", runId: r.id });
  };

  return (
    <div className="cv-stack">
      <Card
        title={run.jdTitle || a.title || "Score"}
        actions={
          <>
            <Badge tone={bandTone(run.band)}>{bandLabel(run.band)}</Badge>
            <Badge>{run.mode === "deep" ? "Deep score" : "Fast score"}</Badge>
          </>
        }
      >
        <div className="cv-score-head">
          <ScoreRing value={run.total ?? 0} size={120} />
          <div>
            {run.breakdown.cap && <p className="cv-warn">{run.breakdown.cap.reason}</p>}
            {run.truncated && (
              <p className="cv-warn">
                The job description or CV was long, so the AI only read the first part. The rule-based checks used all of it.
              </p>
            )}
            {run.stages.fell_back_to_fast === true && <p className="cv-warn">The AI check did not work, so this score uses rules only.</p>}
            <p className="cv-hint">
              Scored with rubric {run.rubricVersion}
              {run.model ? ` and ${run.model}` : ""}. Scores are only comparable within the same rubric version.
            </p>
            <div className="cv-row">
              <Button variant="primary" size="small" onClick={() => go({ name: "rewrites", runId: run.id })}>
                Suggest CV rewrites
              </Button>
              {newer && (
                <Button size="small" onClick={() => void rescore()} disabled={busy}>
                  Re-score with my latest CV
                </Button>
              )}
              {run.mode === "fast" && (
                <Button size="small" onClick={() => void scoreAgain("deep")} disabled={busy}>
                  Run a deep score
                </Button>
              )}
              {featureOn("interview") ? (
                <a className="btn small" href={`#/interview/new/score/${run.id}`}>
                  Start an interview for this role
                </a>
              ) : (
                <Button size="small" disabled title="Turn on the Interview module to practise for this role">
                  Start an interview for this role
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {prev && (
        <Card title="Change since the earlier score">
          <RunComparison before={prev} after={run} />
        </Card>
      )}

      <Card title="Where the score comes from">
        <Breakdown components={run.breakdown.components} />
      </Card>

      {a.gaps.length > 0 && (
        <Card title="Biggest gaps first">
          <ol className="cv-gaps">
            {a.gaps.slice(0, 8).map((g) => (
              <li key={g.id}>
                <b>{g.text}</b> <Badge tone={statusTone(g.status)}>{g.status === "partial" ? "partly shown" : "missing"}</Badge>
                <small className="cv-hint"> up to +{g.points} points if you can show it</small>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card title="Must-have requirements">
        <Requirements rows={must} />
      </Card>
      {nice.length > 0 && (
        <Card title="Nice-to-have requirements">
          <Requirements rows={nice} />
        </Card>
      )}

      {(a.talking_points.length > 0 || a.questions_to_ask.length > 0) && (
        <div className="cv-split">
          <Card title="Be ready to talk about">
            <ul>
              {a.talking_points.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Card>
          <Card title="Questions to ask them">
            <ul>
              {a.questions_to_ask.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
