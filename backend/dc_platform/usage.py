"""Per-user token accounting and a monthly quota. Every LLM call records here."""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone

from fastapi import HTTPException

from db import open_db
from rate_limit import meter


def monthly_quota() -> int:
    """Tokens per user per calendar month; 0 means no quota."""
    return int(os.environ.get("MONTHLY_TOKEN_QUOTA", "2000000"))


def _month_start_ms() -> int:
    n = datetime.now(timezone.utc)
    return int(datetime(n.year, n.month, 1, tzinfo=timezone.utc).timestamp() * 1000)


def record(user_id: int, module: str, model: str, kind: str, tokens_in: int, tokens_out: int, cost_micro: int = 0) -> None:
    with open_db() as db, db:
        db.execute(
            "INSERT INTO usage(user_id, module, model, kind, tokens_in, tokens_out, cost_micro, created) VALUES (?,?,?,?,?,?,?,?)",
            (user_id, module, model, kind, tokens_in, tokens_out, cost_micro, int(time.time() * 1000)),
        )


def month_tokens(user_id: int) -> int:
    with open_db() as db:
        row = db.execute(
            "SELECT COALESCE(SUM(tokens_in + tokens_out), 0) FROM usage WHERE user_id=? AND created>=?",
            (user_id, _month_start_ms()),
        ).fetchone()
    return int(row[0])


def summary(user_id: int) -> dict[str, int]:
    return {"monthTokens": month_tokens(user_id), "quota": monthly_quota()}


def check_quota(user_id: int, *, rate_limited: bool = True) -> None:
    """Call before spending: rate-limits the user (existing meter) and rejects once the month's quota is used.

    Bulk work such as embedding a document passes rate_limited=False: it is paid for by the monthly quota only,
    so one large upload cannot use up the calls that interviews and scoring need.
    """
    if rate_limited:
        meter(f"llm|{user_id}", limit=int(os.environ.get("LLM_CALLS_PER_10MIN", "60")), window=600.0)
    quota = monthly_quota()
    if quota and month_tokens(user_id) >= quota:
        raise HTTPException(429, "Monthly AI usage limit reached.")
