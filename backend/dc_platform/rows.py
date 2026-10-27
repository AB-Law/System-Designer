"""Small helpers every module's database code shares."""
from __future__ import annotations

import time
from typing import Any

from fastapi import HTTPException

from db import open_db


def now() -> int:
    return int(time.time() * 1000)


def owned(sql: str, params: tuple[Any, ...], what: str) -> Any:
    """The one row a query finds, or a 404. The query must filter by user_id, so 'missing' and 'not yours' look the same."""
    with open_db() as db:
        row = db.execute(sql, params).fetchone()
    if not row:
        raise HTTPException(404, f"{what} not found.")
    return row
