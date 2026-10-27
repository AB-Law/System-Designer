import { useEffect, useState } from "react";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { toast } from "../../../ui/Toast";
import { cvApi } from "../api";
import { go } from "../route";
import { errText } from "../store";
import type { Rewrite } from "../types";

function Suggestion({ r, onChange }: { r: Rewrite; onChange: (r: Rewrite) => void }) {
  const [text, setText] = useState(r.proposed);
  const [editing, setEditing] = useState(false);
  const locked = r.status === "applied";

  const set = async (body: { status?: Rewrite["status"]; proposed?: string }) => {
    try {
      onChange(await cvApi.patchRewrite(r.id, body));
    } catch (e) {
      toast(errText(e), "bad");
    }
  };

  return (
    <div className={"cv-proposal " + r.status}>
      <p className="cv-proposal-why">{r.reason || "Clearer wording for a gap in this job."}</p>
      <small>Your CV says</small>
      <p className="cv-old">{r.original}</p>
      <small>Suggested wording</small>
      {editing ? (
        <textarea rows={3} value={text} maxLength={800} onChange={(e) => setText(e.target.value)} aria-label="Edit the suggested wording" />
      ) : (
        <p className="cv-new">{r.proposed}</p>
      )}
      <p className="cv-hint">This is a suggestion. Only keep it if it is true and you can talk about it in an interview.</p>
      <div className="cv-row">
        {locked ? (
          <Badge tone="good">Applied to a new CV version</Badge>
        ) : editing ? (
          <>
            <Button
              size="small"
              variant="primary"
              disabled={!text.trim()}
              onClick={() => {
                void set({ proposed: text.trim() }).then(() => setEditing(false));
              }}
            >
              Save wording
            </Button>
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                setText(r.proposed);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="small"
              variant={r.status === "approved" ? "success" : "default"}
              aria-pressed={r.status === "approved"}
              onClick={() => void set({ status: r.status === "approved" ? "pending" : "approved" })}
            >
              {r.status === "approved" ? "Approved" : "Approve"}
            </Button>
            <Button
              size="small"
              variant={r.status === "rejected" ? "danger" : "default"}
              aria-pressed={r.status === "rejected"}
              onClick={() => void set({ status: r.status === "rejected" ? "pending" : "rejected" })}
            >
              {r.status === "rejected" ? "Rejected" : "Reject"}
            </Button>
            <Button size="small" variant="ghost" onClick={() => setEditing(true)}>
              Edit wording
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function Rewrites({ runId }: { runId: number }) {
  const [items, setItems] = useState<Rewrite[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    cvApi
      .run(runId)
      .then((r) => !dead && setItems(r.rewrites))
      .catch((e) => !dead && setError(errText(e)));
    return () => {
      dead = true;
    };
  }, [runId]);

  const generate = async () => {
    setBusy(true);
    try {
      setItems(await cvApi.makeRewrites(runId));
    } catch (e) {
      toast(errText(e), "bad");
    } finally {
      setBusy(false);
    }
  };

  const rescore = async () => {
    setBusy(true);
    try {
      const r = await cvApi.rescore(runId);
      toast("A new CV version was made. Your original is kept.", "good");
      go({ name: "result", runId: r.id });
    } catch (e) {
      toast(errText(e), "bad");
      setBusy(false);
    }
  };

  if (error) return <EmptyState title="Could not open these suggestions">{error}</EmptyState>;
  if (!items) return <EmptyState title="Loading" />;
  const approved = items.filter((i) => i.status === "approved").length;

  return (
    <div className="cv-stack">
      <Card
        title="Suggested CV rewrites"
        actions={
          <Button size="small" onClick={() => go({ name: "result", runId })}>
            Back to the score
          </Button>
        }
      >
        <p className="cv-hint">
          Each suggestion rewords one bullet to answer one gap. Approve the ones you like, then re-score to see the effect. Approving never
          changes your original CV: it makes a new version.
        </p>
        <div className="cv-row">
          <Button variant="primary" onClick={() => void generate()} disabled={busy}>
            {busy ? "Thinking…" : items.some((i) => i.status === "pending") || items.length === 0 ? "Suggest rewrites" : "Suggest again"}
          </Button>
          <Button onClick={() => void rescore()} disabled={busy || approved === 0}>
            {approved ? `Re-score with ${approved} approved edit${approved === 1 ? "" : "s"}` : "Approve a suggestion to re-score"}
          </Button>
        </div>
      </Card>
      {items.length === 0 && (
        <EmptyState title="No suggestions yet">
          Ask for suggestions. If no bullet can honestly be reworded for a gap, you will get none for it.
        </EmptyState>
      )}
      {items.map((r) => (
        <Suggestion key={`${r.id}-${r.proposed}`} r={r} onChange={(n) => setItems(items.map((x) => (x.id === n.id ? n : x)))} />
      ))}
    </div>
  );
}
