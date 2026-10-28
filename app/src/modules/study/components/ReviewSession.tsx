import { useCallback, useEffect, useState } from "react";
import { attempt } from "../../../shared/async";
import { Button } from "../../../ui/Button";
import { EmptyState } from "../../../ui/EmptyState";
import { studyApi } from "../api";
import { go } from "../route";
import type { Card, Rating } from "../types";
import "../study-woah.css";

const RATES: { rating: Rating; label: string; key: string }[] = [
  { rating: "again", label: "Again", key: "1" },
  { rating: "hard", label: "Hard", key: "2" },
  { rating: "good", label: "Good", key: "3" },
  { rating: "easy", label: "Easy", key: "4" },
];

export function ReviewSession({ deckId }: { deckId: number | null }) {
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);

  const load = useCallback(async () => {
    const rows = await attempt(() => studyApi.due(deckId ?? undefined));
    if (rows) {
      setQueue(rows);
      setFlipped(false);
      setDone(0);
    }
  }, [deckId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = queue?.[0] ?? null;

  const rate = useCallback(
    async (rating: Rating) => {
      if (!current || !queue) return;
      const updated = await attempt(() => studyApi.review(current.id, rating));
      if (!updated) return;
      setDone((n) => n + 1);
      setFlipped(false);
      setQueue(queue.slice(1));
    },
    [current, queue],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped(true);
        return;
      }
      if (!flipped) return;
      const hit = RATES.find((r) => r.key === e.key);
      if (hit) void rate(hit.rating);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, rate]);

  if (!queue) return <p className="st-hint">Loading…</p>;

  if (!current && done > 0) {
    return (
      <div className="st-done">
        <div className="st-check" aria-hidden="true">
          ✓
        </div>
        <h3>Session complete</h3>
        <p className="st-muted">
          You reviewed {done} card{done === 1 ? "" : "s"}. See you tomorrow.
        </p>
        <Button variant="primary" onClick={() => go(deckId != null ? { name: "deck", deckId } : { name: "decks" })}>
          Back
        </Button>
      </div>
    );
  }

  if (!current) {
    return (
      <EmptyState
        title={done ? "Session complete" : "Nothing due"}
        action={
          <Button variant="primary" onClick={() => go(deckId != null ? { name: "deck", deckId } : { name: "decks" })}>
            Back
          </Button>
        }
      >
        {done ? `You reviewed ${done} card${done === 1 ? "" : "s"}.` : "Come back when cards are due, or add new ones."}
      </EmptyState>
    );
  }

  return (
    <div className="st-review">
      <div
        className="st-progress"
        role="progressbar"
        aria-label="Session progress"
        aria-valuemin={0}
        aria-valuemax={done + queue.length}
        aria-valuenow={done}
      >
        <i style={{ width: `${(done / (done + queue.length)) * 100}%` }} />
      </div>
      <p className="st-muted">
        {done + 1} of {done + queue.length}
      </p>
      <button
        key={current.id}
        type="button"
        className={"st-flip st-flip3d" + (flipped ? " is-flipped" : "")}
        onClick={() => setFlipped(true)}
        aria-label={flipped ? "Answer shown" : "Show answer"}
      >
        <span className="st-flip-in">
          <span className="st-face" aria-hidden={flipped}>
            <span className="st-flip-label">Question · space to flip</span>
            <span className="st-flip-text">{current.front}</span>
          </span>
          <span className="st-face st-back" aria-hidden={!flipped}>
            <span className="st-flip-label">Answer</span>
            <span className="st-flip-text">{current.back}</span>
          </span>
        </span>
      </button>
      {flipped ? (
        <div className="st-rates">
          {RATES.map((r) => (
            <Button key={r.rating} variant={r.rating === "good" ? "primary" : "ghost"} onClick={() => void rate(r.rating)}>
              {r.label}
              <kbd>{r.key}</kbd>
            </Button>
          ))}
        </div>
      ) : (
        <Button variant="primary" onClick={() => setFlipped(true)}>
          Show answer
        </Button>
      )}
      <Button size="small" variant="ghost" onClick={() => go(deckId != null ? { name: "deck", deckId } : { name: "decks" })}>
        End session
      </Button>
    </div>
  );
}
