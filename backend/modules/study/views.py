"""Serialize study rows to the camelCase shapes the frontend expects."""
from __future__ import annotations

from typing import Any

from .scheduler import CardState, schedule

# A card whose interval has reached three weeks is counted as learned.
MASTERED_DAYS = 21


def deck(row: Any, *, due_count: int = 0, card_count: int | None = None, mastered_count: int = 0) -> dict[str, Any]:
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
        "masteredCount": mastered_count,
    }
    if card_count is not None:
        out["cardCount"] = card_count
    return out


def next_intervals(row: Any) -> dict[str, int]:
    """Days until this card comes back for each rating, so the buttons can say what they will do."""
    state = CardState(
        ease_factor=float(row["ease_factor"]),
        interval_days=int(row["interval_days"]),
        reps=int(row["reps"]),
        lapses=int(row["lapses"]),
    )
    return {r: schedule(state, r).interval_days for r in ("again", "hard", "good", "easy")}


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
        "next": next_intervals(row),
    }


def stats(
    *,
    due_today: int,
    streak: int,
    retention: float | None,
    total_reviews: int,
    forecast: list[int] | None = None,
    next_due: int | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "dueToday": due_today,
        "streak": streak,
        "retention": retention,
        "totalReviews": total_reviews,
    }
    if forecast is not None:
        out["forecast"] = forecast
        out["nextDue"] = next_due
    return out
