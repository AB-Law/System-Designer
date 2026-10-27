import { useCallback, useEffect, useState } from "react";
import { attempt, useAction } from "../../../shared/async";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { studyApi } from "../api";
import { go } from "../route";
import type { Deck, StudyStats } from "../types";

type Mode = "blank" | "topic" | "glossary" | "lesson" | "jd" | "interview_weakness" | "document";

function DeckRow({ deck, onDelete }: { deck: Deck; onDelete: (id: number) => void }) {
  const statusTone = deck.status === "failed" ? "bad" : deck.status === "review" || deck.status === "generating" ? "warn" : "neutral";
  return (
    <li className="st-deck">
      <div>
        <button type="button" className="st-link" onClick={() => go({ name: "deck", deckId: deck.id })}>
          {deck.name}
        </button>
        <div className="st-muted">
          {deck.cardCount ?? 0} cards
          {deck.parentId != null ? " · nested" : ""}
          {deck.sourceKind !== "manual" ? ` · ${deck.sourceKind}` : ""}
        </div>
      </div>
      <Badge tone={statusTone}>{deck.status === "ready" ? `${deck.dueCount} due` : deck.status}</Badge>
      <Button
        size="small"
        variant="primary"
        disabled={deck.status !== "ready" || !deck.dueCount}
        onClick={() => go({ name: "review", deckId: deck.id })}
      >
        Review
      </Button>
      <Button size="small" variant="ghost" aria-label={`Delete ${deck.name}`} onClick={() => onDelete(deck.id)}>
        Delete
      </Button>
    </li>
  );
}

export function DeckList() {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [lessons, setLessons] = useState<{ id: string; title: string }[]>([]);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [jd, setJd] = useState("");
  const [docId, setDocId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [mode, setMode] = useState<Mode>("blank");
  const { busy, run } = useAction();

  const load = useCallback(async () => {
    const [d, s, L] = await Promise.all([attempt(studyApi.decks), attempt(studyApi.stats), attempt(studyApi.lessons)]);
    if (d) setDecks(d);
    if (s) setStats(s);
    if (L) {
      setLessons(L);
      setLessonId((cur) => cur || L[0]?.id || "");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canSubmit =
    mode === "blank"
      ? Boolean(name.trim())
      : mode === "topic"
        ? topic.trim().length >= 2
        : mode === "lesson"
          ? Boolean(lessonId)
          : mode === "jd"
            ? jd.trim().length >= 40
            : mode === "document"
              ? /^\d+$/.test(docId.trim())
              : true;

  const create = async () => {
    if (!canSubmit) return;
    if (mode === "blank") {
      const deck = await run(() => studyApi.createDeck(name.trim()), "Deck created");
      if (deck) {
        setName("");
        await load();
        go({ name: "deck", deckId: deck.id });
      }
      return;
    }
    const body =
      mode === "topic"
        ? { sourceKind: "topic" as const, sourceRef: topic.trim(), name: topic.trim().slice(0, 80) }
        : mode === "glossary"
          ? { sourceKind: "glossary" as const, sourceRef: "all", name: "Glossary" }
          : mode === "lesson"
            ? { sourceKind: "lesson" as const, sourceRef: lessonId, name: lessons.find((x) => x.id === lessonId)?.title || lessonId }
            : mode === "jd"
              ? { sourceKind: "jd" as const, sourceRef: jd.trim(), name: "Job description" }
              : mode === "document"
                ? { sourceKind: "document" as const, sourceRef: docId.trim(), name: `Document ${docId.trim()}` }
                : { sourceKind: "interview_weakness" as const, sourceRef: "all", name: "Interview gaps" };

    const deck = await run(() => studyApi.generateDeck(body), "Generating cards");
    if (deck) {
      setTopic("");
      setJd("");
      await load();
      go({ name: "deck", deckId: deck.id });
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Delete this deck and all of its cards?")) return;
    if ((await attempt(() => studyApi.removeDeck(id))) !== undefined) await load();
  };

  if (!decks) return <p className="st-hint">Loading…</p>;

  return (
    <div className="st-stack">
      {stats && (
        <Card title="Overview">
          <ul className="st-stats">
            <li>
              <b>{stats.dueToday}</b>
              <span>Due today</span>
            </li>
            <li>
              <b>{stats.streak}</b>
              <span>Day streak</span>
            </li>
            <li>
              <b>{stats.retention == null ? "–" : `${Math.round(stats.retention * 100)}%`}</b>
              <span>Retention</span>
            </li>
          </ul>
        </Card>
      )}

      <Card
        title="New deck"
        actions={
          <Button variant="primary" disabled={busy || !canSubmit} onClick={() => void create()}>
            {mode === "blank" ? "Create" : "Generate"}
          </Button>
        }
      >
        <div className="st-stack">
          <label className="st-field">
            <span className="st-muted">Source</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="blank">Blank (add cards yourself)</option>
              <option value="topic">AI from a topic</option>
              <option value="glossary">Design glossary</option>
              <option value="lesson">Design lesson</option>
              <option value="jd">Pasted job description</option>
              <option value="interview_weakness">Interview weaknesses</option>
              <option value="document">Interview document id</option>
            </select>
          </label>
          {mode === "blank" && (
            <label className="st-field">
              <span className="st-muted">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Caching" maxLength={120} />
            </label>
          )}
          {mode === "topic" && (
            <label className="st-field">
              <span className="st-muted">Topic</span>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. write-through caches" maxLength={200} />
            </label>
          )}
          {mode === "lesson" && (
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
          {mode === "jd" && (
            <label className="st-field">
              <span className="st-muted">Job description</span>
              <textarea value={jd} onChange={(e) => setJd(e.target.value)} maxLength={60000} placeholder="Paste the JD…" />
            </label>
          )}
          {mode === "glossary" && <p className="st-hint">Builds definition and cloze cards from the Design glossary — no AI call.</p>}
          {mode === "interview_weakness" && <p className="st-hint">Builds cards from topics marked as weaknesses in Interview feedback.</p>}
          {mode === "document" && (
            <label className="st-field">
              <span className="st-muted">Interview document id</span>
              <input value={docId} onChange={(e) => setDocId(e.target.value)} placeholder="e.g. 3" inputMode="numeric" />
            </label>
          )}
        </div>
      </Card>

      {!decks.length ? (
        <EmptyState title="No decks yet">
          Create a blank deck, generate from a topic, or pull cards from Design lessons and the glossary.
        </EmptyState>
      ) : (
        <ul className="st-decks">
          {decks.map((d) => (
            <DeckRow key={d.id} deck={d} onDelete={(id) => void remove(id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
