"""SQLite-backed rate limiting (survives restarts)."""
from __future__ import annotations

import time

from fastapi import HTTPException

from db import open_db


def throttle(key: str, limit: int = 8, window: float = 600.0) -> None:
    """Reject when this key already has `limit` hits inside `window` seconds (does not record)."""
    t = time.time()
    with open_db() as conn, conn:
        conn.execute("DELETE FROM rate_limits WHERE at < ?", (t - window,))
        n = conn.execute("SELECT COUNT(*) FROM rate_limits WHERE key = ? AND at >= ?", (key, t - window)).fetchone()[0]
    if n >= limit:
        raise HTTPException(429, "Too many attempts. Wait a few minutes and try again.")


def record_fail(key: str) -> None:
    with open_db() as conn, conn:
        conn.execute("INSERT INTO rate_limits(key, at) VALUES (?,?)", (key, time.time()))


def meter(key: str, limit: int = 8, window: float = 600.0) -> None:
    """Record one use and reject when the window is already full (for AI proxy, etc.)."""
    throttle(key, limit=limit, window=window)
    record_fail(key)
