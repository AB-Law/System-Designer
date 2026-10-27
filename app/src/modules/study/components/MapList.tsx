import { useCallback, useEffect, useState } from "react";
import { attempt, useAction } from "../../../shared/async";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { studyApi } from "../api";
import { go } from "../route";
import type { MapSummary } from "../types";

export function MapList() {
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [lessons, setLessons] = useState<{ id: string; title: string }[]>([]);
  const [lessonId, setLessonId] = useState("");
  const { busy, run } = useAction();

  const load = useCallback(async () => {
    const [m, L] = await Promise.all([attempt(studyApi.maps), attempt(studyApi.lessons)]);
    if (m) setMaps(m);
    if (L) {
      setLessons(L);
      setLessonId((cur) => cur || L[0]?.id || "");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!lessonId) return;
    const map = await run(() => studyApi.createMap({ sourceKind: "lesson", sourceRef: lessonId }), "Building map");
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
          <Button variant="primary" disabled={busy || !lessonId} onClick={() => void create()}>
            Generate
          </Button>
        }
      >
        <label className="st-field">
          <span className="st-muted">From Design lesson</span>
          <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            {lessons.map((L) => (
              <option key={L.id} value={L.id}>
                {L.title}
              </option>
            ))}
          </select>
        </label>
      </Card>

      {!maps.length ? (
        <EmptyState title="No mind maps yet">Generate one from a Design lesson to explore concepts as a graph.</EmptyState>
      ) : (
        <ul className="st-decks">
          {maps.map((m) => (
            <li key={m.id} className="st-deck">
              <div>
                <button type="button" className="st-link" onClick={() => go({ name: "map", mapId: m.id })}>
                  {m.sourceKind} · {m.sourceRef || "map"}
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
