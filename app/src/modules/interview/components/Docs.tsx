import { useEffect, useState } from "react";
import { attempt, useAction, type Job } from "../../../shared/async";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { FileDrop } from "../../../ui/FileDrop";
import { interviewApi } from "../api";
import { dateLabel } from "../format";
import type { DocChunk, DocScope, DocStatus, DocSummary, RoleSummary } from "../types";
import { JobProgress } from "./JobProgress";

const ACCEPT = [".pdf", ".docx", ".txt", ".md"];
const MAX_BYTES = 5 * 1024 * 1024;

const statusTone = (s: DocStatus): "good" | "warn" | "bad" | "neutral" =>
  s === "ready" ? "good" : s === "failed" ? "bad" : s === "running" || s === "queued" ? "warn" : "neutral";

function sizeLabel(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function DocRow({ doc, roleTitle, onChange }: { doc: DocSummary; roleTitle: string | null; onChange: () => void }) {
  const [chunks, setChunks] = useState<DocChunk[] | null>(null);
  const [open, setOpen] = useState(false);
  const { busy, run } = useAction();

  const loadChunks = () =>
    run(async () => {
      const rows = await interviewApi.docChunks(doc.id);
      setChunks(rows);
      setOpen(true);
    });

  const remove = () =>
    run(async () => {
      await interviewApi.removeDoc(doc.id);
      onChange();
    }, "Document deleted.");

  const onJobDone = (_j: Job) => onChange();

  return (
    <li className="iv-doc">
      <div className="iv-doc-head">
        <div className="iv-stack" style={{ gap: 4 }}>
          <strong>{doc.name}</strong>
          <span className="iv-hint">
            {doc.scope === "global" ? "All roles" : roleTitle ? `Role: ${roleTitle}` : `Role #${doc.roleId}`}
            {" · "}
            {sizeLabel(doc.bytes)}
            {doc.status === "ready" ? ` · ${doc.chunkCount} chunks` : ""}
            {" · "}
            {dateLabel(doc.created)}
          </span>
        </div>
        <div className="iv-row">
          <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>
          {doc.status === "ready" && (
            <Button variant="ghost" disabled={busy} onClick={() => void (open ? setOpen(false) : loadChunks())}>
              {open ? "Hide chunks" : "Chunks"}
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </div>
      {(doc.status === "queued" || doc.status === "running") && doc.jobId && (
        <JobProgress key={doc.jobId} jobId={doc.jobId} label="Embedding document" onDone={onJobDone} />
      )}
      {doc.status === "failed" && doc.error && <p className="iv-warn">{doc.error}</p>}
      {open && chunks && (
        <ol className="iv-chunks">
          {chunks.map((c) => (
            <li key={c.index}>
              <span className="iv-hint">
                #{c.index + 1} · page {c.page}
              </span>
              <pre>{c.text}</pre>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export function Docs() {
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [scope, setScope] = useState<DocScope>("global");
  const [roleId, setRoleId] = useState<number | "">("");
  const { busy, run } = useAction();

  const reload = async () => {
    const [d, r] = await Promise.all([attempt(interviewApi.docs), attempt(interviewApi.roles)]);
    setDocs(d ?? []);
    setRoles(r ?? []);
  };

  useEffect(() => {
    void reload();
  }, []);

  const onFile = (f: File) =>
    void run(async () => {
      if (scope === "role" && roleId === "") throw new Error("Pick a role for a role-scoped document.");
      await interviewApi.uploadDoc(f, scope, scope === "role" ? Number(roleId) : null);
      await reload();
    }, "Document uploaded. Embedding has started.");

  const roleTitle = (id: number | null) => (id == null ? null : (roles.find((r) => r.id === id)?.title ?? null));

  if (!docs) return <p className="iv-hint">Loading…</p>;

  return (
    <div className="iv-stack">
      <Card title="Upload a reference document">
        <div className="iv-stack">
          <div className="iv-grid">
            <label className="iv-field">
              <span>Scope</span>
              <select value={scope} onChange={(e) => setScope(e.target.value as DocScope)} disabled={busy}>
                <option value="global">All interviews</option>
                <option value="role">One role only</option>
              </select>
            </label>
            {scope === "role" && (
              <label className="iv-field">
                <span>Role</span>
                <select
                  value={roleId === "" ? "" : String(roleId)}
                  onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : "")}
                  disabled={busy}
                >
                  <option value="">Pick a role…</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                      {r.company ? ` · ${r.company}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <FileDrop onFile={onFile} accept={ACCEPT} maxBytes={MAX_BYTES} label={busy ? "Uploading…" : "Drop a PDF, DOCX, TXT or MD here"} />
          <p className="iv-hint">
            Documents are private to your account. The interviewer can retrieve snippets during a practice session. Role-scoped files only
            apply when you practise that role; global files apply to every session.
          </p>
        </div>
      </Card>

      <Card title="Your documents">
        {docs.length === 0 ? (
          <EmptyState title="No documents yet">
            Upload notes, a company brief, or past write-ups you want the interviewer to draw on.
          </EmptyState>
        ) : (
          <ul className="iv-doc-list">
            {docs.map((d) => (
              <DocRow key={d.id} doc={d} roleTitle={roleTitle(d.roleId)} onChange={() => void reload()} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
