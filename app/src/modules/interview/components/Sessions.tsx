import { useCallback, useEffect, useState } from "react";
import { attempt } from "../../../shared/async";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { StatTiles } from "../../../ui/StatTiles";
import { EmptyState } from "../../../ui/EmptyState";
import { interviewApi } from "../api";
import { ScoreRing } from "../../../ui/ScoreRing";
import { dateLabel, groupByRole, scoreTone, scoreTrend, styleSummary, type RoleGroup, type ScoreTrend } from "../format";
import "../interview-woah.css";
import { go } from "../route";
import { YourData } from "./YourData";
import type { SessionSummary } from "../types";

const STATUS_LABEL: Record<SessionSummary["status"], string> = {
  planning: "Preparing",
  active: "In progress",
  ended: "Finished",
  failed: "Failed",
};

function SessionRow({ s, onDelete }: { s: SessionSummary; onDelete: (id: number) => void }) {
  return (
    <li className="iv-session">
      <div>
        <button type="button" className="iv-link" onClick={() => go({ name: "session", sessionId: s.id })}>
          {dateLabel(s.created)}
        </button>
        <small>{styleSummary(s.style)}</small>
      </div>
      <Badge tone={s.status === "failed" ? "bad" : s.status === "ended" ? "good" : "neutral"}>{STATUS_LABEL[s.status]}</Badge>
      {s.score === null ? (
        <b className={"iv-score " + scoreTone(s.score)}>–</b>
      ) : (
        <ScoreRing value={s.score} size={44} label="Interview score" />
      )}
      <Button size="small" variant="ghost" aria-label={`Delete the interview from ${dateLabel(s.created)}`} onClick={() => onDelete(s.id)}>
        Delete
      </Button>
    </li>
  );
}

/** Scores over time as a small line, with the change since the first attempt in words. */
function Trend({ trend }: { trend: ScoreTrend | null }) {
  if (!trend) return null;
  const { scores, delta, best } = trend;
  const w = 160;
  const h = 36;
  const pts = scores.map((v, i) => [(i / (scores.length - 1)) * (w - 8) + 4, h - 4 - (Math.min(100, Math.max(0, v)) / 100) * (h - 8)]);
  const last = pts[pts.length - 1];
  const word =
    delta > 0
      ? `Up ${delta} since your first attempt`
      : delta < 0
        ? `Down ${-delta} since your first attempt`
        : "Level with your first attempt";
  return (
    <div className="iv-trend">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Scores over time: ${scores.join(", ")}`}>
        <polyline className="iv-trend-line" points={pts.map((p) => p.join(",")).join(" ")} pathLength={1} />
        <circle className="iv-trend-dot" cx={last[0]} cy={last[1]} r="3.5" />
      </svg>
      <div>
        <strong className={delta >= 0 ? "up" : "down"}>{word}</strong>
        <small>Best so far {best}</small>
      </div>
    </div>
  );
}

function RoleCard({
  group,
  wide,
  onDelete,
  onDeleteRole,
}: {
  group: RoleGroup;
  wide: boolean;
  onDelete: (id: number) => void;
  onDeleteRole: (g: RoleGroup) => void;
}) {
  return (
    <Card
      className={wide ? "iv-wide" : ""}
      title={group.title + (group.company ? ` at ${group.company}` : "")}
      actions={
        <>
          <Button size="small" variant="primary" onClick={() => go({ name: "new", roleId: group.roleId })}>
            Practise again
          </Button>
          <Button size="small" variant="ghost" onClick={() => onDeleteRole(group)}>
            Delete role
          </Button>
        </>
      }
    >
      <Trend trend={scoreTrend(group.sessions)} />
      <ul className="iv-sessions">
        {group.sessions.map((s) => (
          <SessionRow key={s.id} s={s} onDelete={onDelete} />
        ))}
      </ul>
    </Card>
  );
}

export function Sessions() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const load = useCallback(async () => {
    const rows = await attempt(interviewApi.sessions);
    if (rows) setSessions(rows);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const removeSession = async (id: number) => {
    if (!window.confirm("Delete this interview and its feedback?")) return;
    if ((await attempt(() => interviewApi.removeSession(id))) !== undefined) await load();
  };
  const removeRole = async (g: RoleGroup) => {
    if (!window.confirm(`Delete "${g.title}" and all ${g.sessions.length} of its interviews?`)) return;
    if ((await attempt(() => interviewApi.removeRole(g.roleId))) !== undefined) await load();
  };

  if (!sessions) return <p className="iv-hint">Loading…</p>;
  if (!sessions.length) {
    return (
      <div className="iv-stack">
        <EmptyState
          title="No practice interviews yet"
          action={
            <Button variant="primary" onClick={() => go({ name: "new", roleId: null })}>
              Start your first interview
            </Button>
          }
        >
          Pick a role, and an interviewer will ask you questions one at a time, then mark your answers.
        </EmptyState>
        <YourData onDeleted={() => void load()} />
      </div>
    );
  }
  const scored = sessions.filter((s) => s.score !== null).sort((a, b) => a.created - b.created);
  const latest = scored.length ? scored[scored.length - 1].score : null;
  const best = scored.length ? Math.max(...scored.map((s) => s.score as number)) : null;
  const roles = groupByRole(sessions);
  return (
    <div className="iv-stack">
      <StatTiles
        label="Your practice"
        tiles={[
          { label: "Interviews", value: String(sessions.length), caption: `Across ${roles.length} role${roles.length === 1 ? "" : "s"}` },
          {
            label: "Latest score",
            value: latest === null ? "–" : String(latest),
            unit: latest === null ? undefined : "/ 100",
            caption: latest === null ? "Finish an interview to see one" : "From your most recent finished round",
            hero: true,
          },
          ...(scored.length > 1 && best !== null
            ? [{ label: "Best score", value: String(best), unit: "/ 100", caption: "Across every finished round" }]
            : []),
        ]}
      />
      {roles.map((g) => (
        <RoleCard
          wide={roles.length === 1}
          key={g.roleId}
          group={g}
          onDelete={(id) => void removeSession(id)}
          onDeleteRole={(role) => void removeRole(role)}
        />
      ))}
      <YourData onDeleted={() => void load()} />
    </div>
  );
}
