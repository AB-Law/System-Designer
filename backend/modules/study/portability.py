"""Everything the study module holds for a user, to download or to delete."""
from __future__ import annotations

from typing import Any

from db import open_db
from dc_platform import readiness

TABLES = ("study_reviews", "study_cards", "study_decks", "study_mindmap_edges", "study_mindmap_nodes", "study_mindmaps")


def _all(table: str, user_id: int) -> list[dict[str, Any]]:
    with open_db() as db:
        return [dict(r) for r in db.execute(f"SELECT * FROM {table} WHERE user_id=? ORDER BY 1", (user_id,))]


def export_all(user_id: int) -> dict[str, Any]:
    """Decks with their cards and review history, and every mind map version with its nodes and edges."""
    return {
        "decks": _all("study_decks", user_id),
        "cards": _all("study_cards", user_id),
        "reviews": _all("study_reviews", user_id),
        "mindmaps": _all("study_mindmaps", user_id),
        "mindmapNodes": _all("study_mindmap_nodes", user_id),
        "mindmapEdges": _all("study_mindmap_edges", user_id),
    }


def delete_all(user_id: int) -> None:
    with open_db() as db, db:
        for table in TABLES:
            db.execute(f"DELETE FROM {table} WHERE user_id=?", (user_id,))
    readiness.delete_module(user_id, "study")
