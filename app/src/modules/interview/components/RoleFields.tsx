import { attempt } from "../../../shared/async";
import { FileDrop } from "../../../ui/FileDrop";
import { interviewApi } from "../api";
import { LEVELS } from "../format";
import type { RoleDraft } from "../draft";
import type { RoleSummary, ScoreRunOption } from "../types";

interface Props {
  draft: RoleDraft;
  roles: RoleSummary[];
  runs: ScoreRunOption[];
  onChange: (next: RoleDraft) => void;
}

export function RoleFields({ draft, roles, runs, onChange }: Props) {
  const set = (patch: Partial<RoleDraft>) => onChange({ ...draft, ...patch });
  return (
    <div className="iv-stack">
      <label className="iv-field">
        <span>Role</span>
        <select value={draft.roleId} onChange={(e) => set({ roleId: e.target.value === "new" ? "new" : Number(e.target.value) })}>
          <option value="new">A new role</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
              {r.company ? ` at ${r.company}` : ""}
            </option>
          ))}
        </select>
      </label>
      {draft.roleId === "new" && (
        <>
          {runs.length > 0 && (
            <label className="iv-field">
              <span>Start from a CV score (optional)</span>
              <select value={draft.scoreRunId ?? ""} onChange={(e) => set({ scoreRunId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">No, I will describe the role</option>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.jdTitle || `Score ${r.id}`}
                    {r.cvName ? ` (${r.cvName})` : ""}
                  </option>
                ))}
              </select>
              <small>Carries over the job description it was scored against.</small>
            </label>
          )}
          <div className="iv-grid">
            <label className="iv-field">
              <span>Title</span>
              <input value={draft.title} maxLength={120} placeholder="Backend Engineer" onChange={(e) => set({ title: e.target.value })} />
            </label>
            <label className="iv-field">
              <span>Level</span>
              <select value={draft.level} onChange={(e) => set({ level: e.target.value })}>
                {LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="iv-field">
              <span>Company (optional)</span>
              <input value={draft.company} maxLength={120} placeholder="Acme" onChange={(e) => set({ company: e.target.value })} />
            </label>
          </div>
          {draft.scoreRunId === null && (
            <label className="iv-field">
              <span>Job description (optional)</span>
              <textarea
                rows={7}
                value={draft.jdText}
                maxLength={60000}
                placeholder="Paste it to get questions about what the job asks for."
                onChange={(e) => set({ jdText: e.target.value })}
              />
              <small>Without one, questions come from the title, level and your CV.</small>
            </label>
          )}
          {draft.scoreRunId === null && (
            <FileDrop
              onFile={(f) => void attempt(() => interviewApi.uploadJd(f)).then((r) => r && set({ jdText: r.text }))}
              accept={[".pdf", ".docx", ".txt", ".md"]}
              maxBytes={5 * 1024 * 1024}
              label="…or drop a job description file"
            />
          )}
        </>
      )}
    </div>
  );
}
