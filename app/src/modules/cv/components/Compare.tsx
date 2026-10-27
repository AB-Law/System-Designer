import { useEffect, useState } from "react";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { ScoreRing } from "../../../ui/ScoreRing";
import { Table } from "../../../ui/Table";
import { cvApi } from "../api";
import {
  bandLabel,
  bandTone,
  comparable,
  compareComponents,
  compareRequirements,
  statusTone,
  type ComponentDelta,
  type RequirementChange,
} from "../format";
import { go } from "../route";
import { errText } from "../store";
import type { Run } from "../types";

const fmt = (n: number | null) => (n === null ? "not rated" : String(Math.round(n)));
const sign = (n: number | null) => (n === null ? "" : n > 0 ? `+${n}` : String(n));

/** Two runs side by side: totals, component changes and which requirements moved. */
export function RunComparison({ before, after }: { before: Run; after: Run }) {
  const ok = comparable(before, after);
  const comps = compareComponents(before.breakdown.components, after.breakdown.components);
  const reqs = compareRequirements(before, after);
  const diff = (after.total ?? 0) - (before.total ?? 0);
  return (
    <div className="cv-stack">
      <div className="cv-compare-head">
        {[before, after].map((r, i) => (
          <div key={r.id} className="cv-compare-side">
            <small>{i === 0 ? "Before" : "After"}</small>
            <ScoreRing value={r.total ?? 0} size={84} />
            <Badge tone={bandTone(r.band)}>{bandLabel(r.band)}</Badge>
            <small>
              {r.jdTitle || "Untitled job"} · {r.mode} · rubric {r.rubricVersion}
            </small>
          </div>
        ))}
        <div className="cv-compare-diff" aria-live="polite">
          {ok ? (
            <b className={diff > 0 ? "up" : diff < 0 ? "down" : ""}>{diff > 0 ? `+${diff}` : diff} points</b>
          ) : (
            <span className="cv-warn">These were scored with different rubric versions, so the totals are not comparable.</span>
          )}
        </div>
      </div>
      <Table<ComponentDelta>
        rowKey={(r) => r.key}
        rows={comps}
        columns={[
          { key: "label", header: "Component", render: (r) => r.label },
          { key: "b", header: "Before", align: "right", render: (r) => fmt(r.before) },
          { key: "a", header: "After", align: "right", render: (r) => fmt(r.after) },
          {
            key: "c",
            header: "Change",
            align: "right",
            render: (r) => <b className={(r.change ?? 0) > 0 ? "up" : (r.change ?? 0) < 0 ? "down" : ""}>{sign(r.change)}</b>,
          },
        ]}
      />
      <Table<RequirementChange>
        rowKey={(r) => r.text}
        empty="No requirement changed status."
        columns={[
          { key: "t", header: "Requirement", render: (r) => r.text },
          {
            key: "b",
            header: "Before",
            render: (r) =>
              r.before === "absent" ? (
                <span className="cv-hint">not in this job</span>
              ) : (
                <Badge tone={statusTone(r.before)}>{r.before}</Badge>
              ),
          },
          {
            key: "a",
            header: "After",
            render: (r) =>
              r.after === "absent" ? <span className="cv-hint">not in this job</span> : <Badge tone={statusTone(r.after)}>{r.after}</Badge>,
          },
        ]}
        rows={reqs}
      />
    </div>
  );
}

export function ComparePage({ a, b }: { a: number; b: number }) {
  const [runs, setRuns] = useState<[Run, Run] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    Promise.all([cvApi.run(a), cvApi.run(b)])
      .then((r) => !dead && setRuns(r))
      .catch((e) => !dead && setError(errText(e)));
    return () => {
      dead = true;
    };
  }, [a, b]);
  if (error) return <EmptyState title="Could not compare these scores">{error}</EmptyState>;
  if (!runs) return <EmptyState title="Loading" />;
  return (
    <Card
      title="Compare scores"
      actions={
        <Button size="small" onClick={() => go({ name: "history" })}>
          Back to history
        </Button>
      }
    >
      <RunComparison before={runs[0]} after={runs[1]} />
    </Card>
  );
}
