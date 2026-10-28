"""Assemble the Hub page for the active target. Other modules are read through their own services, and only when enabled."""
from __future__ import annotations

import datetime as dt
from typing import Any

from dc_platform import tracks
from modules import enabled_modules

from . import actions, readiness_view, setup, targets
from . import track as track_of

FIT_GAPS = 3


def _days_left(date: str | None) -> int | None:
    if not date:
        return None
    return (dt.date.fromisoformat(date) - dt.datetime.now(dt.timezone.utc).date()).days


def _fit(user_id: int, row: Any) -> dict[str, Any] | None:
    """The CV score for this target's job description, when the CV module is on. A linked run wins; otherwise the best score of
    the same job description (or, failing that, the same job title) is used, so scoring the target's job is enough."""
    if row is None or "cv" not in enabled_modules():
        return None
    from modules.cv import service

    run = None
    if row["score_run_id"] is not None:
        try:
            run = service.get_run(user_id, row["score_run_id"])
        except Exception:  # the run was deleted since the target was linked
            run = None
    if run is None:
        found = service.matching_run(user_id, row["jd_text"], row["title"])
        run = service.get_run(user_id, found) if found is not None else None
    if run is None:
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
    track = track_of.of(user_id, row)
    seen = readiness_view.build(user_id, jd_text, tracks.by_slug(track["slug"]))
    fit = _fit(user_id, row)
    enabled = frozenset(enabled_modules())
    context = actions.Context(
        target=target, topics=seen["topics"], due_cards=_due_cards(user_id), fit=fit,
        enabled=enabled, has_interview=_has_interview(seen["topics"]), track=track["slug"],
    )
    return {
        "setup": setup.build(user_id, {"target": target, "fit": fit}),
        "target": target and {**target, "daysLeft": _days_left(target["date"])},
        "targets": targets.list_targets(user_id),
        "readiness": seen["topics"], "track": track, "fit": fit, "actions": actions.next_actions(context),
        "activity": seen["activity"], "streak": seen["streak"], "dataPoints": seen["dataPoints"],
        "modules": sorted(enabled),
    }
