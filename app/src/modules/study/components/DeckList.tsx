import { useCallback, useEffect, useState } from "react";
import { attempt, useAction } from "../../../shared/async";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { studyApi } from "../api";
import { go } from "../route";
import type { Deck, StudyStats } from "../types";
import { StudyHero } from "./StudyHero";

type Mode = "blank" | "topic" | "glossary" | "lesson" | "jd" | "interview_weakness" | "document";

const SOURCES: { id: Mode; label: string; hint: string }[] = [
  { id: "blank", label: "Blank", hint: "Add cards yourself" },
  { id: "topic", label: "From a topic", hint: "AI writes the cards" },
  { id: "glossary", label: "Design glossary", hint: "No AI call" },
  { id: "lesson", label: "Design lesson", hint: "Cards from one lesson" },
  { id: "jd", label: "Job description", hint: "Paste a posting" },
  { id: "interview_weakness", label: "Interview gaps", hint: "From your feedback" },
  { id: "document", label: "Interview id", hint: "One past interview" },
];

const SOURCE_LABEL: Record<string, string> = {
  manual: "Hand-made",
  topic: "From a topic",
  glossary: "Glossary",
  lesson: "Design lesson",
  jd: "Job description",
  interview_weakness: "Interview gaps",
  document: "Interview",
};

/** A ring that fills as more of the deck's cards settle into long intervals. */
function Mastery({ mastered, total }: { mastered: number; total: number }) {
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  return (
    <div
      className="st-ring"
      role="img"
      aria-label={`${mastered} of ${total} cards learned`}
      style={{ "--st-fill": pct } as React.CSSProperties}
    >
      <b>{pct}%</b>
      <span>learned</span>
    </div>
  );
}

function DeckTile({ deck, onDelete }: { deck: Deck; onDelete: (id: number) => void }) {
  const ready = deck.status === "ready";
  const total = deck.cardCount ?? 0;
  return (
    <li className={"st-tile" + (deck.dueCount > 0 && ready ? " has-due" : "")}>
      <div className="st-tile-head">
        <button type="button" className="st-tile-name" onClick={() => go({ name: "deck", deckId: deck.id })}>
          {deck.name}
        </button>
        <span className="st-muted">
          {SOURCE_LABEL[deck.sourceKind] ?? deck.sourceKind}
          {deck.parentId != null ? " · nested" : ""}
        </span>
      </div>
      {ready ? (
        <div className="st-tile-body">
          <Mastery mastered={deck.masteredCount ?? 0} total={total} />
          <div className="st-tile-due">
            <b>{deck.dueCount}</b>
            <span>due · {total} cards</span>
          </div>
        </div>
      ) : (
        <p className={"st-tile-status " + deck.status}>
          {deck.status === "generating" ? "Writing cards…" : deck.status === "review" ? "Drafts waiting for you" : "Generation failed"}
        </p>
      )}
      <div className="st-row">
        {ready ? (
          <Button size="small" variant="primary" disabled={!deck.dueCount} onClick={() => go({ name: "review", deckId: deck.id })}>
            {deck.dueCount ? `Review ${deck.dueCount}` : "All caught up"}
          </Button>
        ) : (
          <Button size="small" variant="primary" onClick={() => go({ name: "deck", deckId: deck.id })}>
            Open
          </Button>
        )}
        <Button size="small" variant="ghost" aria-label={`Delete ${deck.name}`} onClick={() => onDelete(deck.id)}>
          Delete
        </Button>
      </div>
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
      {stats && <StudyHero stats={stats} />}

      {!decks.length ? (
        <EmptyState title="No decks yet">
          Create a blank deck, generate from a topic, or pull cards from Design lessons and the glossary.
        </EmptyState>
      ) : (
        <ul className="st-shelf">
          {decks.map((d) => (
            <DeckTile key={d.id} deck={d} onDelete={(id) => void remove(id)} />
          ))}
        </ul>
      )}

      <details className="st-new" open={!decks.length}>
        <summary>New deck</summary>
        <Card
          title="New deck"
          actions={
            <Button variant="primary" disabled={busy || !canSubmit} onClick={() => void create()}>
              {mode === "blank" ? "Create" : "Generate"}
            </Button>
          }
        >
          <div className="st-stack">
            <fieldset className="st-sources">
              <legend className="st-muted">Where should the cards come from?</legend>
              {SOURCES.map((s) => (
                <label key={s.id} className={"st-source" + (mode === s.id ? " on" : "")}>
                  <input type="radio" name="st-source" checked={mode === s.id} onChange={() => setMode(s.id)} />
                  <b>{s.label}</b>
                  <span>{s.hint}</span>
                </label>
              ))}
            </fieldset>
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
            {mode === "interview_weakness" && (
              <p className="st-hint">Builds cards from topics marked as weaknesses in Interview feedback.</p>
            )}
            {mode === "document" && (
              <label className="st-field">
                <span className="st-muted">Interview document id</span>
                <input value={docId} onChange={(e) => setDocId(e.target.value)} placeholder="e.g. 3" inputMode="numeric" />
              </label>
            )}
          </div>
        </Card>
      </details>
    </div>
  );
}
