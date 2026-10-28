"""Feedback on a finished interview: a critique of each answer against its rubric, then a summary and a score.

The model writes the words. Which answers exist, which rubric applies, the 0-100 score and the readiness events are worked out here.
"""
from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from statistics import mean
from typing import Any

from pydantic import BaseModel, Field

from dc_platform import llm, readiness

from . import prompts, rubrics, sessions
from .flow import ANSWER, ASKS_PLAN_ITEM, CLOSING, Turn
from .schemas import CATEGORY_LABELS, Category, Plan

MAX_ANSWER_CHARS = 3_000
MAX_SCORE = 5
LIST_LIMIT = 4
PRACTICE_COUNT = 3


@dataclass
class Exchange:
    """One planned question with everything the candidate said about it, follow-ups included."""

    ref: int  # index of the turn that asked it
    category: Category
    focus: str
    question: str
    jd_link: str = ""
    answers: list[str] = field(default_factory=list)

    @property
    def answer(self) -> str:
        return "\n\n".join(self.answers)


def build_exchanges(turns: list[Turn], plan: Plan) -> list[Exchange]:
    """Pair each answer with the plan question it answers. The reply to "any questions for me?" is not marked."""
    items = iter(plan.items)
    found: list[Exchange] = []
    for turn in turns:
        if turn.tag == CLOSING:
            break
        if turn.tag in ASKS_PLAN_ITEM and (item := next(items, None)):
            found.append(Exchange(turn.idx, item.category, item.focus, item.question, item.jd_link))
        elif turn.tag == ANSWER and found:
            found[-1].answers.append(turn.text)
    return [e for e in found if e.answers]


# ---------------------------------------------------------------- per-answer critique

class AnswerCritique(BaseModel):
    ref: int
    score: int = Field(ge=1, le=MAX_SCORE)
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    better: str = ""
    jd_fit: str = ""  # one sentence on how the answer meets what the job asks for


class Critiques(BaseModel):
    answers: list[AnswerCritique] = Field(default_factory=list)


def _critique_input(exchanges: list[Exchange], job: str = "") -> str:
    answers = "<answers>\n" + json.dumps([
        {
            "ref": e.ref, "category": e.category, "rubric": rubrics.rubric_text(e.category), "question": e.question,
            **({"job_requirement": e.jd_link} if e.jd_link else {}), "answer": e.answer[:MAX_ANSWER_CHARS],
        }
        for e in exchanges
    ]) + "\n</answers>"
    return f"<job>\n{job}\n</job>\n{answers}" if job else answers


def _marked(e: Exchange, c: AnswerCritique) -> dict[str, Any]:
    return {
        "ref": e.ref, "category": e.category, "focus": e.focus, "question": e.question, "answer": e.answer, "score": c.score,
        "jdLink": e.jd_link, "jdFit": c.jd_fit[:400] if e.jd_link else "", "strengths": c.strengths[:3], "gaps": c.gaps[:3], "better": c.better[:1_000], "rubric": list(rubrics.RUBRICS[e.category]),
    }


def critique(exchanges: list[Exchange], user_id: int, job: str = "") -> list[dict[str, Any]]:
    got = llm.client_for(user_id).complete_json(
        [{"role": "system", "content": prompts.render("critique")}, {"role": "user", "content": _critique_input(exchanges, job)}],
        Critiques, user_id=user_id, module="interview", temperature=0.2,
    )
    first: dict[int, AnswerCritique] = {}
    for c in got.answers:
        first.setdefault(c.ref, c)  # a ref the model made up is simply never looked up
    return [_marked(e, first[e.ref]) for e in exchanges if e.ref in first]


# ---------------------------------------------------------------- summary and score

class Summary(BaseModel):
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    practice_next: list[str] = Field(default_factory=list)


def percent(scores: list[int]) -> int | None:
    return round(mean(scores) / MAX_SCORE * 100) if scores else None


def by_category(marked: list[dict[str, Any]]) -> dict[str, int]:
    grouped: dict[str, list[int]] = defaultdict(list)
    for m in marked:
        grouped[m["category"]].append(m["score"])
    return {c: percent(s) or 0 for c, s in grouped.items()}


def summarise(role_title: str, marked: list[dict[str, Any]], user_id: int) -> dict[str, Any]:
    results = [{k: m[k] for k in ("category", "focus", "score", "strengths", "gaps")} for m in marked]
    got = llm.client_for(user_id).complete_json(
        [
            {"role": "system", "content": prompts.render("summary")},
            {"role": "user", "content": f"Role: {role_title}\n<results>\n{json.dumps(results)}\n</results>"},
        ],
        Summary, user_id=user_id, module="interview", temperature=0.3,
    )
    return {"strengths": got.strengths[:LIST_LIMIT], "gaps": got.gaps[:LIST_LIMIT], "practiceNext": got.practice_next[:PRACTICE_COUNT]}


EMPTY_SUMMARY: dict[str, Any] = {"strengths": [], "gaps": [], "practiceNext": [], "byCategory": {}, "score": None}


def readiness_events(marked: list[dict[str, Any]]) -> list[readiness.Event]:
    """One event per topic, the mean of its answers' scores."""
    grouped: dict[str, list[int]] = defaultdict(list)
    for m in marked:
        grouped[m["focus"] or CATEGORY_LABELS[m["category"]]].append(m["score"])
    return [readiness.Event(topic, mean(scores) / MAX_SCORE) for topic, scores in grouped.items()]


def write(user_id: int, session_id: int, role_title: str, job: str = "") -> dict[str, Any]:
    """Mark the session's answers, store the feedback and score, and record readiness events. Returns the score."""
    row = sessions.get_row(user_id, session_id)
    exchanges = build_exchanges(sessions.turns_of(user_id, session_id), sessions.plan_of(row))
    marked = critique(exchanges, user_id, job) if exchanges else []
    summary = {**summarise(role_title, marked, user_id), "byCategory": by_category(marked)} if marked else EMPTY_SUMMARY
    score = percent([m["score"] for m in marked])
    summary = {**summary, "score": score}
    sessions.save_feedback(user_id, session_id, marked, summary, prompts.PROMPT_VERSION, llm.client_for(user_id).adapter.model)
    sessions.set_score(user_id, session_id, score)
    readiness.replace(user_id, "interview", f"interview_session:{session_id}", readiness_events(marked))
    return {"sessionId": session_id, "score": score, "answers": len(marked)}
