import { useEffect } from "react";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { StatTiles } from "../../../ui/StatTiles";
import { cvApi } from "../api";
import { qualityTone, when } from "../format";
import { downloadJson } from "../../../shared/download";
import { attempt, useAction } from "../hooks";
import { go } from "../route";
import { useCv } from "../store";
import { CvUpload } from "./CvUpload";
import "../cv-woah.css";

export function Library() {
  const cvs = useCv((s) => s.cvs);
  const error = useCv((s) => s.error);
  const load = useCv((s) => s.loadCvs);
  const { busy, run } = useAction();

  useEffect(() => {
    void load();
  }, [load]);

  const onUploaded = async (cv: { id: number }) => {
    await load();
    go({ name: "review", cvId: cv.id });
  };

  const act = async (fn: () => Promise<unknown>, done: string) => {
    if ((await attempt(fn, done)) !== undefined) await load();
  };

  const exportAll = async () => {
    const data = await attempt(() => cvApi.exportAll());
    if (data === undefined) return;
    downloadJson("my-cv-data.json", data);
  };

  return (
    <div className="cv-stack">
      {cvs && cvs.length > 0 && (
        <StatTiles
          label="Your CVs"
          tiles={[
            {
              label: "CVs",
              value: String(cvs.length),
              caption: cvs.some((c) => c.active) ? "One is active for scoring" : "None is active yet",
            },
            (() => {
              const q = cvs.find((c) => c.active)?.latest?.parseQuality;
              return {
                label: "Read quality",
                value: q === undefined ? "–" : String(q),
                unit: q === undefined ? undefined : "/ 100",
                caption: "How well the active CV was read",
                hero: true,
              };
            })(),
            { label: "Versions", value: String(cvs.reduce((n, c) => n + c.versionCount, 0)), caption: "Saved across all your CVs" },
          ]}
        />
      )}
      <CvUpload onUploaded={(cv) => void onUploaded(cv)} />

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
            <Button size="small" onClick={() => go({ name: "review", cvId: c.id })}>
              Review how it was read
            </Button>
            <Button
              variant="primary"
              size="small"
              onClick={() => go({ name: "score" })}
              disabled={!c.active}
              title={c.active ? "" : "Make it active first"}
            >
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
        <details className="cv-data">
          <summary>Your data and privacy</summary>
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
        </details>
      )}
    </div>
  );
}
