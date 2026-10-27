"""Card CRUD, due queue, review application, and per-deck stats."""
from __future__ import annotations

import datetime as dt
from typing import Any

from db import open_db
from dc_platform import readiness
from dc_platform.rows import now
from dc_platform.rows import owned as _owned

from . import decks, views
from .scheduler import STRENGTH, CardState, Rating, schedule

MS_PER_DAY = 86_400_000


def get_row(user_id: int, card_id: int) -> Any:
    return _owned("SELECT * FROM study_cards WHERE id=? AND user_id=?", (card_id, user_id), "Card")


def list_for_deck(user_id: int, deck_id: int) -> list[dict[str, Any]]:
    decks.get_row(user_id, deck_id)
    with open_db() as db:
        rows = db.execute(
            "SELECT * FROM study_cards WHERE deck_id=? AND user_id=? ORDER BY id",
            (deck_id, user_id),
        ).fetchall()
    return [views.card(r) for r in rows]


def due(user_id: int, *, deck_id: int | None = None, limit: int = 100) -> list[dict[str, Any]]:
    at = now()
    limit = max(1, min(limit, 200))
    if deck_id is not None:
        decks.get_row(user_id, deck_id)
        sql = f"SELECT * FROM study_cards WHERE user_id=? AND deck_id=? AND due<=? AND deck_id IN {decks.READY_DECKS} ORDER BY due, id LIMIT ?"
        params: tuple[Any, ...] = (user_id, deck_id, at, user_id, limit)
    else:
        sql = f"SELECT * FROM study_cards WHERE user_id=? AND due<=? AND deck_id IN {decks.READY_DECKS} ORDER BY due, id LIMIT ?"
        params = (user_id, at, user_id, limit)
    with open_db() as db:
        rows = db.execute(sql, params).fetchall()
    return [views.card(r) for r in rows]


def create(user_id: int, deck_id: int, *, kind: str, front: str, back: str) -> dict[str, Any]:
    decks.get_row(user_id, deck_id)
    at = now()
    with open_db() as db, db:
        cur = db.execute(
            """INSERT INTO study_cards(
                 deck_id, user_id, kind, front, back, ease_factor, interval_days, due, reps, lapses, created
               ) VALUES (?,?,?,?,?, 2.5, 1, ?, 0, 0, ?)""",
            (deck_id, user_id, kind, front.strip(), back.strip(), at, at),
        )
        card_id = int(cur.lastrowid or 0)
    return views.card(get_row(user_id, card_id))


def patch(user_id: int, card_id: int, *, kind: str | None = None, front: str | None = None, back: str | None = None) -> dict[str, Any]:
    get_row(user_id, card_id)
    sets: list[str] = []
    params: list[Any] = []
    if kind is not None:
        sets.append("kind=?")
        params.append(kind)
    if front is not None:
        sets.append("front=?")
        params.append(front.strip())
    if back is not None:
        sets.append("back=?")
        params.append(back.strip())
    if sets:
        params.extend([card_id, user_id])
        with open_db() as db, db:
            db.execute(f"UPDATE study_cards SET {', '.join(sets)} WHERE id=? AND user_id=?", params)
    return views.card(get_row(user_id, card_id))


def delete(user_id: int, card_id: int) -> None:
    get_row(user_id, card_id)
    with open_db() as db, db:
        db.execute("DELETE FROM study_reviews WHERE card_id=? AND user_id=?", (card_id, user_id))
        db.execute("DELETE FROM study_cards WHERE id=? AND user_id=?", (card_id, user_id))
    decks.forget_cards(user_id, [card_id])


def review(user_id: int, card_id: int, rating: Rating) -> dict[str, Any]:
    row = get_row(user_id, card_id)
    result = schedule(
        CardState(
            ease_factor=float(row["ease_factor"]),
            interval_days=int(row["interval_days"]),
            reps=int(row["reps"]),
            lapses=int(row["lapses"]),
        ),
        rating,
    )
    at = now()
    due_at = at + result.interval_days * MS_PER_DAY
    with open_db() as db, db:
        db.execute(
            """UPDATE study_cards
               SET ease_factor=?, interval_days=?, due=?, reps=?, lapses=?
               WHERE id=? AND user_id=?""",
            (result.ease_factor, result.interval_days, due_at, result.reps, result.lapses, card_id, user_id),
        )
        db.execute(
            "INSERT INTO study_reviews(card_id, user_id, rating, at) VALUES (?,?,?,?)",
            (card_id, user_id, rating, at),
        )
    _signal_readiness(user_id, int(row["deck_id"]), card_id, rating)
    return views.card(get_row(user_id, card_id))


def _signal_readiness(user_id: int, deck_id: int, card_id: int, rating: Rating) -> None:
    deck = decks.get_row(user_id, deck_id)
    topic = str(deck["name"])[:80] or "study"
    readiness.replace(
        user_id,
        "study",
        f"study_card:{card_id}",
        [readiness.Event(topic=topic, strength=STRENGTH[rating])],
    )


def deck_stats(user_id: int, deck_id: int) -> dict[str, Any]:
    decks.get_row(user_id, deck_id)
    at = now()
    with open_db() as db:
        due_today = db.execute(
            f"SELECT COUNT(*) FROM study_cards WHERE deck_id=? AND user_id=? AND due<=? AND deck_id IN {decks.READY_DECKS}",
            (deck_id, user_id, at, user_id),
        ).fetchone()[0]
        review_rows = db.execute(
            """SELECT r.rating, r.at FROM study_reviews r
               JOIN study_cards c ON c.id=r.card_id
               WHERE c.deck_id=? AND r.user_id=?
               ORDER BY r.at""",
            (deck_id, user_id),
        ).fetchall()
    return _stats_from(int(due_today), review_rows)


def global_stats(user_id: int) -> dict[str, Any]:
    at = now()
    with open_db() as db:
        due_today = db.execute(
            f"SELECT COUNT(*) FROM study_cards WHERE user_id=? AND due<=? AND deck_id IN {decks.READY_DECKS}",
            (user_id, at, user_id),
        ).fetchone()[0]
        review_rows = db.execute(
            "SELECT rating, at FROM study_reviews WHERE user_id=? ORDER BY at",
            (user_id,),
        ).fetchall()
    return _stats_from(int(due_today), review_rows)


def _stats_from(due_today: int, review_rows: list[Any]) -> dict[str, Any]:
    total = len(review_rows)
    kept = sum(1 for r in review_rows if r["rating"] in ("good", "easy"))
    retention = round(kept / total, 3) if total else None
    return views.stats(
        due_today=due_today,
        streak=_streak([int(r["at"]) for r in review_rows]),
        retention=retention,
        total_reviews=total,
    )


def _day_key(ms: int) -> dt.date:
    return dt.datetime.fromtimestamp(ms / 1000, tz=dt.timezone.utc).date()


def _streak(review_times_ms: list[int]) -> int:
    """Consecutive UTC days with ≥1 review, counting back from today (or yesterday if none today)."""
    if not review_times_ms:
        return 0
    days = {_day_key(t) for t in review_times_ms}
    today = dt.datetime.now(tz=dt.timezone.utc).date()
    start = today if today in days else today - dt.timedelta(days=1)
    if start not in days:
        return 0
    n = 0
    cursor = start
    while cursor in days:
        n += 1
        cursor -= dt.timedelta(days=1)
    return n
