import { useCallback, useEffect, useState } from "react";
import { attempt, useAction } from "../../../shared/async";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { hubApi } from "../api";
import { draftOf } from "../draft";
import { go } from "../route";
import type { Target, TargetInput } from "../types";
import { TargetForm } from "./TargetForm";

type Editing = { kind: "new" } | { kind: "edit"; target: Target } | null;

/** Every role the user is preparing for. The active one is what the Hub shows. */
export function TargetsPage() {
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const { busy, run } = useAction();

  const load = useCallback(async () => {
    const s = await attempt(hubApi.summary);
    if (s) {
      setTargets(s.targets);
      setActiveId(s.target?.id ?? null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (input: TargetInput) => {
    const saved = await run(
      () => (editing?.kind === "edit" ? hubApi.patchTarget(editing.target.id, input) : hubApi.createTarget(input)),
      "Target saved",
    );
    if (saved) {
      setEditing(null);
      await load();
    }
  };
  const edit = async (id: number) => {
    const full = await attempt(() => hubApi.target(id));
    if (full) setEditing({ kind: "edit", target: full });
  };
  const activate = async (id: number) => {
    if (await run(() => hubApi.setActive(id))) await load();
  };
  const remove = async (t: Target) => {
    if (!window.confirm(`Delete the target "${t.title}"? Your study and interview history is kept.`)) return;
    if (await run(() => hubApi.removeTarget(t.id), "Target deleted")) await load();
  };

  return (
    <div className="hub-stack">
      <div className="hub-row hub-between">
        <button type="button" className="hub-link" onClick={() => go({ name: "home" })}>
          ← Back to the Hub
        </button>
        {!editing && (
          <Button variant="primary" onClick={() => setEditing({ kind: "new" })}>
            Add a target
          </Button>
        )}
      </div>
      {editing && (
        <Card title={editing.kind === "new" ? "New target" : `Edit ${editing.target.title}`}>
          <TargetForm
            key={editing.kind === "edit" ? editing.target.id : "new"}
            initial={editing.kind === "edit" ? draftOf(editing.target) : null}
            busy={busy}
            onSave={(i) => void save(i)}
            onCancel={() => setEditing(null)}
          />
        </Card>
      )}
      {targets && targets.length === 0 && !editing && (
        <EmptyState title="No targets yet">Add the role you are preparing for. You can keep several and switch between them.</EmptyState>
      )}
      <ul className="hub-targets">
        {targets?.map((t) => (
          <li key={t.id} className={"hub-target" + (t.id === activeId ? " on" : "")}>
            <div>
              <strong>{t.title}</strong>
              <div className="hub-muted">
                {[t.level, t.company, t.date && `Interview ${t.date}`, t.hasJd ? "Job description added" : "No job description"]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {t.id === activeId ? (
              <Badge tone="gold">Showing</Badge>
            ) : (
              <Button size="small" disabled={busy} onClick={() => void activate(t.id)}>
                Show in Hub
              </Button>
            )}
            <Button size="small" variant="ghost" onClick={() => void edit(t.id)}>
              Edit
            </Button>
            <Button size="small" variant="ghost" aria-label={`Delete ${t.title}`} onClick={() => void remove(t)}>
              Delete
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
