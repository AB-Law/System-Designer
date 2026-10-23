from __future__ import annotations

import secrets
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from auth.invite import invite_ok
from auth.security import (
    clear_session_cookie,
    client_host,
    hash_password,
    new_session,
    now_ms,
    passwords_match,
    session_token,
    set_session_cookie,
    token_hash,
)
from db import get_db
from deps import NAME_RE, CurrentUser
from rate_limit import record_fail, throttle

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=24)
    password: str = Field(min_length=8, max_length=200)
    inviteCode: str | None = None


@router.post("/register")
def register(c: Credentials, request: Request, response: Response, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    ip = client_host(request)
    throttle(f"reg|{ip}")
    name = c.username.strip().lower()
    if not NAME_RE.match(name):
        raise HTTPException(400, "User names are 3 to 24 letters, digits or underscores.")
    if not invite_ok(c.inviteCode):
        record_fail(f"reg|{ip}")
        raise HTTPException(403, "That invite code is not right. Ask whoever shared the app with you.")
    salt = secrets.token_bytes(16)
    try:
        cur = conn.execute(
            "INSERT INTO users(username, pw_salt, pw_hash, created) VALUES (?,?,?,?)",
            (name, salt, hash_password(c.password, salt), now_ms()),
        )
        uid = cur.lastrowid
        token = new_session(conn, int(uid))  # type: ignore[arg-type]
        conn.commit()
    except sqlite3.IntegrityError as e:
        raise HTTPException(409, "That user name is taken.") from e
    set_session_cookie(response, token)
    return {"token": token, "user": {"id": uid, "username": name}}


@router.post("/login")
def login(c: Credentials, request: Request, response: Response, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    ip, name = client_host(request), c.username.strip().lower()
    throttle(f"ip|{ip}", limit=20)
    throttle(f"user|{name}")
    row = conn.execute("SELECT * FROM users WHERE username = ?", (name,)).fetchone()
    # hash even when the user does not exist so timing does not reveal which names are taken
    salt = row["pw_salt"] if row else b"\0" * 16
    expected = row["pw_hash"] if row else b"\0" * 32
    ok = passwords_match(c.password, salt, expected) and row is not None
    if not ok:
        record_fail(f"ip|{ip}")
        record_fail(f"user|{name}")
        raise HTTPException(401, "Wrong user name or password.")
    token = new_session(conn, row["id"])
    conn.commit()
    set_session_cookie(response, token)
    return {"token": token, "user": {"id": row["id"], "username": row["username"]}}


@router.post("/logout")
def logout(request: Request, response: Response, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    token = session_token(request.headers.get("authorization"), request)
    if token:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
        conn.commit()
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(request: Request, response: Response, user: CurrentUser) -> dict:
    # migrate legacy Bearer-only clients onto the HttpOnly cookie
    token = session_token(request.headers.get("authorization"), request)
    if token:
        set_session_cookie(response, token)
    return {"user": user}
