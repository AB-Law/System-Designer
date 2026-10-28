import { useEffect, useState } from "react";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { FileDrop } from "../../../ui/FileDrop";
import { toast } from "../../../ui/Toast";
import { call } from "../../../api";
import { cvApi } from "../api";
import { go } from "../route";
import { attempt, useAction } from "../hooks";
import { useCv } from "../store";
import type { Mode } from "../types";

interface Draft {
  title: string;
  text: string;
}

const MAX_JDS = 3;
const MIN_CHARS = 40;

interface TargetJd {
  title: string;
  level: string;
  company: string | null;
  jdText?: string | null;
}

/** "Staff" + "Backend Engineer" is "Staff Backend Engineer"; a title that already says its level is left alone. */
export function titleWithLevel(title: string, level: string): string {
  const t = title.trim();
  const l = level.trim();
  return l && !t.toLowerCase().includes(l.toLowerCase()) ? `${l} ${t}` : t;
}

export function ScoreForm({ targetId }: { targetId?: number }) {
  const cvs = useCv((s) => s.cvs);
  const load = useCv((s) => s.loadCvs);
  const [cvId, setCvId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("fast");
  const [jds, setJds] = useState<Draft[]>([{ title: "", text: "" }]);
  const [from, setFrom] = useState<TargetJd | null>(null);
  const { busy, run } = useAction();

  useEffect(() => {
    void load();
  }, [load]);

  // opened from the Hub: use the target's job description and level, so nothing has to be pasted twice
  useEffect(() => {
    if (targetId === undefined) return;
    void attempt(() => call<TargetJd>(`/hub/targets/${targetId}`)).then((t) => {
      if (!t) return;
      setFrom(t);
      setJds([{ title: titleWithLevel(t.title, t.level), text: t.jdText ?? "" }]);
    });
  }, [targetId]);

  const active = cvs?.find((c) => c.active);
  const chosen = cvId ?? active?.id ?? null;

  if (cvs && cvs.length === 0)
    return (
      <EmptyState
        title="Upload a CV first"
        action={
          <Button variant="primary" onClick={() => go({ name: "library" })}>
            Go to the library
          </Button>
        }
      >
        A score compares one of your CVs with a job description.
      </EmptyState>
    );

  const patch = (i: number, p: Partial<Draft>) => setJds(jds.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const ready = chosen !== null && jds.every((d) => d.text.trim().length >= MIN_CHARS);

  const fromFile = async (i: number, f: File) => {
    const r = await attempt(() => cvApi.uploadJd(f));
    if (!r) return;
    patch(i, { text: r.text, title: jds[i].title || f.name.replace(/\.[^.]+$/, "") });
    r.warnings.forEach((w) => toast(w, "neutral"));
  };

  const submit = async () => {
    if (!ready || chosen === null) return;
    const res = await run(() =>
      cvApi.score(
        jds.map((d) => ({ text: d.text.trim(), title: d.title.trim() })),
        mode,
        chosen,
      ),
    );
    if (!res) return;
    if (res.runs.length === 1) go({ name: "result", runId: res.runs[0].id });
    else {
      toast(`${res.runs.length} scores started. They appear in History as they finish.`, "good");
      go({ name: "history" });
    }
  };

  return (
    <div className="cv-stack">
      <Card title="Score a CV against a job">
        {from && (
          <p className="cv-hint">
            Filled in from your target, {from.title}
            {from.level ? ` (${from.level})` : ""}
            {from.company ? ` at ${from.company}` : ""}. The score will link to it on the Hub.
          </p>
        )}
        <div className="cv-grid">
          <label className="cv-field">
            <span>CV</span>
            <select value={chosen ?? ""} onChange={(e) => setCvId(Number(e.target.value))}>
              {cvs?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? " (active)" : ""}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="cv-field cv-modes">
            <legend>How thorough</legend>
            <label>
              <input type="radio" name="mode" checked={mode === "fast"} onChange={() => setMode("fast")} /> Fast
              <small>Rules plus one AI read of the job. Good for comparing many jobs.</small>
            </label>
            <label>
              <input type="radio" name="mode" checked={mode === "deep"} onChange={() => setMode("deep")} /> Deep
              <small>Adds an AI check of your evidence, domain fit, and a second opinion on close calls.</small>
            </label>
          </fieldset>
        </div>
      </Card>

      {jds.map((d, i) => (
        <Card
          key={i}
          title={jds.length > 1 ? `Job description ${i + 1}` : "Job description"}
          actions={d.text.trim().length >= MIN_CHARS ? <Badge tone="good">Ready</Badge> : <Badge>Needs the job text</Badge>}
        >
          <label className="cv-field wide">
            <span>Job title (optional)</span>
            <input value={d.title} onChange={(e) => patch(i, { title: e.target.value })} placeholder="Senior Backend Engineer, Acme" />
          </label>
          <label className="cv-field wide">
            <span>Paste the job description</span>
            <textarea rows={10} value={d.text} onChange={(e) => patch(i, { text: e.target.value })} />
          </label>
          <FileDrop
            onFile={(f) => void fromFile(i, f)}
            accept={[".pdf", ".docx", ".txt"]}
            maxBytes={5 * 1024 * 1024}
            label="…or drop a job description file"
          />
          {jds.length > 1 && (
            <Button size="small" variant="ghost" onClick={() => setJds(jds.filter((_, j) => j !== i))}>
              Remove this job
            </Button>
          )}
        </Card>
      ))}

      <div className="cv-row">
        <Button variant="primary" size="tall" onClick={() => void submit()} disabled={!ready || busy}>
          {busy ? "Starting…" : jds.length > 1 ? `Score ${jds.length} jobs` : "Score"}
        </Button>
        {jds.length < MAX_JDS && <Button onClick={() => setJds([...jds, { title: "", text: "" }])}>Add another job to compare</Button>}
      </div>
    </div>
  );
}
