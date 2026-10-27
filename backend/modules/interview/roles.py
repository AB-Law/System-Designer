"""Roles a user practises for. Every query filters by user_id; a role that is not yours is a 404."""
from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException

from db import open_db
from dc_platform.rows import now, owned

from . import sources
from .context import job_brief


def public(row: Any, *, full: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": row["id"], "title": row["title"], "level": row["level"], "company": row["company"],
        "hasJd": bool(row["jd_text"]), "sourceScoreRunId": row["source_score_run_id"], "created": row["created"],
    }
    if full:
        out["jdText"] = row["jd_text"]
        out["jdStructured"] = json.loads(row["jd_structured_json"]) if row["jd_structured_json"] else None
    return out


def get_row(user_id: int, role_id: int) -> Any:
    return owned("SELECT * FROM interview_roles WHERE id=? AND user_id=?", (role_id, user_id), "Role")


def list_roles(user_id: int) -> list[dict[str, Any]]:
    with open_db() as db:
        rows = db.execute("SELECT * FROM interview_roles WHERE user_id=? ORDER BY created DESC, id DESC", (user_id,)).fetchall()
    return [public(r) for r in rows]


def _from_score_run(user_id: int, run_id: int) -> dict[str, Any]:
    """Role fields carried over from a score run: its JD, and the reading of it the run already paid for."""
    run = sources.score_run_jd(user_id, run_id)
    analysis = run["analysis"] or {}
    return {
        "title": run["title"] or analysis.get("title", ""), "level": analysis.get("level", ""),
        "jd_text": run["text"], "jd_structured_json": json.dumps(analysis) if analysis else None,
    }


def create(
    user_id: int, *, title: str, level: str, company: str | None, jd_text: str | None, score_run_id: int | None,
) -> dict[str, Any]:
    fields: dict[str, Any] = {"title": title, "level": level, "jd_text": jd_text, "jd_structured_json": None}
    if score_run_id is not None:
        # what the user typed wins over what the run carries
        fields = {**_from_score_run(user_id, score_run_id), **{k: v for k, v in fields.items() if v}}
    if not fields["title"]:
        raise HTTPException(422, "Give the role a title.")
    with open_db() as db, db:
        cur = db.execute(
            "INSERT INTO interview_roles(user_id, title, level, company, jd_text, jd_structured_json, source_score_run_id, created) VALUES (?,?,?,?,?,?,?,?)",
            (user_id, fields["title"][:120], fields["level"][:40], company, fields["jd_text"], fields["jd_structured_json"], score_run_id, now()),
        )
        role_id = int(cur.lastrowid or 0)
    return public(get_row(user_id, role_id), full=True)


def update(user_id: int, role_id: int, changes: dict[str, Any]) -> dict[str, Any]:
    """Apply the fields the caller sent. A new JD clears its stored reading, so the next plan reads it afresh."""
    get_row(user_id, role_id)
    columns = {"title": "title", "level": "level", "company": "company", "jdText": "jd_text"}
    sets = {columns[k]: v for k, v in changes.items() if k in columns}
    if "jd_text" in sets:
        sets["jd_structured_json"] = None
    if sets:
        with open_db() as db, db:
            db.execute(f"UPDATE interview_roles SET {', '.join(f'{c}=?' for c in sets)} WHERE id=? AND user_id=?", (*sets.values(), role_id, user_id))
    return public(get_row(user_id, role_id), full=True)


def stored_reading(role: Any) -> dict[str, Any] | None:
    return json.loads(role["jd_structured_json"]) if role["jd_structured_json"] else None


def jd_reading(user_id: int, role: Any) -> dict[str, Any] | None:
    """The structured JD for a role, reading and storing it the first time. None when the role has no JD."""
    stored = stored_reading(role)
    if stored or not role["jd_text"]:
        return stored
    reading = sources.analyse_jd(role["jd_text"], user_id)
    with open_db() as db, db:
        db.execute("UPDATE interview_roles SET jd_structured_json=? WHERE id=? AND user_id=?", (json.dumps(reading), role["id"], user_id))
    return reading


def job_text(role: Any) -> str:
    """The role as the interviewer sees it, from the reading already stored (it is made when the plan is)."""
    return job_brief(role, stored_reading(role))


def delete(user_id: int, role_id: int) -> None:
    """Remove the role with its sessions, turns and feedback."""
    get_row(user_id, role_id)
    with open_db() as db, db:
        ids = [r[0] for r in db.execute("SELECT id FROM interview_sessions WHERE role_id=? AND user_id=?", (role_id, user_id))]
        for table, column in (("interview_feedback", "session_id"), ("interview_turns", "session_id")):
            db.executemany(f"DELETE FROM {table} WHERE {column}=? AND user_id=?", [(i, user_id) for i in ids])
        db.execute("DELETE FROM interview_sessions WHERE role_id=? AND user_id=?", (role_id, user_id))
        db.execute("DELETE FROM interview_roles WHERE id=? AND user_id=?", (role_id, user_id))
