from __future__ import annotations

import json
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from auth.security import now_ms
from db import get_db
from deps import CurrentUser, pid

router = APIRouter(prefix="/api/submissions", tags=["submissions"])


def _int(v: Any) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


@router.get("")
def all_submissions(user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict[str, list[Any]]:
    out: dict[str, list[Any]] = {}
    for r in conn.execute("SELECT problem_id, body FROM submissions WHERE user_id = ? ORDER BY at DESC", (user["id"],)):
        out.setdefault(r["problem_id"], []).append(json.loads(r["body"]))
    return out


@router.get("/{problem_id}")
def list_submissions(problem_id: str, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> list[Any]:
    rows = conn.execute(
        "SELECT body FROM submissions WHERE user_id = ? AND problem_id = ? ORDER BY at DESC LIMIT 100",
        (user["id"], pid(problem_id)),
    ).fetchall()
    return [json.loads(r["body"]) for r in rows]


@router.post("/{problem_id}")
def add_submission(problem_id: str, body: dict[str, Any], user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    text = json.dumps(body, separators=(",", ":"))
    if len(text) > 600_000:
        raise HTTPException(413, "Submission too large")
    at = int(body.get("at") or now_ms())
    if conn.execute("SELECT 1 FROM submissions WHERE user_id = ? AND problem_id = ? AND at = ?", (user["id"], pid(problem_id), at)).fetchone():
        return {"ok": True, "duplicate": True}
    conn.execute(
        "INSERT INTO submissions(problem_id, at, body, user_id, score, passed, total) VALUES (?,?,?,?,?,?,?)",
        (problem_id, at, text, user["id"], _int(body.get("score")), _int(body.get("passed")), _int(body.get("total"))),
    )
    conn.commit()
    return {"ok": True}
