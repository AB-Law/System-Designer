import { useCallback, useEffect, useState } from "react";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { Table } from "../../../ui/Table";
import { toast } from "../../../ui/Toast";
import { cvApi } from "../api";
import { bandLabel, bandTone, when } from "../format";
import { go } from "../route";
import { errText, useCv } from "../store";
import type { RunSummary } from "../types";

export function History() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [band, setBand] = useState("");
  const [cvId, setCvId] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const cvs = useCv((s) => s.cvs);
  const loadCvs = useCv((s) => s.loadCvs);

  const load = useCallback(async () => {
    try {
      setRuns(await cvApi.history({ band: band || undefined, cvId: cvId ? Number(cvId) : undefined }));
    } catch (e) {
      toast(errText(e), "bad");
    }
  }, [band, cvId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadCvs();
  }, [loadCvs]);

  // scores that are still running refresh themselves
  const pending = runs?.some((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [pending, load]);

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  const remove = async (id: number) => {
    if (!window.confirm("Delete this score and its suggestions?")) return;
    try {
      await cvApi.removeRun(id);
      setPicked((p) => p.filter((x) => x !== id));
      await load();
    } catch (e) {
      toast(errText(e), "bad");
    }
  };

  // compare earlier to later regardless of the order they were ticked
  const [a, b] = [...picked].sort((x, y) => x - y);

  return (
    <Card
      title="Score history"
      actions={
        <Button size="small" variant="primary" onClick={() => go({ name: "score" })}>
          New score
        </Button>
      }
    >
      <div className="cv-row cv-filters">
        <label className="cv-field">
          <span>Match</span>
          <select value={band} onChange={(e) => setBand(e.target.value)}>
            <option value="">All</option>
            <option value="strong">Strong</option>
            <option value="fair">Fair</option>
            <option value="weak">Weak</option>
          </select>
        </label>
        <label className="cv-field">
          <span>CV</span>
          <select value={cvId} onChange={(e) => setCvId(e.target.value)}>
            <option value="">All</option>
            {cvs?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={picked.length !== 2} onClick={() => go({ name: "compare", a, b })}>
          {picked.length === 2 ? "Compare the two ticked" : "Tick two scores to compare"}
        </Button>
      </div>
      {runs === null ? (
        <EmptyState title="Loading" />
      ) : runs.length === 0 ? (
        <EmptyState title="No scores yet">Scores you make are kept here so you can reopen or compare them.</EmptyState>
      ) : (
        <Table<RunSummary>
          rowKey={(r) => r.id}
          rows={runs}
          columns={[
            {
              key: "pick",
              header: "",
              render: (r) => (
                <input
                  type="checkbox"
                  aria-label={`Compare score ${r.id}`}
                  disabled={r.status !== "done"}
                  checked={picked.includes(r.id)}
                  onChange={() => toggle(r.id)}
                />
              ),
            },
            {
              key: "job",
              header: "Job",
              render: (r) => (
                <button className="link" onClick={() => go({ name: "result", runId: r.id })}>
                  {r.jdTitle || `Score ${r.id}`}
                </button>
              ),
            },
            { key: "cv", header: "CV", render: (r) => r.cvName ?? "" },
            {
              key: "score",
              header: "Score",
              align: "right",
              render: (r) =>
                r.status === "done" ? (
                  <Badge tone={bandTone(r.band)}>
                    {r.total} · {bandLabel(r.band)}
                  </Badge>
                ) : r.status === "failed" ? (
                  <Badge tone="bad">Failed</Badge>
                ) : (
                  <Badge>Working…</Badge>
                ),
            },
            { key: "mode", header: "Mode", render: (r) => `${r.mode} · v${r.rubricVersion}` },
            { key: "when", header: "When", render: (r) => when(r.created) },
            {
              key: "del",
              header: "",
              render: (r) => (
                <Button size="small" variant="ghost" onClick={() => void remove(r.id)} aria-label={`Delete score ${r.id}`}>
                  Delete
                </Button>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}
