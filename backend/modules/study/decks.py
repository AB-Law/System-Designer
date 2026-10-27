"""Deck persistence and list/detail stats. All queries filter by user_id."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from db import open_db
from dc_platform import readiness
from dc_platform.rows import now
from dc_platform.rows import owned as _owned

from . import views

READY = "ready"
# A deck that is still being generated, or whose drafts the user has not confirmed, has nothing due yet.
READY_DECKS = "(SELECT id FROM study_decks WHERE user_id=? AND status='ready')"


def get_row(user_id: int, deck_id: int) -> Any:
    return _owned("SELECT * FROM study_decks WHERE id=? AND user_id=?", (deck_id, user_id), "Deck")


def _due_counts(db: Any, user_id: int, at: int) -> dict[int, int]:
    rows = db.execute(
        f"SELECT deck_id, COUNT(*) AS n FROM study_cards WHERE user_id=? AND due<=? AND deck_id IN {READY_DECKS} GROUP BY deck_id",
        (user_id, at, user_id),
    ).fetchall()
    return {int(r["deck_id"]): int(r["n"]) for r in rows}


def _card_counts(db: Any, user_id: int) -> dict[int, int]:
    rows = db.execute(
        "SELECT deck_id, COUNT(*) AS n FROM study_cards WHERE user_id=? GROUP BY deck_id",
        (user_id,),
    ).fetchall()
    return {int(r["deck_id"]): int(r["n"]) for r in rows}


def list_decks(user_id: int) -> list[dict[str, Any]]:
    at = now()
    with open_db() as db:
        rows = db.execute(
            "SELECT * FROM study_decks WHERE user_id=? ORDER BY created DESC",
            (user_id,),
        ).fetchall()
        due = _due_counts(db, user_id, at)
        cards = _card_counts(db, user_id)
    return [views.deck(r, due_count=due.get(r["id"], 0), card_count=cards.get(r["id"], 0)) for r in rows]


def get_deck(user_id: int, deck_id: int) -> dict[str, Any]:
    row = get_row(user_id, deck_id)
    at = now()
    with open_db() as db:
        due = db.execute(
            f"SELECT COUNT(*) FROM study_cards WHERE deck_id=? AND user_id=? AND due<=? AND deck_id IN {READY_DECKS}",
            (deck_id, user_id, at, user_id),
        ).fetchone()[0]
        n = db.execute(
            "SELECT COUNT(*) FROM study_cards WHERE deck_id=? AND user_id=?",
            (deck_id, user_id),
        ).fetchone()[0]
    return views.deck(row, due_count=int(due), card_count=int(n))


def create(user_id: int, name: str, *, parent_id: int | None = None, source_kind: str = "manual", source_ref: str = "") -> dict[str, Any]:
    if parent_id is not None:
        get_row(user_id, parent_id)
    with open_db() as db, db:
        cur = db.execute(
            "INSERT INTO study_decks(user_id, parent_id, name, source_kind, source_ref, status, created) VALUES (?,?,?,?,?,?,?)",
            (user_id, parent_id, name.strip()[:120], source_kind, source_ref, READY, now()),
        )
        deck_id = int(cur.lastrowid or 0)
    return get_deck(user_id, deck_id)


def patch(user_id: int, deck_id: int, *, name: str | None = None, parent_id: int | None = None, clear_parent: bool = False) -> dict[str, Any]:
    get_row(user_id, deck_id)
    if parent_id is not None:
        if parent_id == deck_id:
            raise HTTPException(422, "A deck cannot be its own parent.")
        get_row(user_id, parent_id)
    sets: list[str] = []
    params: list[Any] = []
    if name is not None:
        sets.append("name=?")
        params.append(name.strip()[:120])
    if clear_parent:
        sets.append("parent_id=NULL")
    elif parent_id is not None:
        sets.append("parent_id=?")
        params.append(parent_id)
    if not sets:
        return get_deck(user_id, deck_id)
    params.extend([deck_id, user_id])
    with open_db() as db, db:
        db.execute(f"UPDATE study_decks SET {', '.join(sets)} WHERE id=? AND user_id=?", params)
    return get_deck(user_id, deck_id)


def delete(user_id: int, deck_id: int) -> None:
    get_row(user_id, deck_id)
    gone: list[int] = []
    with open_db() as db, db:
        children = db.execute(
            "SELECT id FROM study_decks WHERE parent_id=? AND user_id=?",
            (deck_id, user_id),
        ).fetchall()
        for child in children:
            gone += _delete_tree(db, user_id, int(child["id"]))
        gone += _delete_tree(db, user_id, deck_id)
    forget_cards(user_id, gone)  # after the transaction: readiness writes use their own connection


def forget_cards(user_id: int, card_ids: list[int]) -> None:
    """Drop the readiness events a deleted card wrote, so the Hub does not count what no longer exists."""
    for card_id in card_ids:
        readiness.replace(user_id, "study", f"study_card:{card_id}", [])


def _delete_tree(db: Any, user_id: int, deck_id: int) -> list[int]:
    card_ids = [
        int(r["id"])
        for r in db.execute("SELECT id FROM study_cards WHERE deck_id=? AND user_id=?", (deck_id, user_id)).fetchall()
    ]
    for cid in card_ids:
        db.execute("DELETE FROM study_reviews WHERE card_id=? AND user_id=?", (cid, user_id))
    db.execute("DELETE FROM study_cards WHERE deck_id=? AND user_id=?", (deck_id, user_id))
    db.execute("DELETE FROM study_decks WHERE id=? AND user_id=?", (deck_id, user_id))
    return card_ids


def set_status(user_id: int, deck_id: int, status: str, *, job_id: str | None = None) -> None:
    get_row(user_id, deck_id)
    with open_db() as db, db:
        db.execute(
            "UPDATE study_decks SET status=?, job_id=? WHERE id=? AND user_id=?",
            (status, job_id, deck_id, user_id),
        )
