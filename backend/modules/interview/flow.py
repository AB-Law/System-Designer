"""The shape of an interview, as pure functions: given what has been said, what does the interviewer do next?

The model only writes the words. Which move to make (open, probe, next question, close) is decided here, so the flow is
predictable and the same on every provider.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from .schemas import Style
from .vagueness import is_vague

INTERVIEWER, CANDIDATE = "interviewer", "candidate"
QUESTION, TRANSITION, FOLLOW_UP, ANSWER, CLOSING = "question", "transition", "follow-up", "answer", "closing"
ASKS_PLAN_ITEM = {QUESTION, TRANSITION}  # a turn with one of these tags asks the next question in the plan
MAX_PROBES = {"friendly": 1, "tough": 2}  # follow-ups in a row on one question


class Move(StrEnum):
    OPEN = "open"
    PROBE = "probe"
    NEXT = "next"
    INVITE = "invite"  # "any questions for me?"
    WRAP = "wrap"  # answer them and say goodbye
    DONE = "done"  # nothing more to say


@dataclass(frozen=True)
class Turn:
    idx: int
    role: str
    tag: str
    text: str
    created: int


def count_tag(turns: list[Turn], *tags: str) -> int:
    return sum(1 for t in turns if t.tag in tags)


def asked_count(turns: list[Turn]) -> int:
    return count_tag(turns, *ASKS_PLAN_ITEM)


def _probes_in_a_row(turns: list[Turn]) -> int:
    n = 0
    for t in reversed([t for t in turns if t.role == INTERVIEWER]):
        if t.tag != FOLLOW_UP:
            break
        n += 1
    return n


def _should_probe(turns: list[Turn], style: Style) -> bool:
    last = turns[-1]
    return last.role == CANDIDATE and _probes_in_a_row(turns) < MAX_PROBES[style.tone] and is_vague(last.text)


def elapsed_minutes(turns: list[Turn], now_ms: int) -> float:
    return (now_ms - turns[0].created) / 60_000 if turns else 0.0


def next_move(turns: list[Turn], plan_size: int, style: Style, elapsed_min: float) -> Move:
    closings = count_tag(turns, CLOSING)
    if closings:
        return Move.WRAP if closings == 1 else Move.DONE
    if not turns:
        return Move.OPEN
    out_of_time = elapsed_min >= style.durationMin
    if not out_of_time and _should_probe(turns, style):
        return Move.PROBE
    if out_of_time or asked_count(turns) >= plan_size:
        return Move.INVITE
    return Move.NEXT


def tag_for(move: Move, category_changed: bool) -> str:
    """The tag stored on the interviewer's turn for this move."""
    if move is Move.PROBE:
        return FOLLOW_UP
    if move in (Move.INVITE, Move.WRAP):
        return CLOSING
    return TRANSITION if move is Move.NEXT and category_changed else QUESTION
