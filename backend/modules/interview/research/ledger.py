"""Spend limits for the shared search allowance: a monthly ledger per provider and a run quota per user."""
from __future__ import annotations

import time

from fastapi import HTTPException

from db import open_db

from . import config


def month() -> str:
    return time.strftime("%Y-%m", time.gmtime())


class DbLedger:
    """What each provider has been asked to spend this month, kept in research_usage (implements dc_platform.search.Ledger)."""

    def spent(self, provider: str) -> int:
        with open_db() as db:
            row = db.execute("SELECT units FROM research_usage WHERE provider=? AND month=?", (provider, month())).fetchone()
        return int(row["units"]) if row else 0

    def add(self, provider: str, units: int) -> None:
        if units <= 0:
            return
        with open_db() as db, db:
            db.execute(
                "INSERT INTO research_usage(provider, month, units) VALUES (?,?,?) "
                "ON CONFLICT(provider, month) DO UPDATE SET units = units + excluded.units",
                (provider, month(), units),
            )


def consume_run(user_id: int) -> None:
    """Count one research run for this user this month, or refuse (429) when they have used their share."""
    limit = config.runs_per_month()
    with open_db() as db, db:
        db.execute("INSERT OR IGNORE INTO research_user_quota(user_id, month, runs) VALUES (?,?,0)", (user_id, month()))
        counted = db.execute(
            "UPDATE research_user_quota SET runs = runs + 1 WHERE user_id=? AND month=? AND runs < ?", (user_id, month(), limit),
        ).rowcount
    if not counted:
        raise HTTPException(429, f"You have used your {limit} question searches for this month. Questions already found are still available.")
