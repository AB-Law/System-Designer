import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { toast } from "../../../ui/Toast";
import { cvApi, watchJob } from "../api";
import { qualityTone, splitLines, splitSkills } from "../format";
import { go } from "../route";
import { attempt, useAction } from "../hooks";
import { errText, useCv } from "../store";
import type { CvDetail, CvStructure, Education, Project, Role } from "../types";

const SOURCE: Record<string, string> = {
  model: "Read by the AI",
  rules: "Read by simple rules (the AI has not finished or is not available)",
  edited: "Edited by you",
  rewrite: "Created from approved suggestions",
};

const emptyRole = (): Role => ({ employer: "", title: "", start: "", end: "", location: "", bullets: [] });
const emptyEdu = (): Education => ({ school: "", degree: "", start: "", end: "" });
const emptyProject = (): Project => ({ name: "", link: "", bullets: [] });

function Field({ label, value, onChange, wide }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <label className={"cv-field" + (wide ? " wide" : "")}>
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Bullets({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  // keep the raw text while typing so blank lines and trailing spaces are not eaten on every keystroke
  const [text, setText] = useState(value.join("\n"));
  return (
    <label className="cv-field wide">
      <span>{label} (one per line)</span>
      <textarea
        rows={Math.max(3, value.length + 1)}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(splitLines(e.target.value));
        }}
      />
    </label>
  );
}

function Editor({ draft, setDraft }: { draft: CvStructure; setDraft: (s: CvStructure) => void }) {
  const set = <K extends keyof CvStructure>(k: K, v: CvStructure[K]) => setDraft({ ...draft, [k]: v });
  const setRole = (i: number, patch: Partial<Role>) =>
    set(
      "experience",
      draft.experience.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    );
  const setEdu = (i: number, patch: Partial<Education>) =>
    set(
      "education",
      draft.education.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    );
  const setProj = (i: number, patch: Partial<Project>) =>
    set(
      "projects",
      draft.projects.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    );
  const [skills, setSkills] = useState(draft.skills.join(", "));

  return (
    <div className="cv-editor">
      <div className="cv-grid">
        <Field label="Name" value={draft.name} onChange={(v) => set("name", v)} />
        <Field label="Headline" value={draft.headline} onChange={(v) => set("headline", v)} />
        <Field label="Email" value={draft.email} onChange={(v) => set("email", v)} />
      </div>
      <label className="cv-field wide">
        <span>Summary</span>
        <textarea rows={3} value={draft.summary} onChange={(e) => set("summary", e.target.value)} />
      </label>
      <label className="cv-field wide">
        <span>Skills (comma separated)</span>
        <textarea
          rows={2}
          value={skills}
          onChange={(e) => {
            setSkills(e.target.value);
            set("skills", splitSkills(e.target.value));
          }}
        />
      </label>

      <h4>Experience</h4>
      {draft.experience.map((r, i) => (
        <fieldset key={i} className="cv-block">
          <div className="cv-grid">
            <Field label="Title" value={r.title} onChange={(v) => setRole(i, { title: v })} />
            <Field label="Employer" value={r.employer} onChange={(v) => setRole(i, { employer: v })} />
            <Field label="Start (YYYY-MM)" value={r.start} onChange={(v) => setRole(i, { start: v })} />
            <Field label="End (YYYY-MM or present)" value={r.end} onChange={(v) => setRole(i, { end: v })} />
          </div>
          <Bullets label="Bullets" value={r.bullets} onChange={(b) => setRole(i, { bullets: b })} />
          <Button
            size="small"
            variant="ghost"
            onClick={() =>
              set(
                "experience",
                draft.experience.filter((_, j) => j !== i),
              )
            }
          >
            Remove this role
          </Button>
        </fieldset>
      ))}
      <Button size="small" onClick={() => set("experience", [...draft.experience, emptyRole()])}>
        Add a role
      </Button>

      <h4>Education</h4>
      {draft.education.map((e, i) => (
        <fieldset key={i} className="cv-block">
          <div className="cv-grid">
            <Field label="School" value={e.school} onChange={(v) => setEdu(i, { school: v })} />
            <Field label="Degree" value={e.degree} onChange={(v) => setEdu(i, { degree: v })} />
            <Field label="Start" value={e.start} onChange={(v) => setEdu(i, { start: v })} />
            <Field label="End" value={e.end} onChange={(v) => setEdu(i, { end: v })} />
          </div>
          <Button
            size="small"
            variant="ghost"
            onClick={() =>
              set(
                "education",
                draft.education.filter((_, j) => j !== i),
              )
            }
          >
            Remove
          </Button>
        </fieldset>
      ))}
      <Button size="small" onClick={() => set("education", [...draft.education, emptyEdu()])}>
        Add education
      </Button>

      <h4>Projects</h4>
      {draft.projects.map((p, i) => (
        <fieldset key={i} className="cv-block">
          <div className="cv-grid">
            <Field label="Name" value={p.name} onChange={(v) => setProj(i, { name: v })} />
            <Field label="Link" value={p.link} onChange={(v) => setProj(i, { link: v })} />
          </div>
          <Bullets label="Bullets" value={p.bullets} onChange={(b) => setProj(i, { bullets: b })} />
          <Button
            size="small"
            variant="ghost"
            onClick={() =>
              set(
                "projects",
                draft.projects.filter((_, j) => j !== i),
              )
            }
          >
            Remove
          </Button>
        </fieldset>
      ))}
      <Button size="small" onClick={() => set("projects", [...draft.projects, emptyProject()])}>
        Add a project
      </Button>
    </div>
  );
}

