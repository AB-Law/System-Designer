"""Deck generation: source → draft cards → review status. New kinds register in SOURCE_HANDLERS."""
from __future__ import annotations

import re
from typing import Any, Callable, Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field

from dc_platform import jobs, llm

from . import cards, content, decks, prompts, sources

DraftKind = Literal["basic", "cloze"]


class DraftCard(BaseModel):
    kind: DraftKind = "basic"
    front: str = Field(min_length=1, max_length=2000)
    back: str = Field(min_length=1, max_length=4000)


class DraftDeck(BaseModel):
    cards: list[DraftCard] = Field(default_factory=list)


# Builds a list of draft dicts {kind, front, back} from (user_id, source_ref).
SourceHandler = Callable[[int, str, jobs.JobContext | None], list[dict[str, str]]]

MIN_FRONT = 8
MIN_BACK = 2


def _topic_cards(user_id: int, ref: str, ctx: jobs.JobContext | None) -> list[dict[str, str]]:
    topic = ref.strip()
    if len(topic) < 2:
        raise HTTPException(422, "Topic is too short.")
    if ctx:
        ctx.progress(0.4, "Writing draft cards")
    system = prompts.load("topic_cards.md")
    got = llm.client_for(user_id).complete_json(
        [{"role": "system", "content": system}, {"role": "user", "content": f"<topic>\n{topic[:200]}\n</topic>"}],
        DraftDeck,
        user_id=user_id,
        module="study",
        temperature=0.4,
    )
    return [c.model_dump() for c in got.cards]


def _glossary_cards(_user_id: int, _ref: str, ctx: jobs.JobContext | None) -> list[dict[str, str]]:
    if ctx:
        ctx.progress(0.5, "Building definition cards")
    got = content.glossary_cards()
    if not got:
        raise HTTPException(404, "Glossary content is not packaged on the server.")
    return got


def _lesson_cards(_user_id: int, ref: str, ctx: jobs.JobContext | None) -> list[dict[str, str]]:
    if ctx:
        ctx.progress(0.5, "Reading the lesson")
    got = content.lesson_cards(ref.strip())
    if not got:
        raise HTTPException(422, "No usable cards from that lesson.")
    return got


def _jd_cards(user_id: int, ref: str, ctx: jobs.JobContext | None) -> list[dict[str, str]]:
    if ctx:
        ctx.progress(0.3, "Reading the job description")
    analysis = sources.analyse_jd(ref, user_id)
    if ctx:
        ctx.check()
        ctx.progress(0.7, "Building requirement cards")
    got = sources.cards_from_analysis(analysis)
    if not got:
        raise HTTPException(422, "No requirements found in that job description.")
    return got


def _score_run_cards(user_id: int, ref: str, ctx: jobs.JobContext | None) -> list[dict[str, str]]:
    if not ref.strip().isdigit():
        raise HTTPException(422, "Score run id must be a number.")
    if ctx:
        ctx.progress(0.3, "Loading the score run")
    analysis = sources.score_run(user_id, int(ref.strip()))
    got = sources.cards_from_analysis(analysis)
    if not got:
        raise HTTPException(422, "That score run has no requirements to study.")
    return got


def _weakness_cards(user_id: int, _ref: str, ctx: jobs.JobContext | None) -> list[dict[str, str]]:
    if ctx:
        ctx.progress(0.4, "Collecting interview weaknesses")
    topics = sources.interview_weakness_topics(user_id)
    if not topics:
        raise HTTPException(422, "No interview weaknesses yet. Finish a practice interview with feedback first.")
    return sources.cards_from_weaknesses(topics)


def _document_cards(user_id: int, ref: str, ctx: jobs.JobContext | None) -> list[dict[str, str]]:
    if not ref.strip().isdigit():
        raise HTTPException(422, "Document id must be a number.")
    if ctx:
        ctx.progress(0.2, "Reading the document")
    corpus, _name = sources.document_corpus(user_id, int(ref.strip()))
    if ctx:
        ctx.check()
        ctx.progress(0.5, "Writing draft cards")
    system = prompts.load("doc_cards.md")
    got = llm.client_for(user_id).complete_json(
        [{"role": "system", "content": system}, {"role": "user", "content": f"<doc>\n{corpus}\n</doc>"}],
        DraftDeck,
        user_id=user_id,
        module="study",
        temperature=0.3,
    )
    return [c.model_dump() for c in got.cards]


SOURCE_HANDLERS: dict[str, SourceHandler] = {
    "topic": _topic_cards,
    "glossary": _glossary_cards,
    "lesson": _lesson_cards,
    "jd": _jd_cards,
    "score_run": _score_run_cards,
    "interview_weakness": _weakness_cards,
    "document": _document_cards,
}


