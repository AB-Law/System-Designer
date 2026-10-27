import { useCallback, useEffect, useState } from "react";
import { attempt } from "../../../shared/async";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { interviewApi } from "../api";
import { dateLabel, groupByRole, scoreTone, styleSummary, type RoleGroup } from "../format";
import { go } from "../route";
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
      <b className={"iv-score " + scoreTone(s.score)}>{s.score === null ? "–" : s.score}</b>
      <Button size="small" variant="ghost" aria-label={`Delete the interview from ${dateLabel(s.created)}`} onClick={() => onDelete(s.id)}>
        Delete
      </Button>
    </li>
  );
}

function RoleCard({
  group,
  onDelete,
  onDeleteRole,
}: {
  group: RoleGroup;
  onDelete: (id: number) => void;
  onDeleteRole: (g: RoleGroup) => void;
}) {
  return (
    <Card
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
    );
  }
  return (
    <div className="iv-stack">
      {groupByRole(sessions).map((g) => (
        <RoleCard key={g.roleId} group={g} onDelete={(id) => void removeSession(id)} onDeleteRole={(role) => void removeRole(role)} />
      ))}
    </div>
  );
}
