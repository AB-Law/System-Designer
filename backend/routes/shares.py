from __future__ import annotations

import json
import secrets
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth.security import now_ms
from db import get_db
from deps import CurrentUser, OptionalUser, check_doc, pid

router = APIRouter(tags=["shares"])


class ShareIn(BaseModel):
    problemId: str
    label: str = Field(default="Shared design", min_length=1, max_length=80)
    score: int | None = None
    doc: dict[str, Any]


class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


def _comments(conn: sqlite3.Connection, token: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT c.id, c.body, c.created, c.user_id, u.username FROM comments c JOIN users u ON u.id = c.user_id WHERE c.token = ? ORDER BY c.created",
        (token,),
    ).fetchall()
    return [{"id": r["id"], "text": r["body"], "created": r["created"], "author": r["username"], "userId": r["user_id"]} for r in rows]


@router.post("/api/shares")
def create_share(s: ShareIn, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    text = check_doc(s.doc)
    token = secrets.token_urlsafe(16)
    n = conn.execute("SELECT COUNT(*) FROM shares WHERE user_id = ? AND revoked IS NULL", (user["id"],)).fetchone()[0]
    if n >= 100:
        raise HTTPException(400, "You have 100 live links. Revoke some first.")
    conn.execute("INSERT INTO shares VALUES (?,?,?,?,?,?,?,NULL)", (token, user["id"], pid(s.problemId), s.label.strip(), text, s.score, now_ms()))
    conn.commit()
    return {"token": token}


@router.get("/api/shares")
def my_shares(user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> list[dict]:
    rows = conn.execute(
        "SELECT token, problem_id, label, score, created, revoked, (SELECT COUNT(*) FROM comments c WHERE c.token = shares.token) AS comments FROM shares WHERE user_id = ? ORDER BY created DESC",
        (user["id"],),
    ).fetchall()
    return [
        {
            "token": r["token"],
            "problemId": r["problem_id"],
            "label": r["label"],
            "score": r["score"],
            "created": r["created"],
            "revoked": r["revoked"] is not None,
            "comments": r["comments"],
        }
        for r in rows
    ]


@router.delete("/api/shares/{token}")
def revoke_share(token: str, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    cur = conn.execute("UPDATE shares SET revoked = ? WHERE token = ? AND user_id = ? AND revoked IS NULL", (now_ms(), token, user["id"]))
    conn.commit()
    if not cur.rowcount:
        raise HTTPException(404, "No such live link")
    return {"ok": True}


@router.get("/api/s/{token}")
def read_share(token: str, viewer: OptionalUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    r = conn.execute("SELECT s.*, u.username FROM shares s JOIN users u ON u.id = s.user_id WHERE s.token = ?", (token,)).fetchone()
    if not r or r["revoked"] is not None:
        raise HTTPException(404, "This link does not exist or was revoked by its owner.")
    comments = _comments(conn, token)
    return {
        "token": token,
        "problemId": r["problem_id"],
        "label": r["label"],
        "score": r["score"],
        "created": r["created"],
        "owner": r["username"],
        "doc": json.loads(r["doc"]),
        "comments": comments,
        "viewer": viewer,
        "mine": bool(viewer and viewer["id"] == r["user_id"]),
    }


@router.post("/api/s/{token}/comments")
def add_comment(token: str, body: CommentIn, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    r = conn.execute("SELECT revoked FROM shares WHERE token = ?", (token,)).fetchone()
    if not r or r["revoked"] is not None:
        raise HTTPException(404, "This link does not exist or was revoked by its owner.")
    recent = conn.execute("SELECT COUNT(*) FROM comments WHERE user_id = ? AND created > ?", (user["id"], now_ms() - 60_000)).fetchone()[0]
    if recent >= 10:
        raise HTTPException(429, "Slow down a little.")
    conn.execute("INSERT INTO comments(token, user_id, body, created) VALUES (?,?,?,?)", (token, user["id"], body.text.strip(), now_ms()))
    conn.commit()
    return {"ok": True}


@router.delete("/api/s/{token}/comments/{comment_id}")
def delete_comment(token: str, comment_id: int, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    owner = conn.execute("SELECT user_id FROM shares WHERE token = ?", (token,)).fetchone()
    c = conn.execute("SELECT user_id FROM comments WHERE id = ? AND token = ?", (comment_id, token)).fetchone()
    if not c or not owner or user["id"] not in (c["user_id"], owner["user_id"]):
        raise HTTPException(404, "No such comment")
    conn.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
    conn.commit()
    return {"ok": True}
