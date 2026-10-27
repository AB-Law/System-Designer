"""Everything the Hub holds for a user, to download or to delete. The readiness events belong to the modules that wrote them."""
from __future__ import annotations

from typing import Any

from db import open_db


def export_all(user_id: int) -> dict[str, Any]:
    with open_db() as db:
        rows = db.execute("SELECT * FROM hub_targets WHERE user_id=? ORDER BY id", (user_id,)).fetchall()
        state = db.execute("SELECT active_target_id FROM hub_state WHERE user_id=?", (user_id,)).fetchone()
    return {"targets": [dict(r) for r in rows], "activeTargetId": state["active_target_id"] if state else None}


def delete_all(user_id: int) -> None:
    with open_db() as db, db:
        db.execute("DELETE FROM hub_targets WHERE user_id=?", (user_id,))
        db.execute("DELETE FROM hub_state WHERE user_id=?", (user_id,))
