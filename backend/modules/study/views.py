"""Serialize study rows to the camelCase shapes the frontend expects."""
from __future__ import annotations

from typing import Any


def deck(row: Any, *, due_count: int = 0, card_count: int | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": row["id"],
        "parentId": row["parent_id"],
        "name": row["name"],
        "sourceKind": row["source_kind"],
        "sourceRef": row["source_ref"],
        "status": row["status"],
        "jobId": row["job_id"],
        "created": row["created"],
        "dueCount": due_count,
    }
    if card_count is not None:
        out["cardCount"] = card_count
    return out


def card(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "deckId": row["deck_id"],
        "kind": row["kind"],
        "front": row["front"],
        "back": row["back"],
        "easeFactor": row["ease_factor"],
        "intervalDays": row["interval_days"],
        "due": row["due"],
        "reps": row["reps"],
        "lapses": row["lapses"],
        "created": row["created"],
    }


def stats(*, due_today: int, streak: int, retention: float | None, total_reviews: int) -> dict[str, Any]:
    return {
        "dueToday": due_today,
        "streak": streak,
        "retention": retention,
        "totalReviews": total_reviews,
    }
