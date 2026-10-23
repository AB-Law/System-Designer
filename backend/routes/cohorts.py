from __future__ import annotations

import secrets
import sqlite3
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth.security import now_ms
from db import get_db
from deps import CurrentUser
from rate_limit import record_fail, throttle

router = APIRouter(prefix="/api/cohorts", tags=["cohorts"])

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


class CohortIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=20)


def _member(conn: sqlite3.Connection, cohort_id: int, user_id: int) -> bool:
    return conn.execute("SELECT 1 FROM cohort_members WHERE cohort_id = ? AND user_id = ?", (cohort_id, user_id)).fetchone() is not None


@router.post("")
def create_cohort(body: CohortIn, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    if conn.execute("SELECT COUNT(*) FROM cohorts WHERE owner_id = ?", (user["id"],)).fetchone()[0] >= 10:
        raise HTTPException(400, "You already own 10 cohorts.")
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    cur = conn.execute("INSERT INTO cohorts(name, code, owner_id, created) VALUES (?,?,?,?)", (body.name.strip(), code, user["id"], now_ms()))
    conn.execute("INSERT INTO cohort_members VALUES (?,?,?)", (cur.lastrowid, user["id"], now_ms()))
    conn.commit()
    return {"id": cur.lastrowid, "code": code}


@router.post("/join")
def join_cohort(body: JoinIn, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    key = f"join|{user['id']}"
    throttle(key, limit=10)
    c = conn.execute("SELECT id, name FROM cohorts WHERE code = ?", (body.code.strip().upper(),)).fetchone()
    if not c:
        record_fail(key)
        raise HTTPException(404, "No cohort has that code.")
    conn.execute("INSERT OR IGNORE INTO cohort_members VALUES (?,?,?)", (c["id"], user["id"], now_ms()))
    conn.commit()
    return {"id": c["id"], "name": c["name"]}


@router.get("")
def my_cohorts(user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> list[dict]:
    rows = conn.execute(
        "SELECT c.id, c.name, c.code, c.owner_id, (SELECT COUNT(*) FROM cohort_members m2 WHERE m2.cohort_id = c.id) AS members FROM cohorts c JOIN cohort_members m ON m.cohort_id = c.id WHERE m.user_id = ? ORDER BY c.created DESC",
        (user["id"],),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "members": r["members"],
            "mine": r["owner_id"] == user["id"],
            "code": r["code"] if r["owner_id"] == user["id"] else None,
        }
        for r in rows
    ]


@router.get("/{cohort_id}/board")
def board(cohort_id: int, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    if not _member(conn, cohort_id, user["id"]):
        raise HTTPException(404, "No such cohort")
    c = conn.execute("SELECT name, owner_id FROM cohorts WHERE id = ?", (cohort_id,)).fetchone()
    members = conn.execute(
        "SELECT u.id, u.username FROM cohort_members m JOIN users u ON u.id = m.user_id WHERE m.cohort_id = ?",
        (cohort_id,),
    ).fetchall()
    best = conn.execute(
        """SELECT s.user_id, s.problem_id, MAX(s.score) AS score,
                  MAX(CASE WHEN s.passed = s.total AND s.score >= 80 THEN 1 ELSE 0 END) AS done
           FROM submissions s JOIN cohort_members m ON m.user_id = s.user_id
           WHERE m.cohort_id = ? AND s.score IS NOT NULL GROUP BY s.user_id, s.problem_id""",
        (cohort_id,),
    ).fetchall()
    per: dict[int, dict[str, dict[str, int]]] = defaultdict(dict)
    for r in best:
        per[r["user_id"]][r["problem_id"]] = {"score": r["score"], "done": r["done"]}
    rows = []
    for m in members:
        b = per.get(m["id"], {})
        rows.append(
            {
                "username": m["username"],
                "owner": m["id"] == c["owner_id"],
                "you": m["id"] == user["id"],
                "done": sum(v["done"] for v in b.values()),
                "points": sum(v["score"] for v in b.values()),
                "best": b,
            }
        )
    rows.sort(key=lambda r: (-r["done"], -r["points"], r["username"]))
    return {"name": c["name"], "members": rows}


@router.post("/{cohort_id}/leave")
def leave_cohort(cohort_id: int, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    conn.execute("DELETE FROM cohort_members WHERE cohort_id = ? AND user_id = ?", (cohort_id, user["id"]))
    conn.commit()
    return {"ok": True}


@router.delete("/{cohort_id}")
def delete_cohort(cohort_id: int, user: CurrentUser, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    cur = conn.execute("DELETE FROM cohorts WHERE id = ? AND owner_id = ?", (cohort_id, user["id"]))
    if not cur.rowcount:
        raise HTTPException(404, "No such cohort")
    conn.execute("DELETE FROM cohort_members WHERE cohort_id = ?", (cohort_id,))
    conn.commit()
    return {"ok": True}
