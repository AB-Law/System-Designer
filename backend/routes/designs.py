from __future__ import annotations

import json
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.security import now_ms
from db import get_db
from deps import CurrentUser, check_doc, pid

router = APIRouter(prefix="/api/designs", tags=["designs"])


class DesignIn(BaseModel):
    doc: dict[str, Any]
    updated: int | None = None
    ifEmpty: bool = False


@router.get("/{problem_id}")
def get_design(problem_id: str, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    r = conn.execute("SELECT doc, updated FROM designs WHERE user_id = ? AND problem_id = ?", (user["id"], pid(problem_id))).fetchone()
    if not r:
        raise HTTPException(404, "No saved design")
    return {"doc": json.loads(r["doc"]), "updated": r["updated"]}


@router.put("/{problem_id}")
def put_design(problem_id: str, body: DesignIn, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    text = check_doc(body.doc)
    if body.ifEmpty and conn.execute("SELECT 1 FROM designs WHERE user_id = ? AND problem_id = ?", (user["id"], pid(problem_id))).fetchone():
        return {"ok": True, "kept": "server"}
    conn.execute(
        "INSERT INTO designs(user_id, problem_id, doc, updated) VALUES (?,?,?,?) ON CONFLICT(user_id, problem_id) DO UPDATE SET doc = excluded.doc, updated = excluded.updated",
        (user["id"], pid(problem_id), text, body.updated or now_ms()),
    )
    conn.commit()
    return {"ok": True}
