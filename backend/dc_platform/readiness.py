"""Readiness events: what a user showed they know (or do not) in a module. Producers only insert; the Hub reads."""
from __future__ import annotations

from dataclasses import dataclass

from db import open_db
from dc_platform import topics
from dc_platform.rows import now

STRONG_FROM = 0.7
WEAK_BELOW = 0.5


@dataclass(frozen=True)
class Event:
    topic: str
    strength: float  # 0..1


def signal_for(strength: float) -> str:
    return "strength" if strength >= STRONG_FROM else "weakness" if strength < WEAK_BELOW else "neutral"


def replace(user_id: int, module: str, ref: str, events: list[Event]) -> None:
    """Store the events for one source (`ref`), replacing any written for it before, so a retried job does not double count."""
    at = now()
    rows = [(user_id, module, topics.resolve(e.topic), signal_for(e.strength), round(e.strength, 3), ref, at) for e in events]
    with open_db() as db, db:
        db.execute("DELETE FROM readiness_events WHERE user_id=? AND module=? AND ref=?", (user_id, module, ref))
        db.executemany("INSERT INTO readiness_events(user_id, module, topic, signal, strength, ref, at) VALUES (?,?,?,?,?,?,?)", rows)


def delete_module(user_id: int, module: str) -> None:
    """Remove every event a module wrote for this user (used when they delete that module's data)."""
    with open_db() as db, db:
        db.execute("DELETE FROM readiness_events WHERE user_id=? AND module=?", (user_id, module))
