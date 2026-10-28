"""One turn of the live interview: check it is allowed, store the candidate's answer, stream the reply, store the reply."""
from __future__ import annotations

import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException

from dc_platform import llm
from dc_platform.rows import now

from . import interviewer, lifecycle, retrieve, roles, sessions, sources
from .flow import ANSWER, CANDIDATE, INTERVIEWER, Move, Turn, elapsed_minutes, next_move, tag_for
from .interviewer import Context

MAX_STREAMS = 8  # replies being written at once, so a few slow ones cannot take every worker
STREAM_SECONDS = 150
_slots = threading.BoundedSemaphore(MAX_STREAMS)

NOT_READY = {
    sessions.PLANNING: "The interview is still being prepared.",
    sessions.FAILED: "The interview could not be prepared. Start a new one.",
    sessions.ENDED: "That interview has finished.",
}


@dataclass(frozen=True)
class Prepared:
    context: Context
    turns: list[Turn]
    move: Move
    tag: str


def _check_turn_allowed(turns: list[Turn], text: str | None) -> None:
    """The interviewer speaks first; after that, answers and replies alternate. `text` None asks for the reply still owed."""
    owes_reply = bool(turns) and turns[-1].role == CANDIDATE
    if text is None and turns and not owes_reply:
        raise HTTPException(409, "It is your turn to answer.")
    if text is not None and not turns:
        raise HTTPException(409, "The interviewer speaks first.")
    if text is not None and owes_reply:
        raise HTTPException(409, "Your last answer is still waiting for a reply.")


def _context(user_id: int, row: Any, references: str = "") -> Context:
    role = roles.get_row(user_id, row["role_id"])
    style = sessions.style_of(row)
    return Context(
        role, roles.job_text(role), sources.candidate_brief(user_id) if style.useCv else "", style, sessions.plan_of(row),
        references=references,
    )


def _references(user_id: int, role_id: int, plan: Any, turns: list[Turn]) -> str:
    item = interviewer.next_item(plan, turns)
    last = next((t.text for t in reversed(turns) if t.role == CANDIDATE), None)
    query = retrieve.query_from_turn(item.question if item else None, last)
    return retrieve.for_session(user_id, role_id, query)


def prepare(user_id: int, session_id: int, text: str | None) -> Prepared:
    row = sessions.get_row(user_id, session_id)
    if row["status"] != sessions.ACTIVE:
        raise HTTPException(409, NOT_READY.get(row["status"], "That interview is not running."))
    turns = sessions.turns_of(user_id, session_id)
    _check_turn_allowed(turns, text)
    if text is not None:
        turns.append(sessions.add_turn(user_id, session_id, CANDIDATE, ANSWER, text))
    plan = sessions.plan_of(row)
    refs = _references(user_id, row["role_id"], plan, turns)
    ctx = _context(user_id, row, refs)
    move = next_move(turns, len(ctx.plan.items), ctx.style, elapsed_minutes(turns, now()))
    if move is Move.DONE:
        raise HTTPException(409, "That interview has finished.")
    return Prepared(ctx, turns, move, tag_for(move, interviewer.changes_topic(ctx.plan, turns)))


def turn_json(turn: Turn) -> dict[str, Any]:
    return {"idx": turn.idx, "role": turn.role, "tag": turn.tag, "text": turn.text, "created": turn.created}


def _reason(error: Exception) -> str:
    return str(getattr(error, "detail", None) or error)[:200]


def _pieces(p: Prepared, user_id: int) -> Iterator[str]:
    deadline = time.monotonic() + STREAM_SECONDS
    for piece in interviewer.stream_reply(p.context, p.turns, p.move, user_id):
        if time.monotonic() > deadline:
            raise llm.LLMError("The interviewer took too long to reply.")
        yield piece


def run(p: Prepared, user_id: int, session_id: int) -> Iterator[dict[str, Any]]:
    """Events for the stream: start, delta..., then done or error. A reply is stored only once it is complete."""
    if not _slots.acquire(blocking=False):
        yield {"type": "error", "message": "The interviewer is busy. Try again in a moment."}
        return
    try:
        yield {"type": "start", "tag": p.tag}
        pieces: list[str] = []
        for piece in _pieces(p, user_id):
            pieces.append(piece)
            yield {"type": "delta", "text": piece}
        text = "".join(pieces).strip()
        if not text:
            raise llm.LLMError("The interviewer said nothing.")
        turn = sessions.add_turn(user_id, session_id, INTERVIEWER, p.tag, text)
        finished = p.move is Move.WRAP
        yield {"type": "done", "turn": turn_json(turn), "finished": finished, "feedbackJobId": lifecycle.end(user_id, session_id) if finished else None}
    except (llm.LLMError, HTTPException) as e:
        yield {"type": "error", "message": _reason(e)}
    finally:
        _slots.release()
