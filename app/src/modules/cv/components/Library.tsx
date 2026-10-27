import { useEffect } from "react";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { FileDrop } from "../../../ui/FileDrop";
import { cvApi } from "../api";
import { qualityTone, when } from "../format";
import { attempt, useAction } from "../hooks";
import { go } from "../route";
import { useCv } from "../store";

const ACCEPT = [".pdf", ".docx", ".txt"];
const MAX_BYTES = 5 * 1024 * 1024;

export function Library() {
  const cvs = useCv((s) => s.cvs);
  const error = useCv((s) => s.error);
  const load = useCv((s) => s.loadCvs);
  const { busy, run } = useAction();

  useEffect(() => {
    void load();
  }, [load]);

  const onFile = async (f: File) => {
    const cv = await run(() => cvApi.upload(f), "CV uploaded. Check that it was read correctly.");
    if (!cv) return;
    await load();
    go({ name: "review", cvId: cv.id });
  };

  const act = async (fn: () => Promise<unknown>, done: string) => {
    if ((await attempt(fn, done)) !== undefined) await load();
  };

  const exportAll = async () => {
    const data = await attempt(() => cvApi.exportAll());
    if (data === undefined) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-cv-data.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cv-stack">
      <Card title="Upload a CV">
        <FileDrop
          onFile={(f) => void onFile(f)}
          accept={ACCEPT}
          maxBytes={MAX_BYTES}
          label={busy ? "Reading your CV…" : "Drop a PDF, DOCX or TXT here"}
        />
        <p className="cv-hint">
          Use a text-based file. Scanned images cannot be read. Your CV is private to your account and is sent to the AI provider you choose
          in Settings.
        </p>
      </Card>

      {error && <p className="ui-error">{error}</p>}
      {cvs && cvs.length === 0 && (
        <EmptyState title="No CVs yet">Upload one to see how it is read, then score it against a job description.</EmptyState>
      )}

      {cvs?.map((c) => (
        <Card
          key={c.id}
          title={c.name}
          actions={
            <>
              {c.active && <Badge tone="gold">Active</Badge>}
              {c.latest && <Badge tone={qualityTone(c.latest.parseQuality)}>Read quality {c.latest.parseQuality}</Badge>}
            </>
          }
        >
          <p className="cv-hint">
            Uploaded {when(c.created)} · {c.versionCount} version{c.versionCount === 1 ? "" : "s"}
            {c.latest?.edited ? " · edited by you" : ""}
          </p>
          {c.latest?.warnings.map((w) => (
            <p key={w} className="cv-warn">
              {w}
            </p>
          ))}
          <div className="cv-row">
            <Button variant="primary" size="small" onClick={() => go({ name: "review", cvId: c.id })}>
              Review how it was read
            </Button>
            <Button size="small" onClick={() => go({ name: "score" })} disabled={!c.active} title={c.active ? "" : "Make it active first"}>
              Score it
            </Button>
            {!c.active && (
              <Button size="small" onClick={() => void act(() => cvApi.activate(c.id), "Active CV changed.")}>
                Make active
              </Button>
            )}
            <Button
              size="small"
              variant="danger"
              onClick={() => {
                if (window.confirm(`Delete "${c.name}", its versions and every score made with it?`))
                  void act(() => cvApi.remove(c.id), "CV deleted.");
              }}
            >
              Delete
            </Button>
          </div>
        </Card>
      ))}

      {cvs && cvs.length > 0 && (
        <Card title="Your data">
          <p className="cv-hint">Download everything this module holds about you, or remove it all.</p>
          <div className="cv-row">
            <Button size="small" onClick={() => void exportAll()}>
              Download my data
            </Button>
            <Button
              size="small"
              variant="danger"
              onClick={() => {
                if (window.confirm("Delete every CV, score and suggestion you have saved? This cannot be undone."))
                  void act(() => cvApi.deleteAll(), "All CV data deleted.");
              }}
            >
              Delete all my CV data
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