export function ParseReview({ cvId }: { cvId: number }) {
  const [cv, setCv] = useState<CvDetail | null>(null);
  const [draft, setDraft] = useState<CvStructure | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useAction();
  const [reading, setReading] = useState(false);
  const loadCvs = useCv((s) => s.loadCvs);
  const tries = useRef(0);
  const [gaveUp, setGaveUp] = useState(false);

  const load = useCallback(
    async (keepDraft = false) => {
      try {
        const d = await cvApi.get(cvId);
        setCv(d);
        if (d.latest && !keepDraft) {
          setDraft(structuredClone(d.latest.structure));
          setDirty(false);
        }
        setError(null);
        return d;
      } catch (e) {
        setError(errText(e));
        return null;
      }
    },
    [cvId],
  );

  useEffect(() => {
    tries.current = 0;
    void load();
  }, [load]);

  // right after an upload the AI is still reading the CV: check back a few times until it replaces the rules reading
  const waiting = !!cv?.latest && cv.latest.structureSource === "rules" && !cv.latest.edited;
  useEffect(() => {
    if (!waiting || dirty || gaveUp) return;
    const t = setTimeout(() => {
      tries.current += 1;
      if (tries.current >= 20) setGaveUp(true);
      void load();
    }, 1500);
    return () => clearTimeout(t);
  }, [waiting, dirty, gaveUp, cv, load]);

  const save = async () => {
    if (!draft) return;
    const d = await saving.run(
      () => cvApi.saveStructure(cvId, draft),
      "Saved as a new version. Earlier scores keep the version they used.",
    );
    if (!d) return;
    setCv(d);
    setDirty(false);
    void loadCvs();
  };

  const readAgain = async () => {
    setReading(true);
    const started = await attempt(() => cvApi.reExtract(cvId));
    if (!started) return setReading(false);
    watchJob(started.jobId, (j) => {
      if (j.status !== "done" && j.status !== "failed") return;
      setReading(false);
      void load();
      if (j.status === "failed") toast("The AI could not read the CV again.", "bad");
    });
  };

  if (error && !cv) return <EmptyState title="Could not open this CV">{error}</EmptyState>;
  if (!cv?.latest || !draft) return <EmptyState title="Loading" />;
  const v = cv.latest;

  return (
    <div className="cv-stack">
      <Card
        title={cv.name}
        actions={
          <>
            <Badge tone={qualityTone(v.parseQuality)}>Read quality {v.parseQuality}</Badge>
            <Badge>{v.totalYears.toFixed(1)} years of experience</Badge>
          </>
        }
      >
        <p className="cv-hint">
          {SOURCE[v.structureSource]}. Check the structured side against your original. Wrong dates and missing bullets are the most common
          reason for a wrong score.
        </p>
        {v.warnings.map((w) => (
          <p key={w} className="cv-warn">
            {w}
          </p>
        ))}
        {waiting && !gaveUp && <p className="cv-hint">The AI is reading your CV. This page updates when it finishes.</p>}
        {waiting && gaveUp && <p className="cv-hint">The AI did not improve on the simple reading, so please check every field by hand.</p>}
        <div className="cv-row">
          <Button variant="primary" onClick={() => void save()} disabled={!dirty || saving.busy}>
            {saving.busy ? "Saving…" : "Save corrections"}
          </Button>
          {!v.edited && (
            <Button onClick={() => void readAgain()} disabled={reading || dirty}>
              {reading ? "Reading…" : "Read again with AI"}
            </Button>
          )}
          <Button onClick={() => go({ name: "score" })}>Score this CV</Button>
          <Button variant="ghost" onClick={() => go({ name: "library" })}>
            Back to library
          </Button>
        </div>
      </Card>

      <div className="cv-split">
        <Card title="Original text">
          <pre className="cv-raw" tabIndex={0}>
            {v.rawText.replace(/\f/g, "\n— page break —\n")}
          </pre>
        </Card>
        <Card title="How it was understood">
          <Editor
            key={`${v.id}-${v.structureSource}`}
            draft={draft}
            setDraft={(s) => {
              setDraft(s);
              setDirty(true);
            }}
          />
        </Card>
      </div>
    </div>
  );
}
