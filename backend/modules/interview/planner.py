"""The interview plan: how many questions of each kind, then the questions themselves.

How many of each is decided here, by level and duration (or by the user); the model only writes the questions.
"""
from __future__ import annotations

from typing import Any

from dc_platform import llm

from . import prompts
from .context import candidate_text, job_brief
from .schemas import CATEGORIES, MAX_QUESTIONS, Category, Plan, PlanItem, Style

MINUTES_PER_QUESTION = 6
RUN_ORDER: tuple[Category, ...] = ("company", "behavioral", "technical", "system_design")
# relative share of the interview each kind gets, by level; system design grows with seniority
LEVEL_WEIGHTS: dict[str, dict[Category, int]] = {
    "junior": {"behavioral": 3, "technical": 4, "system_design": 1, "company": 1},
    "mid": {"behavioral": 3, "technical": 4, "system_design": 2, "company": 1},
    "senior": {"behavioral": 2, "technical": 3, "system_design": 4, "company": 1},
    "staff": {"behavioral": 2, "technical": 2, "system_design": 5, "company": 1},
}
DEFAULT_LEVEL = "mid"


def level_key(level: str) -> str:
    text = level.lower()
    if "principal" in text:
        return "staff"
    return next((k for k in LEVEL_WEIGHTS if k in text), DEFAULT_LEVEL)


def allocate(total: int, weights: dict[Category, int]) -> dict[Category, int]:
    """Split `total` questions by weight; the largest remainders take the leftover ones."""
    scale = sum(weights.values())
    exact = {c: total * w / scale for c, w in weights.items()}
    counts = {c: int(v) for c, v in exact.items()}
    leftover = total - sum(counts.values())
    for c in sorted(exact, key=lambda k: exact[k] - counts[k], reverse=True)[:leftover]:
        counts[c] += 1
    return {c: n for c, n in counts.items() if n}


def question_counts(style: Style, level: str, company: str | None) -> dict[Category, int]:
    """Questions per category: what the user asked for, else a mix from the level and duration. 'Company' needs a company."""
    usable = [c for c in (style.categories or CATEGORIES) if c != "company" or company] or [c for c in CATEGORIES if c != "company"]
    chosen = {c: n for c, n in style.counts.items() if n and c in usable}
    if chosen:
        return chosen
    total = max(2, min(MAX_QUESTIONS, style.durationMin // MINUTES_PER_QUESTION))
    shares = LEVEL_WEIGHTS[level_key(level)]
    weights = {c: shares[c] for c in usable}
    others = {c: w for c, w in weights.items() if c != "company"}
    if others and "company" in weights:  # a named company always gets its "why us" question
        return {**allocate(total - 1, others), "company": 1}
    return allocate(total, weights)


def _counts_text(counts: dict[Category, int]) -> str:
    return "\n".join(f"- {c}: {counts[c]}" for c in RUN_ORDER if c in counts)


def _enforce(plan: Plan, counts: dict[Category, int]) -> Plan:
    """Keep at most the asked-for number per category, drop repeats, and put the kinds in running order."""
    seen: set[str] = set()
    kept: dict[Category, list[PlanItem]] = {c: [] for c in counts}
    for item in plan.items:
        key = item.question.strip().lower()
        if item.category in kept and len(kept[item.category]) < counts[item.category] and key not in seen:
            seen.add(key)
            kept[item.category].append(item)
    items = [i for c in RUN_ORDER for i in kept.get(c, [])]
    if not items:
        raise llm.LLMError("The AI did not write any usable questions.")
    return Plan(items=items)


def build_plan(
    role: Any, reading: dict[str, Any] | None, cv: str, style: Style, user_id: int, *, researched: list[str] | None = None,
) -> Plan:
    """`researched` is the role's question bank, one line each. It is offered to the model as data, never as instructions."""
    counts = question_counts(style, role["level"], role["company"])
    context = f"<job>\n{job_brief(role, reading)}\n</job>\n<candidate>\n{candidate_text(cv)}\n</candidate>"
    if researched:
        context += "\n<researched_questions>\n" + "\n".join(researched).replace("</researched_questions", "") + "\n</researched_questions>"
    got = llm.client_for(user_id).complete_json(
        [{"role": "system", "content": prompts.render("plan", counts=_counts_text(counts))}, {"role": "user", "content": context}],
        Plan, user_id=user_id, module="interview", temperature=0.6,
    )
    return _enforce(got, counts)


