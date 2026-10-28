"""Interview sessions, their turns and feedback. Every query filters by user_id; a session that is not yours is a 404."""
from __future__ import annotations

import json
from typing import Any

from db import open_db
from dc_platform.rows import now, owned

from .flow import Turn
from .schemas import Plan, Style

PLANNING, ACTIVE, ENDED, FAILED = "planning", "active", "ended", "failed"


def get_row(user_id: int, session_id: int) -> Any:
    return owned("SELECT * FROM interview_sessions WHERE id=? AND user_id=?", (session_id, user_id), "Session")


def style_of(row: Any) -> Style:
    return Style.model_validate_json(row["style_json"])


def plan_of(row: Any) -> Plan:
    return Plan.model_validate_json(row["plan_json"]) if row["plan_json"] else Plan()


def create(user_id: int, role_id: int, style: Style) -> int:
    with open_db() as db, db:
        cur = db.execute(
            "INSERT INTO interview_sessions(user_id, role_id, style_json, status, created) VALUES (?,?,?,?,?)",
            (user_id, role_id, style.model_dump_json(), PLANNING, now()),
        )
        return int(cur.lastrowid or 0)


def _set(user_id: int, session_id: int, **fields: Any) -> None:
    get_row(user_id, session_id)
    assignments = ", ".join(f"{column}=?" for column in fields)
    with open_db() as db, db:
        db.execute(f"UPDATE interview_sessions SET {assignments} WHERE id=? AND user_id=?", (*fields.values(), session_id, user_id))


def set_plan_job(user_id: int, session_id: int, job_id: str) -> None:
    _set(user_id, session_id, plan_job_id=job_id)


def set_plan(user_id: int, session_id: int, plan: Plan) -> None:
    _set(user_id, session_id, plan_json=plan.model_dump_json(), status=ACTIVE, error=None)


def set_failed(user_id: int, session_id: int, message: str) -> None:
    _set(user_id, session_id, status=FAILED, error=message[:300])


def mark_ended(user_id: int, session_id: int) -> None:
    _set(user_id, session_id, status=ENDED, ended=now())


def set_feedback_job(user_id: int, session_id: int, job_id: str) -> None:
    _set(user_id, session_id, feedback_job_id=job_id)


def set_score(user_id: int, session_id: int, score: int | None) -> None:
    _set(user_id, session_id, score=score)


# ---------------------------------------------------------------- turns

def turns_of(user_id: int, session_id: int) -> list[Turn]:
    with open_db() as db:
        rows = db.execute("SELECT * FROM interview_turns WHERE session_id=? AND user_id=? ORDER BY idx", (session_id, user_id)).fetchall()
    return [Turn(r["idx"], r["role"], r["tag"], r["text"], r["created"]) for r in rows]


def add_turn(user_id: int, session_id: int, role: str, tag: str, text: str) -> Turn:
    get_row(user_id, session_id)
    created = now()
    with open_db() as db, db:
        idx = db.execute("SELECT COALESCE(MAX(idx) + 1, 0) FROM interview_turns WHERE session_id=?", (session_id,)).fetchone()[0]
        db.execute(
            "INSERT INTO interview_turns(session_id, idx, user_id, role, tag, text, created) VALUES (?,?,?,?,?,?,?)",
            (session_id, idx, user_id, role, tag, text, created),
        )
    return Turn(idx, role, tag, text, created)


# ---------------------------------------------------------------- feedback

def save_feedback(user_id: int, session_id: int, per_answer: list[dict[str, Any]], summary: dict[str, Any], version: str, model: str) -> None:
    get_row(user_id, session_id)
    with open_db() as db, db:
        db.execute(
            "INSERT OR REPLACE INTO interview_feedback(session_id, user_id, per_answer_json, summary_json, prompt_version, model, created) VALUES (?,?,?,?,?,?,?)",
            (session_id, user_id, json.dumps(per_answer), json.dumps(summary), version, model, now()),
        )


def feedback_of(user_id: int, session_id: int) -> dict[str, Any] | None:
    with open_db() as db:
        row = db.execute("SELECT * FROM interview_feedback WHERE session_id=? AND user_id=?", (session_id, user_id)).fetchone()
    if not row:
        return None
    return {"perAnswer": json.loads(row["per_answer_json"]), "summary": json.loads(row["summary_json"]), "promptVersion": row["prompt_version"]}


# ---------------------------------------------------------------- listing and deleting

def list_sessions(user_id: int, role_id: int | None = None) -> list[dict[str, Any]]:
    where, params = ("s.user_id=?", (user_id,)) if role_id is None else ("s.user_id=? AND s.role_id=?", (user_id, role_id))
    sql = (
        "SELECT s.*, r.title AS role_title, r.company AS role_company, "
        "(SELECT COUNT(*) FROM interview_turns t WHERE t.session_id=s.id) AS turn_count "
        f"FROM interview_sessions s JOIN interview_roles r ON r.id=s.role_id WHERE {where} ORDER BY s.created DESC, s.id DESC"
    )
    with open_db() as db:
        rows = db.execute(sql, params).fetchall()
    return [
        {
            "id": r["id"], "roleId": r["role_id"], "roleTitle": r["role_title"], "company": r["role_company"], "status": r["status"],
            "score": r["score"], "style": json.loads(r["style_json"]), "turnCount": r["turn_count"], "created": r["created"], "ended": r["ended"],
        }
        for r in rows
    ]


def delete(user_id: int, session_id: int) -> None:
    get_row(user_id, session_id)
    with open_db() as db, db:
        for table in ("interview_feedback", "interview_turns"):
            db.execute(f"DELETE FROM {table} WHERE session_id=? AND user_id=?", (session_id, user_id))
        db.execute("DELETE FROM interview_sessions WHERE id=? AND user_id=?", (session_id, user_id))
