"""The "get set up" checklist: what a new user does first. Each step is done when the data it makes exists; nothing extra is stored."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from modules import enabled_modules

Check = Callable[[int, dict[str, Any]], bool]


def _has_target(user_id: int, seen: dict[str, Any]) -> bool:
    return seen["target"] is not None


def _has_cv(user_id: int, seen: dict[str, Any]) -> bool:
    from modules.cv import service

    return bool(service.list_cvs(user_id))


def _is_scored(user_id: int, seen: dict[str, Any]) -> bool:
    return seen["fit"] is not None


def _has_interview(user_id: int, seen: dict[str, Any]) -> bool:
    from modules.interview import sessions

    return bool(sessions.list_sessions(user_id))


def _has_deck(user_id: int, seen: dict[str, Any]) -> bool:
    from modules.study import decks

    return bool(decks.list_decks(user_id))


# (key, needs module, title, hint, where to do it, check)
STEPS: tuple[tuple[str, str | None, str, str, str, Check], ...] = (
    ("target", None, "Set a target role", "The Hub measures everything against the role you are preparing for.", "#/hub/targets", _has_target),
    ("cv", "cv", "Upload your CV", "Used to score you against a job and to ground your interview.", "#/cv", _has_cv),
    ("score", "cv", "Score your CV against the target", "Shows your fit and the gaps to close.", "#/cv", _is_scored),
    ("interview", "interview", "Run a mock interview", "Ten minutes is enough for a first read.", "#/interview", _has_interview),
    ("deck", "study", "Make your first flashcard deck", "Spaced repetition keeps what you learn.", "#/study", _has_deck),
)


def build(user_id: int, seen: dict[str, Any]) -> list[dict[str, Any]]:
    """The steps for the modules that are on. `seen` is the part of the summary built so far (target and fit)."""
    on = set(enabled_modules())
    return [
        {"key": key, "title": title, "hint": hint, "href": href, "done": bool(check(user_id, seen)), "module": module or "hub"}
        for key, module, title, hint, href, check in STEPS
        if module is None or module in on
    ]
