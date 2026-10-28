"""Uploaded files stored as blobs (so Litestream replicates them), with a per-file cap and a per-user quota."""
from __future__ import annotations

import os
import time
from typing import Any

from fastapi import HTTPException, Request

from db import open_db


def max_file_bytes() -> int:
    return int(os.environ.get("MAX_FILE_BYTES", str(5 * 1024 * 1024)))


def user_quota_bytes() -> int:
    return int(os.environ.get("FILES_QUOTA_BYTES", str(50 * 1024 * 1024)))


def used_bytes(user_id: int) -> int:
    with open_db() as db:
        return int(db.execute("SELECT COALESCE(SUM(size), 0) FROM files WHERE user_id=?", (user_id,)).fetchone()[0])


async def read_upload(request: Request) -> bytes:
    """Read a raw request body up to the per-file cap. Shared by every module that accepts file bytes."""
    from dc_platform.http_body import read_capped

    return await read_capped(request)


def save_file(user_id: int, name: str, mime: str, data: bytes, text: str | None = None) -> int:
    if not data:
        raise HTTPException(400, "The file is empty.")
    if len(data) > max_file_bytes():
        raise HTTPException(413, f"File is larger than {max_file_bytes() // (1024 * 1024)} MB.")
    with open_db() as db, db:
        used = int(db.execute("SELECT COALESCE(SUM(size), 0) FROM files WHERE user_id=?", (user_id,)).fetchone()[0])
        if used + len(data) > user_quota_bytes():
            raise HTTPException(413, "Storage limit reached. Delete a file first.")
        cur = db.execute(
            "INSERT INTO files(user_id, name, mime, size, data, text, created) VALUES (?,?,?,?,?,?,?)",
            (user_id, name[:200], mime[:100], len(data), data, text, int(time.time() * 1000)),
        )
        return int(cur.lastrowid or 0)


def get_file(user_id: int, file_id: int) -> dict[str, Any]:
    """The file if it belongs to this user; 404 otherwise (same answer for 'missing' and 'not yours')."""
    with open_db() as db:
        row = db.execute("SELECT * FROM files WHERE id=? AND user_id=?", (file_id, user_id)).fetchone()
    if not row:
        raise HTTPException(404, "File not found.")
    return dict(row)


def set_text(user_id: int, file_id: int, text: str) -> None:
    get_file(user_id, file_id)
    with open_db() as db, db:
        db.execute("UPDATE files SET text=? WHERE id=? AND user_id=?", (text, file_id, user_id))


def delete_file(user_id: int, file_id: int) -> None:
    get_file(user_id, file_id)
    with open_db() as db, db:
        db.execute("DELETE FROM files WHERE id=? AND user_id=?", (file_id, user_id))
