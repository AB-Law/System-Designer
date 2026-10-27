"""Assemble the Hub page for the active target. Other modules are read through their own services, and only when enabled."""
from __future__ import annotations

import datetime as dt
from typing import Any

from modules import enabled_modules

from . import actions, readiness_view, setup, targets

FIT_GAPS = 3


def _days_left(date: str | None) -> int | None:
    if not date:
        return None
    return (dt.date.fromisoformat(date) - dt.datetime.now(dt.timezone.utc).date()).days


def _fit(user_id: int, run_id: int | None) -> dict[str, Any] | None:
    """The CV score for this target's job description, when the CV module is on and the run still exists."""
    if run_id is None or "cv" not in enabled_modules():
        return None
    from modules.cv import service

    try:
        run = service.get_run(user_id, run_id)
    except Exception:  # the run was deleted since the target was linked
        return None
    gaps = [g for g in run["analysis"].get("gaps", []) if g["status"] != "met"][:FIT_GAPS]
    return {"runId": run["id"], "total": run["total"], "band": run["band"], "gaps": gaps}


def _due_cards(user_id: int) -> int:
    if "study" not in enabled_modules():
        return 0
    from modules.study import cards

    return int(cards.global_stats(user_id)["dueToday"])


def _has_interview(topics: list[dict[str, Any]]) -> bool:
    return any("interview" in t["sources"] for t in topics)


def build(user_id: int) -> dict[str, Any]:
    row = targets.active_row(user_id)
    target = targets.public(row, full=False) if row else None
    jd_text = row["jd_text"] if row else None
    seen = readiness_view.build(user_id, jd_text)
    fit = _fit(user_id, row["score_run_id"]) if row else None
    enabled = frozenset(enabled_modules())
    context = actions.Context(
        target=target, topics=seen["topics"], due_cards=_due_cards(user_id), fit=fit,
        enabled=enabled, has_interview=_has_interview(seen["topics"]),
    )
    return {
        "setup": setup.build(user_id, {"target": target, "fit": fit}),
        "target": target and {**target, "daysLeft": _days_left(target["date"])},
        "targets": targets.list_targets(user_id),
        "readiness": seen["topics"], "fit": fit, "actions": actions.next_actions(context),
        "activity": seen["activity"], "streak": seen["streak"], "dataPoints": seen["dataPoints"],
        "modules": sorted(enabled),
    }
