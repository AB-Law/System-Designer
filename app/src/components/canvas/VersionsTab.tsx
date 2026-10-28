import { useState } from "react";
import { cloudOn } from "../../api";
import { useStore } from "../../store";
import type { Version } from "../../cloud/versions";

const KIND_LABEL: Record<Version["kind"], string> = { manual: "saved", auto: "auto", coach: "coach", restore: "safety copy" };

export function when(ms: number): string {
  const d = new Date(ms);
  const same = d.toDateString() === new Date().toDateString();
  return same
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function VersionsTab() {
  const versions = useStore((s) => s.versions);
  const error = useStore((s) => s.versionsError);
  const nodeCount = useStore((s) => s.nodes.length);
  const user = useStore((s) => s.user);
  const save = useStore((s) => s.saveVersion);
  const restore = useStore((s) => s.restoreVersion);
  const rename = useStore((s) => s.renameVersion);
  const del = useStore((s) => s.deleteVersion);
  const setCompareOpen = useStore((s) => s.setCompareOpen);
  const setShareOpen = useStore((s) => s.setShareOpen);
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const saveNow = async () => {
    setBusy(true);
    await save(label);
    setLabel("");
    setBusy(false);
  };

  return (
    <>
      <p className="muted">
        A version is a snapshot of your canvas only (blocks, settings and connections), not a score. One is kept for you each time you
        preview a score, submit, take the coach's change or restore, so you can always go back. Scores live in Submissions.{" "}
        {cloudOn()
          ? `They are stored in ${user?.username ?? "your"}'s account.`
          : "They are stored in this browser. Sign in to keep them across devices."}
      </p>
      <div className="ver-save">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Name this version (optional)"
          maxLength={80}
          aria-label="Version name"
          onKeyDown={(e) => e.key === "Enter" && nodeCount > 0 && void saveNow()}
        />
        <button className="btn primary" disabled={busy || nodeCount === 0} onClick={() => void saveNow()}>
          Save version
        </button>
      </div>
      <div className="ver-tools">
        <button
          className="btn small"
          disabled={versions.length === 0 && nodeCount === 0}
          onClick={() => setCompareOpen(true, versions[0]?.id)}
        >
          Compare
        </button>
        <button className="btn small" disabled={nodeCount === 0} onClick={() => setShareOpen(true)}>
          Share or export
        </button>
      </div>
      {error && <p className="err">{error}</p>}
      {versions.length === 0 ? (
        <div className="ver-empty">
          <b>No versions yet</b>
          <p className="muted">Build something, then press Run or Save version.</p>
        </div>
      ) : (
        <ul className="ver-list">
          {versions.map((v) => (
            <li key={v.id} className={"ver kind-" + v.kind}>
              <div className="ver-top">
                {editing === v.id ? (
                  <input
                    autoFocus
                    className="ver-edit"
                    value={draft}
                    maxLength={80}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                      void rename(v.id, draft);
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <b className="ver-label">{v.label}</b>
                )}
                {v.score != null && (
                  <span
                    className={"ver-score " + (v.score >= 80 ? "good" : v.score >= 50 ? "mid" : "bad")}
                    title={v.total ? `${v.passed} of ${v.total} scenarios passed` : undefined}
                  >
                    {v.score}
                  </span>
                )}
              </div>
              <div className="ver-meta">
                <span className="ver-kind">{KIND_LABEL[v.kind]}</span>
                <span>{when(v.created)}</span>
                <span>{v.doc.nodes.length} blocks</span>
              </div>
              <div className="ver-actions">
                <button
                  className="link"
                  onClick={() => void restore(v.id)}
                  title="Put this version on the canvas. Your current canvas is saved first."
                >
                  Restore
                </button>
                <button className="link" onClick={() => setCompareOpen(true, v.id)}>
                  Compare with now
                </button>
                <button
                  className="link"
                  onClick={() => {
                    setDraft(v.label);
                    setEditing(v.id);
                  }}
                >
                  Rename
                </button>
                <button className="link danger" onClick={() => void del(v.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
