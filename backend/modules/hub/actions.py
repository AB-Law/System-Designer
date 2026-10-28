"""Next actions: a short ranked list from plain rules over what the Hub already knows. Predictable and free; no model call."""
from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

SECONDS_PER_CARD = 20
LIMIT = 5
MIN_POINTS = 3


@dataclass(frozen=True)
class Context:
    target: dict[str, Any] | None
    topics: list[dict[str, Any]]
    due_cards: int
    fit: dict[str, Any] | None
    enabled: frozenset[str]
    has_interview: bool


def _action(key: str, priority: int, title: str, why: str, module: str, href: str) -> dict[str, Any]:
    return {"key": key, "priority": priority, "title": title, "why": why, "module": module, "href": href}


def set_target(c: Context) -> dict[str, Any] | None:
    if c.target is None:
        return _action("set-target", 100, "Set a target role", "Everything here is measured against the role you are preparing for.", "hub", "#/hub/targets")
    return None


def review_cards(c: Context) -> dict[str, Any] | None:
    if "study" not in c.enabled or c.due_cards < 1:
        return None
    minutes = max(1, math.ceil(c.due_cards * SECONDS_PER_CARD / 60))
    return _action("review-cards", 80, f"Review {c.due_cards} due card{'s' if c.due_cards != 1 else ''}", f"About {minutes} minute{'s' if minutes != 1 else ''}.", "study", "#/study")


def weakest_topic(c: Context) -> dict[str, Any] | None:
    weak = [t for t in c.topics if t["tier"] == "needs_work" and t["points"] >= MIN_POINTS]
    if not weak:
        return None
    t = min(weak, key=lambda x: (not x["relevant"], x["strength"]))
    why = f"Your {t['label'].lower()} answers and cards are your weakest area" + (", and the job description asks for it." if t["relevant"] else ".")
    return _action(f"weak-{t['slug']}", 75 if t["relevant"] else 65, f"Work on {t['label'].lower()}", why, "interview" if "interview" in c.enabled else "design", "#/interview" if "interview" in c.enabled else "#/learn")


def cv_gap(c: Context) -> dict[str, Any] | None:
    gaps = (c.fit or {}).get("gaps") or []
    if "cv" not in c.enabled or not gaps:
        return None
    return _action("cv-gap", 60, f"Tailor your CV for \"{gaps[0]['text']}\"", "The biggest missing requirement in this job description.", "cv", f"#/cv/score/{(c.fit or {}).get('runId', '')}".rstrip("/"))


def score_target(c: Context) -> dict[str, Any] | None:
    if c.target is None or "cv" not in c.enabled or c.fit is not None:
        return None
    href = f"#/cv/score/target/{c.target.get('id')}" if c.target.get("hasJd") else "#/cv/score"
    return _action("score-target", 70, f"Score your CV against {c.target['title']}", "Shows your fit and the gaps to close.", "cv", href)


def untouched_relevant(c: Context) -> dict[str, Any] | None:
    fresh = [t for t in c.topics if t["relevant"] and t["tier"] == "none"]
    if not fresh:
        return None
    t = fresh[0]
    return _action(f"start-{t['slug']}", 55, f"Start with {t['label'].lower()}", "The job description asks for it and you have nothing recorded yet.", "design", "#/learn")


def first_mock(c: Context) -> dict[str, Any] | None:
    if c.target is None or "interview" not in c.enabled or c.has_interview:
        return None
    return _action("first-mock", 50, f"Run a mock interview for {c.target['title']}", "A first round shows where to focus.", "interview", "#/interview")


RULES: tuple[Callable[[Context], dict[str, Any] | None], ...] = (
    set_target, review_cards, weakest_topic, score_target, cv_gap, untouched_relevant, first_mock,
)


def next_actions(c: Context) -> list[dict[str, Any]]:
    found = [a for rule in RULES if (a := rule(c))]
    return sorted(found, key=lambda a: -a["priority"])[:LIMIT]
