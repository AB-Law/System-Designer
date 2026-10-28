import { useCallback, useEffect, useState } from "react";
import { attempt, useAction } from "../../../shared/async";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { studyApi } from "../api";
import { go } from "../route";
import type { MapSummary } from "../types";

function mapTitle(m: MapSummary, lessons: { id: string; title: string }[]): string {
  if (m.sourceKind === "lesson") return lessons.find((L) => L.id === m.sourceRef)?.title ?? "Design lesson";
  if (m.sourceKind === "jd") return "Job description map";
  if (m.sourceKind === "score_run") return "Scored job description map";
  return m.sourceRef.slice(0, 60) || "Mind map";
}

export function MapList() {
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [lessons, setLessons] = useState<{ id: string; title: string }[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [source, setSource] = useState<"lesson" | "jd" | "score_run">("lesson");
  const [jd, setJd] = useState("");
  const [runs, setRuns] = useState<{ id: number; jdTitle: string; cvName?: string }[]>([]);
  const [runId, setRunId] = useState("");
  const { busy, run } = useAction();

  const load = useCallback(async () => {
    const [m, L, R] = await Promise.all([attempt(studyApi.maps), attempt(studyApi.lessons), attempt(studyApi.scoreRuns)]);
    if (R) {
      setRuns(R);
      setRunId((cur) => cur || String(R[0]?.id ?? ""));
    }
    if (m) setMaps(m);
    if (L) {
      setLessons(L);
      setLessonId((cur) => cur || L[0]?.id || "");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canCreate = source === "jd" ? jd.trim().length >= 40 : source === "score_run" ? !!runId : !!lessonId;

  const create = async () => {
    if (!canCreate) return;
    const body =
      source === "jd"
        ? { sourceKind: "jd" as const, sourceRef: jd.trim() }
        : source === "score_run"
          ? { sourceKind: "score_run" as const, sourceRef: runId }
          : { sourceKind: "lesson" as const, sourceRef: lessonId };
    const map = await run(() => studyApi.createMap(body), "Building map");
    if (map) {
      await load();
      go({ name: "map", mapId: map.id });
    }
  };

  if (!maps) return <p className="st-hint">Loading…</p>;

  return (
    <div className="st-stack">
      <Card
        title="New mind map"
        actions={
          <Button variant="primary" disabled={busy || !canCreate} onClick={() => void create()}>
            Generate
          </Button>
        }
      >
        <div className="st-stack">
          <label className="st-field">
            <span className="st-muted">Source</span>
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              <option value="lesson">Design lesson</option>
              <option value="jd">Pasted job description</option>
              {runs.length > 0 && <option value="score_run">Job description from a scored CV</option>}
            </select>
          </label>
          {source === "lesson" && (
            <label className="st-field">
              <span className="st-muted">Lesson</span>
              <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
                {lessons.map((L) => (
                  <option key={L.id} value={L.id}>
                    {L.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {source === "jd" && (
            <label className="st-field">
              <span className="st-muted">Job description</span>
              <textarea value={jd} onChange={(e) => setJd(e.target.value)} maxLength={60000} placeholder="Paste the job description…" />
              <span className="st-hint">The map covers what the role asks for, so you can see what to study.</span>
            </label>
          )}
          {source === "score_run" && (
            <label className="st-field">
              <span className="st-muted">Scored CV</span>
              <select value={runId} onChange={(e) => setRunId(e.target.value)}>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.jdTitle || "Job description"}
                    {r.cvName ? ` · ${r.cvName}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </Card>

      {!maps.length ? (
        <EmptyState title="No mind maps yet">Generate one from a Design lesson to explore concepts as a graph.</EmptyState>
      ) : (
        <ul className="st-decks">
          {maps.map((m) => (
            <li key={m.id} className="st-deck">
              <div>
                <button type="button" className="st-link" onClick={() => go({ name: "map", mapId: m.id })}>
                  {mapTitle(m, lessons)}
                </button>
                <div className="st-muted">v{m.version}</div>
              </div>
              <Badge tone={m.status === "ready" ? "good" : m.status === "failed" ? "bad" : "warn"}>{m.status}</Badge>
              <span />
              <Button size="small" variant="primary" onClick={() => go({ name: "map", mapId: m.id })}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
