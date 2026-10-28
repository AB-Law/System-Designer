import { useCallback, useEffect, useState } from "react";
import { attempt, useAction, type Job } from "../../../shared/async";
import { JobProgress } from "../../../shared/JobProgress";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { studyApi } from "../api";
import { go } from "../route";
import type { Card as StudyCard, CardKind, Deck, StudyStats } from "../types";

export function DeckDetail({ deckId }: { deckId: number }) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<StudyCard[] | null>(null);
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [kind, setKind] = useState<CardKind>("basic");
  const { busy, run } = useAction();

  const load = useCallback(async () => {
    const [d, c, s] = await Promise.all([
      attempt(() => studyApi.deck(deckId)),
      attempt(() => studyApi.cards(deckId)),
      attempt(() => studyApi.deckStats(deckId)),
    ]);
    if (d) setDeck(d);
    if (c) setCards(c);
    if (s) setStats(s);
  }, [deckId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!front.trim() || !back.trim()) return;
    const card = await run(() => studyApi.createCard(deckId, { kind, front, back }), "Card added");
    if (card) {
      setFront("");
      setBack("");
      await load();
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Delete this card?")) return;
    if ((await attempt(() => studyApi.removeCard(id))) !== undefined) await load();
  };

  const confirm = async () => {
    const d = await run(() => studyApi.confirmDeck(deckId), "Deck saved");
    if (d) await load();
  };

  const onJobDone = (_job: Job) => {
    void load();
  };

  if (!deck || !cards) return <p className="st-hint">Loading…</p>;

  const reviewing = deck.status === "review";
  const generating = deck.status === "generating" && deck.jobId;

  return (
    <div className="st-stack">
      <div className="st-row">
        <Button size="small" variant="ghost" onClick={() => go({ name: "decks" })}>
          ← Decks
        </Button>
        {deck.status === "ready" && (
          <Button size="small" variant="primary" disabled={!deck.dueCount} onClick={() => go({ name: "review", deckId })}>
            Review due ({deck.dueCount})
          </Button>
        )}
        {reviewing && (
          <Button size="small" variant="primary" disabled={busy || !cards.length} onClick={() => void confirm()}>
            Save deck
          </Button>
        )}
      </div>

      <Card title={deck.name}>
        {generating ? (
          <JobProgress key={deck.jobId!} jobId={deck.jobId!} label="Writing draft cards" cancellable onDone={onJobDone} />
        ) : (
          stats && (
            <ul className="st-stats">
              <li>
                <b>{stats.dueToday}</b>
                <span>Due</span>
              </li>
              <li>
                <b>{stats.streak}</b>
                <span>Streak</span>
              </li>
              <li>
                <b>{stats.retention == null ? "–" : `${Math.round(stats.retention * 100)}%`}</b>
                <span>Retention</span>
              </li>
              <li>
                <b>{cards.length}</b>
                <span>Cards</span>
              </li>
            </ul>
          )
        )}
        {reviewing && <p className="st-hint">Review the drafts below. Delete or edit, then save the deck.</p>}
        {deck.status === "failed" && <p className="st-hint">Generation failed. Delete this deck or add cards by hand.</p>}
      </Card>

      {!generating && (
        <Card
          title={reviewing ? "Edit drafts" : "Add card"}
          actions={
            <Button variant="primary" disabled={busy || !front.trim() || !back.trim()} onClick={() => void add()}>
              Add
            </Button>
          }
        >
          <div className="st-stack">
            <label className="st-field">
              <span className="st-muted">Type</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as CardKind)}>
                <option value="basic">Basic</option>
                <option value="cloze">Cloze</option>
              </select>
            </label>
            <label className="st-field">
              <span className="st-muted">Front</span>
              <textarea value={front} onChange={(e) => setFront(e.target.value)} maxLength={2000} />
            </label>
            <label className="st-field">
              <span className="st-muted">Back</span>
              <textarea value={back} onChange={(e) => setBack(e.target.value)} maxLength={4000} />
            </label>
          </div>
        </Card>
      )}

      {!cards.length ? (
        <EmptyState title={generating ? "Generating…" : "No cards yet"}>
          {generating ? "Draft cards will appear here when the job finishes." : "Add a question and answer above to start reviewing."}
        </EmptyState>
      ) : (
        <ul className="st-cards">
          {cards.map((c) => (
            <li key={c.id} className="st-card-row">
              <div className="st-row">
                <strong>{c.front}</strong>
                <Button size="small" variant="ghost" onClick={() => void remove(c.id)}>
                  Delete
                </Button>
              </div>
              <div className="st-muted">{c.back}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
