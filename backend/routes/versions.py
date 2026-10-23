from __future__ import annotations

import json
import sqlite3
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth.security import now_ms
from db import get_db
from deps import CurrentUser, check_doc, pid

router = APIRouter(prefix="/api/versions", tags=["versions"])

MAX_VERSIONS_PER_PROBLEM = 60


class VersionIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    kind: Literal["manual", "auto", "coach", "restore"] = "manual"
    score: int | None = None
    passed: int | None = None
    total: int | None = None
    doc: dict[str, Any]


class LabelIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)


def _version(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "label": r["label"],
        "kind": r["kind"],
        "score": r["score"],
        "passed": r["passed"],
        "total": r["total"],
        "created": r["created"],
        "doc": json.loads(r["doc"]),
    }


@router.get("/{problem_id}")
def list_versions(problem_id: str, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM versions WHERE user_id = ? AND problem_id = ? ORDER BY created DESC",
        (user["id"], pid(problem_id)),
    ).fetchall()
    return [_version(r) for r in rows]


@router.post("/{problem_id}")
def add_version(problem_id: str, v: VersionIn, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    text = check_doc(v.doc)
    cur = conn.execute(
        "INSERT INTO versions(user_id, problem_id, label, kind, score, passed, total, doc, created) VALUES (?,?,?,?,?,?,?,?,?)",
        (user["id"], pid(problem_id), v.label.strip(), v.kind, v.score, v.passed, v.total, text, now_ms()),
    )
    extra = conn.execute("SELECT COUNT(*) FROM versions WHERE user_id = ? AND problem_id = ?", (user["id"], problem_id)).fetchone()[0] - MAX_VERSIONS_PER_PROBLEM
    if extra > 0:
        conn.execute(
            "DELETE FROM versions WHERE id IN (SELECT id FROM versions WHERE user_id = ? AND problem_id = ? ORDER BY (kind = 'auto') DESC, created ASC LIMIT ?)",
            (user["id"], problem_id, extra),
        )
    row = conn.execute("SELECT * FROM versions WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.commit()
    return _version(row) if row else {}


@router.patch("/{problem_id}/{version_id}")
def rename_version(problem_id: str, version_id: int, body: LabelIn, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    conn.execute(
        "UPDATE versions SET label = ?, kind = CASE WHEN kind = 'auto' THEN 'manual' ELSE kind END WHERE id = ? AND user_id = ? AND problem_id = ?",
        (body.label.strip(), version_id, user["id"], pid(problem_id)),
    )
    conn.commit()
    return {"ok": True}


@router.delete("/{problem_id}/{version_id}")
def delete_version(problem_id: str, version_id: int, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    conn.execute("DELETE FROM versions WHERE id = ? AND user_id = ? AND problem_id = ?", (version_id, user["id"], pid(problem_id)))
    conn.commit()
    return {"ok": True}
