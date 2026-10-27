"""The roles a user is preparing for. One is active; the Hub is shown through it. Every query filters by user_id."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from db import open_db
from dc_platform.rows import now, owned

MAX_TARGETS = 10

COLUMNS = {
    "title": "title", "level": "level", "company": "company", "jdText": "jd_text",
    "roleId": "role_id", "scoreRunId": "score_run_id", "date": "date",
}


def public(row: Any, *, full: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": row["id"], "title": row["title"], "level": row["level"], "company": row["company"],
        "hasJd": bool(row["jd_text"]), "roleId": row["role_id"], "scoreRunId": row["score_run_id"],
        "date": row["date"], "created": row["created"],
    }
    if full:
        out["jdText"] = row["jd_text"]
    return out


def get_row(user_id: int, target_id: int) -> Any:
    return owned("SELECT * FROM hub_targets WHERE id=? AND user_id=?", (target_id, user_id), "Target")


def list_targets(user_id: int) -> list[dict[str, Any]]:
    with open_db() as db:
        rows = db.execute("SELECT * FROM hub_targets WHERE user_id=? ORDER BY created, id", (user_id,)).fetchall()
    return [public(r) for r in rows]


def active_id(user_id: int) -> int | None:
    with open_db() as db:
        row = db.execute("SELECT active_target_id FROM hub_state WHERE user_id=?", (user_id,)).fetchone()
    return int(row["active_target_id"]) if row and row["active_target_id"] else None


def active_row(user_id: int) -> Any | None:
    """The active target's row, or None when the user has none (also when the stored id points at a deleted target)."""
    target_id = active_id(user_id)
    if target_id is None:
        return None
    with open_db() as db:
        return db.execute("SELECT * FROM hub_targets WHERE id=? AND user_id=?", (target_id, user_id)).fetchone()


def _set_active(db: Any, user_id: int, target_id: int | None) -> None:
    db.execute(
        "INSERT INTO hub_state(user_id, active_target_id) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET active_target_id=excluded.active_target_id",
        (user_id, target_id),
    )


def create(user_id: int, fields: dict[str, Any]) -> dict[str, Any]:
    """Add a target and make it the active one. The values are keyed by the API names in COLUMNS."""
    with open_db() as db, db:
        count = db.execute("SELECT COUNT(*) FROM hub_targets WHERE user_id=?", (user_id,)).fetchone()[0]
        if count >= MAX_TARGETS:
            raise HTTPException(409, f"You can keep up to {MAX_TARGETS} targets. Delete one to add another.")
        cur = db.execute(
            "INSERT INTO hub_targets(user_id, title, level, company, jd_text, role_id, score_run_id, date, created) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                user_id, fields["title"], fields.get("level", ""), fields.get("company"), fields.get("jdText"),
                fields.get("roleId"), fields.get("scoreRunId"), fields.get("date"), now(),
            ),
        )
        target_id = int(cur.lastrowid or 0)
        _set_active(db, user_id, target_id)
    return public(get_row(user_id, target_id), full=True)


def update(user_id: int, target_id: int, changes: dict[str, Any]) -> dict[str, Any]:
    get_row(user_id, target_id)
    sets = {COLUMNS[k]: v for k, v in changes.items() if k in COLUMNS}
    if "title" in changes and not changes["title"]:
        raise HTTPException(422, "Give the target a title.")
    if sets:
        assignments = ", ".join(f"{col}=?" for col in sets)
        with open_db() as db, db:
            db.execute(f"UPDATE hub_targets SET {assignments} WHERE id=? AND user_id=?", (*sets.values(), target_id, user_id))
    return public(get_row(user_id, target_id), full=True)


def activate(user_id: int, target_id: int) -> None:
    get_row(user_id, target_id)
    with open_db() as db, db:
        _set_active(db, user_id, target_id)


def delete(user_id: int, target_id: int) -> None:
    """Remove a target. If it was the active one, the most recently added of the rest takes over."""
    get_row(user_id, target_id)
    with open_db() as db, db:
        db.execute("DELETE FROM hub_targets WHERE id=? AND user_id=?", (target_id, user_id))
        if active_id(user_id) == target_id:
            nxt = db.execute("SELECT id FROM hub_targets WHERE user_id=? ORDER BY created DESC, id DESC LIMIT 1", (user_id,)).fetchone()
            _set_active(db, user_id, int(nxt["id"]) if nxt else None)