def start(user_id: int, *, name: str, source_kind: str, source_ref: str, parent_id: int | None = None) -> dict[str, Any]:
    if source_kind not in SOURCE_HANDLERS:
        raise HTTPException(422, f"Unknown source kind: {source_kind}")
    ref = source_ref.strip()
    if source_kind == "lesson":
        content.lesson_text(ref)
    elif source_kind == "topic" and len(ref) < 2:
        raise HTTPException(422, "Topic is too short.")
    elif source_kind == "glossary":
        if not content.glossary():
            raise HTTPException(404, "Glossary content is not packaged on the server.")
        ref = "all"
    elif source_kind == "jd" and len(ref) < 40:
        raise HTTPException(422, "Paste a longer job description.")
    elif source_kind == "score_run" and not ref.isdigit():
        raise HTTPException(422, "Score run id must be a number.")
    elif source_kind == "interview_weakness":
        ref = "all"
    elif source_kind == "document":
        if not ref.isdigit():
            raise HTTPException(422, "Document id must be a number.")
        sources.document_corpus(user_id, int(ref))  # validate early

    label = name.strip() or _default_name(source_kind, ref)
    deck = decks.create(user_id, label, parent_id=parent_id, source_kind=source_kind, source_ref=ref)
    job_id = jobs.enqueue(user_id, "study.generate", {"deck_id": deck["id"]})
    decks.set_status(user_id, deck["id"], "generating", job_id=job_id)
    return {**decks.get_deck(user_id, deck["id"]), "jobId": job_id}


def _default_name(kind: str, ref: str) -> str:
    if kind == "glossary":
        return "Glossary"
    if kind == "interview_weakness":
        return "Interview gaps"
    if kind == "score_run":
        return f"Score run {ref}"
    if kind == "document":
        return f"Document {ref}"
    if kind == "jd":
        return "Job description"
    if kind == "lesson":
        lessons = {x["id"]: x["title"] for x in content.list_lessons()}
        return lessons.get(ref.strip(), ref.strip())[:120] or "Lesson"
    return (ref.strip() or "Deck")[:80]


def run_job(ctx: jobs.JobContext) -> dict[str, Any]:
    uid = ctx.user_id
    deck_id = int(ctx.payload["deck_id"])
    row = decks.get_row(uid, deck_id)
    try:
        ctx.progress(0.1, "Reading the source")
        handler = SOURCE_HANDLERS.get(row["source_kind"])
        if handler is None:
            raise HTTPException(422, f"Unknown source kind: {row['source_kind']}")
        raw = handler(uid, row["source_ref"] or "", ctx)
        ctx.check()
        ctx.progress(0.85, "Filtering drafts")
        kept = filter_drafts([DraftCard.model_validate(c) for c in raw])
        if not kept:
            raise HTTPException(422, "No usable cards were produced. Try another source.")
        _replace_cards(uid, deck_id, kept)
        decks.set_status(uid, deck_id, "review", job_id=row["job_id"])
        return {"deckId": deck_id, "cards": len(kept)}
    except jobs.JobCancelled:
        decks.set_status(uid, deck_id, "failed", job_id=row["job_id"])
        raise
    except Exception as e:
        decks.set_status(uid, deck_id, "failed", job_id=row["job_id"])
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(502, str(e)) from e


def confirm(user_id: int, deck_id: int) -> dict[str, Any]:
    row = decks.get_row(user_id, deck_id)
    if row["status"] not in ("review", "ready"):
        raise HTTPException(409, "This deck is not ready to confirm.")
    decks.set_status(user_id, deck_id, "ready", job_id=None)
    return decks.get_deck(user_id, deck_id)


def filter_drafts(drafts: list[DraftCard]) -> list[DraftCard]:
    """Drop empty, tiny, or duplicate fronts (case-insensitive, whitespace-collapsed)."""
    seen: set[str] = set()
    out: list[DraftCard] = []
    for d in drafts:
        front = d.front.strip()
        back = d.back.strip()
        if len(front) < MIN_FRONT or len(back) < MIN_BACK:
            continue
        key = re.sub(r"\s+", " ", front.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(DraftCard(kind=d.kind, front=front[:2000], back=back[:4000]))
    return out


def _replace_cards(user_id: int, deck_id: int, drafts: list[DraftCard]) -> None:
    for existing in cards.list_for_deck(user_id, deck_id):
        cards.delete(user_id, existing["id"])
    for d in drafts:
        cards.create(user_id, deck_id, kind=d.kind, front=d.front, back=d.back)
