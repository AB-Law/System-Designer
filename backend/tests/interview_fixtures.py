"""A routing fake LLM for the interview tests. It echoes the interviewer's instruction so a test can see which move was made."""
from __future__ import annotations

import json
from typing import Any

from dc_platform.llm import FakeAdapter, Message
from tests.cv_fixtures import fake_llm as cv_fake_llm

PLAN_REPLY: dict[str, Any] = {
    "items": [
        {"category": "technical", "question": "How would you debug a slow Postgres query?", "focus": "PostgreSQL"},
        {"category": "behavioral", "question": "Tell me about a time you led a migration.", "focus": "Leadership"},
        {"category": "technical", "question": "When would you pick Kafka over a queue?", "focus": "Messaging"},
        {"category": "technical", "question": "A fourth technical question the plan has no room for.", "focus": "Extra"},
        {"category": "behavioral", "question": "Tell me about a time you led a migration.", "focus": "Duplicate"},
    ]
}
SUMMARY_REPLY: dict[str, Any] = {
    "strengths": ["Clear stories"], "gaps": ["Few numbers"], "practice_next": ["Quantify results", "Name trade-offs", "Use STAR", "A fourth one"],
}
DIRECTIVE_MARK = "Your next move:\n"


def move_text(messages: list[Message]) -> str:
    """The instruction the interviewer was given for this turn."""
    return messages[0]["content"].split(DIRECTIVE_MARK, 1)[1]


def _critique(messages: list[Message]) -> dict[str, Any]:
    body = messages[1]["content"].split("<answers>\n", 1)[1].rsplit("\n</answers>", 1)[0]
    answers = json.loads(body)
    scores = [4, 2, 3, 5]
    marked = [{"ref": a["ref"], "score": scores[i % 4], "strengths": ["Specific"], "gaps": ["No figure"], "better": "A model answer."} for i, a in enumerate(answers)]
    return {"answers": [*marked, {"ref": 999, "score": 5, "strengths": [], "gaps": [], "better": "invented"}]}


def fake_interview_llm(*, plan: dict[str, Any] | None = PLAN_REPLY, critique: bool = True) -> FakeAdapter:
    cv = cv_fake_llm()

    def reply(messages: list[Message]) -> str:
        system = messages[0]["content"]
        if "TASK:interview_plan" in system:
            return json.dumps(plan) if plan is not None else "not json"
        if "TASK:interview_critique" in system:
            return json.dumps(_critique(messages)) if critique else "not json"
        if "TASK:interview_summary" in system:
            return json.dumps(SUMMARY_REPLY)
        if DIRECTIVE_MARK in system:
            return "Interviewer: " + move_text(messages)
        return cv.replies(messages)  # type: ignore[operator]

    return FakeAdapter(reply)
