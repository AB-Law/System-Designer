"""Passwords, session tokens, and HttpOnly cookies."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from typing import Any

from fastapi import Request, Response

from db import open_db

SESSION_DAYS = 30
SESSION_COOKIE = "dc_session"


def now_ms() -> int:
    return int(time.time() * 1000)


def hash_password(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)


def client_host(request: Request) -> str:
    return request.client.host if request.client else "?"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_session(conn: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    t = now_ms()
    conn.execute("DELETE FROM sessions WHERE expires < ?", (t,))
    conn.execute("INSERT INTO sessions VALUES (?,?,?,?)", (token_hash(token), user_id, t, t + SESSION_DAYS * 86_400_000))
    return token


def bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


def session_token(authorization: str | None, request: Request | None = None) -> str | None:
    token = bearer(authorization)
    if token:
        return token
    if request is not None:
        cookie = request.cookies.get(SESSION_COOKIE)
        if cookie:
            return cookie.strip() or None
    return None


def cookie_secure() -> bool:
    return os.environ.get("COOKIE_SECURE", "").strip().lower() in {"1", "true", "yes"}


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_DAYS * 86_400,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/api",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE, path="/api")


def user_from(authorization: str | None, request: Request | None = None) -> dict[str, Any] | None:
    token = session_token(authorization, request)
    if not token:
        return None
    with open_db() as conn:
        row = conn.execute(
            "SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?",
            (token_hash(token), now_ms()),
        ).fetchone()
    return dict(row) if row else None


def passwords_match(password: str, salt: bytes, expected_hash: bytes) -> bool:
    return hmac.compare_digest(hash_password(password, salt), expected_hash)
