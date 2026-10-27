"""What the Hub shows about the user: strength per topic, recent activity and the streak. Reads `readiness_events` only."""
from __future__ import annotations

import datetime as dt
from collections import defaultdict
from typing import Any

from db import open_db
from dc_platform import topics
from dc_platform.rows import now

MS_PER_DAY = 86_400_000
HALF_LIFE_DAYS = 30  # how fast older evidence counts for less
MIN_POINTS = 3  # fewer data points than this is an early read, never a verdict
STRONG_FROM = 0.7
BUILDING_FROM = 0.45
ACTIVITY_LIMIT = 8
WEEK = 7


def tier_of(strength: float) -> str:
    return "strong" if strength >= STRONG_FROM else "building" if strength >= BUILDING_FROM else "needs_work"


def _weight(at: int, current: int) -> float:
    return 0.5 ** (max(current - at, 0) / MS_PER_DAY / HALF_LIFE_DAYS)


def _topic_card(slug: str, events: list[Any], current: int, relevant: bool) -> dict[str, Any]:
    card: dict[str, Any] = {
        "slug": slug, "label": topics.label_of(slug), "points": len(events), "relevant": relevant,
        "sources": sorted({e["module"] for e in events}), "strength": None, "tier": "none",
    }
    if events:
        weights = [_weight(int(e["at"]), current) for e in events]
        strength = sum(w * float(e["strength"]) for w, e in zip(weights, events, strict=True)) / sum(weights)
        card |= {"strength": round(strength, 3), "tier": "early" if len(events) < MIN_POINTS else tier_of(strength)}
    return card


def _events(user_id: int) -> list[Any]:
    with open_db() as db:
        return db.execute("SELECT module, topic, strength, ref, at FROM readiness_events WHERE user_id=?", (user_id,)).fetchall()


def grid(events: list[Any], jd_text: str | None) -> list[dict[str, Any]]:
    """One card per topic. Topics the job description mentions come first; the rest keep the shared list's order."""
    by_topic: dict[str, list[Any]] = defaultdict(list)
    for e in events:
        by_topic[topics.resolve(e["topic"])].append(e)
    wanted = topics.mentioned_in(jd_text) if jd_text else set()
    current = now()
    cards = [_topic_card(slug, by_topic.get(slug, []), current, slug in wanted) for slug in topics.SLUGS]
    return sorted(cards, key=lambda c: not c["relevant"])  # stable: keeps the list order inside each group


def activity(events: list[Any]) -> list[dict[str, Any]]:
    """The latest things done, one entry per source (a card, an interview), newest first."""
    latest: dict[tuple[str, str], dict[str, Any]] = {}
    for e in sorted(events, key=lambda e: -int(e["at"])):
        key = (e["module"], e["ref"])
        entry = latest.setdefault(key, {"module": e["module"], "ref": e["ref"], "at": int(e["at"]), "topics": []})
        label = topics.label_of(slug) if (slug := topics.resolve(e["topic"])) != topics.OTHER else None
        if label and label not in entry["topics"]:
            entry["topics"].append(label)
    return sorted(latest.values(), key=lambda a: -a["at"])[:ACTIVITY_LIMIT]


def _day(ms: int) -> dt.date:
    return dt.datetime.fromtimestamp(ms / 1000, tz=dt.timezone.utc).date()


def streak(events: list[Any], today: dt.date | None = None) -> dict[str, Any]:
    """Consecutive active days ending today (or yesterday, so the streak is not lost before you have done today's), and the last week."""
    today = today or _day(now())
    days = {_day(int(e["at"])) for e in events}
    cursor = today if today in days else today - dt.timedelta(days=1)
    count = 0
    while cursor in days:
        count += 1
        cursor -= dt.timedelta(days=1)
    week = [{"date": (d := today - dt.timedelta(days=i)).isoformat(), "active": d in days} for i in range(WEEK - 1, -1, -1)]
    return {"days": count, "week": week}


def build(user_id: int, jd_text: str | None) -> dict[str, Any]:
    events = _events(user_id)
    return {"topics": grid(events, jd_text), "activity": activity(events), "streak": streak(events), "dataPoints": len(events)}
