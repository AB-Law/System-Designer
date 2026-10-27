import { useEffect, useState } from "react";
import { attempt } from "../../../shared/async";
import { Button } from "../../../ui/Button";
import { featureOn } from "../../../shell/registry";
import { cvApi } from "../../cv/api";
import type { RunSummary } from "../../cv/types";
import { interviewApi } from "../../interview/api";
import type { RoleSummary } from "../../interview/types";
import { EMPTY, type Draft, inputOf } from "../draft";
import type { TargetInput } from "../types";

/** Starting points: a role from Interview or a scored job from CV fill in the form and link the target to them. */
function Imports({ onPick }: { onPick: (patch: Partial<Draft>) => void }) {
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const interviewOn = featureOn("interview");
  const cvOn = featureOn("cv");

  useEffect(() => {
    if (interviewOn) void attempt(interviewApi.roles).then((r) => r && setRoles(r));
    if (cvOn) void attempt(() => cvApi.history()).then((r) => r && setRuns(r.filter((x) => x.status === "done")));
  }, [interviewOn, cvOn]);

  const fromRole = async (id: number) => {
    const r = await attempt(() => interviewApi.role(id));
    if (r) onPick({ title: r.title, level: r.level, company: r.company ?? "", jdText: r.jdText ?? "", roleId: r.id });
  };
  const fromRun = async (id: number) => {
    const r = await attempt(() => cvApi.run(id));
    if (r) onPick({ title: r.jdTitle, jdText: r.jdText, scoreRunId: r.id });
  };

  if (!roles.length && !runs.length) return null;
  return (
    <div className="hub-imports">
      {roles.length > 0 && (
        <label className="hub-field">
          <span>Start from an interview role</span>
          <select value="" onChange={(e) => e.target.value && void fromRole(Number(e.target.value))}>
            <option value="">Choose…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
                {r.company ? ` at ${r.company}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {runs.length > 0 && (
        <label className="hub-field">
          <span>Start from a scored job</span>
          <select value="" onChange={(e) => e.target.value && void fromRun(Number(e.target.value))}>
            <option value="">Choose…</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.jdTitle || `Score #${r.id}`}
                {r.total !== null ? ` · ${r.total}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export function TargetForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: Draft | null;
  busy: boolean;
  onSave: (input: TargetInput) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial ?? EMPTY);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const text = (key: "title" | "level" | "company") => ({
    value: draft[key],
    onChange: (e: { target: { value: string } }) => set({ [key]: e.target.value }),
  });

  return (
    <form
      className="hub-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.title.trim()) onSave(inputOf(draft));
      }}
    >
      <Imports onPick={set} />
      <div className="hub-form-row">
        <label className="hub-field">
          <span>Role title</span>
          <input required maxLength={120} placeholder="Senior Backend Engineer" {...text("title")} />
        </label>
        <label className="hub-field">
          <span>Level</span>
          <input maxLength={40} placeholder="Senior" {...text("level")} />
        </label>
        <label className="hub-field">
          <span>Company</span>
          <input maxLength={120} {...text("company")} />
        </label>
        <label className="hub-field">
          <span>Interview date</span>
          <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
      </div>
      <label className="hub-field">
        <span>Job description (optional). The Hub uses it to bring the topics it asks for to the top.</span>
        <textarea rows={6} maxLength={20000} value={draft.jdText} onChange={(e) => set({ jdText: e.target.value })} />
      </label>
      <div className="hub-row">
        <Button type="submit" variant="primary" disabled={busy || !draft.title.trim()}>
          Save target
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
