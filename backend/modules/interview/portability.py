"""Everything the interview module holds for a user, to download or to delete."""
from __future__ import annotations

from typing import Any

from db import open_db
from dc_platform import readiness

from . import docs, roles, sessions, views


def export_all(user_id: int) -> dict[str, Any]:
    """Roles (with their job descriptions), every session with its turns and feedback, and the document list (not the vectors)."""
    with open_db() as db:
        role_ids = [r["id"] for r in db.execute("SELECT id FROM interview_roles WHERE user_id=? ORDER BY id", (user_id,))]
    return {
        "roles": [roles.public(roles.get_row(user_id, i), full=True) for i in role_ids],
        "sessions": [views.session_detail(user_id, s["id"]) for s in sessions.list_sessions(user_id)],
        "docs": docs.list_docs(user_id),
    }


def delete_all(user_id: int) -> None:
    """Documents (with their vectors and files), then roles (which take their sessions, turns and feedback), then readiness events."""
    for d in docs.list_docs(user_id):
        docs.delete(user_id, d["id"])
    for r in roles.list_roles(user_id):
        roles.delete(user_id, r["id"])
    readiness.delete_module(user_id, "interview")
