"""The interviewer's side of one turn: build the prompt for a move and stream the reply."""
from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

from dc_platform import llm
from dc_platform.llm import Message

from . import prompts
from .context import candidate_text, persona
from .flow import INTERVIEWER, Move, Turn, asked_count
from .schemas import Plan, PlanItem, Style

MAX_HISTORY = 40  # turns of the conversation sent to the model
BEGIN = "(The candidate has joined. Begin the interview.)"


@dataclass(frozen=True)
class Context:
    role: Any
    job: str
    cv: str
    style: Style
    plan: Plan


def next_item(plan: Plan, turns: list[Turn]) -> PlanItem | None:
    """The plan question the interviewer asks next, or None when the plan has been used up."""
    index = asked_count(turns)
    return plan.items[index] if index < len(plan.items) else None


def changes_topic(plan: Plan, turns: list[Turn]) -> bool:
    index = asked_count(turns)
    return 0 < index < len(plan.items) and plan.items[index].category != plan.items[index - 1].category


def directive(move: Move, plan: Plan, turns: list[Turn]) -> str:
    item = next_item(plan, turns)
    shift = prompts.section("interviewer_moves", "shift-category") if changes_topic(plan, turns) else ""
    return prompts.section("interviewer_moves", move.value, question=item.question if item else "", shift=shift).strip()


def system_prompt(ctx: Context, move_directive: str) -> str:
    return prompts.render(
        "interviewer", persona=persona(ctx.role), role=ctx.role["title"], job=ctx.job, cv=candidate_text(ctx.cv),
        tone=prompts.section("interviewer_moves", f"tone-{ctx.style.tone}"), directive=move_directive,
    )


def messages_for(ctx: Context, turns: list[Turn], move: Move) -> list[Message]:
    history: list[Message] = [
        {"role": "assistant" if t.role == INTERVIEWER else "user", "content": t.text} for t in turns[-MAX_HISTORY:]
    ] or [{"role": "user", "content": BEGIN}]
    return [{"role": "system", "content": system_prompt(ctx, directive(move, ctx.plan, turns))}, *history]


def stream_reply(ctx: Context, turns: list[Turn], move: Move, user_id: int) -> Iterator[str]:
    return llm.client_for(user_id).stream(messages_for(ctx, turns, move), user_id=user_id, module="interview", temperature=0.7)
