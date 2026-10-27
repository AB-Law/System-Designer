"""The question bank for a role: the user's editable copy of what the store holds for it, plus questions they add.

The body is {"items": [...], "removed": [store ids]}. Items are snapshots, so edits and removals stay the user's
own; the shared store is only ever changed by research and by flagging. A removed item is not brought back by
the next search, and an item that has since been flagged drops out of every bank on the next refresh.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import HTTPException

from db import open_db
from dc_platform.rows import now, owned

from . import config, store
from .buckets import Bucket

RUNNING, READY, FAILED = "running", "ready", "failed"
MAX_ITEMS = 100
PROMPT_ITEMS = 12


def _empty() -> dict[str, Any]:
    return {"items": [], "removed": []}


def get_row(user_id: int, bank_id: int) -> Any:
    return owned("SELECT * FROM question_banks WHERE id=? AND user_id=?", (bank_id, user_id), "Question bank")


def by_role(user_id: int, role_id: int) -> Any | None:
    with open_db() as db:
        return db.execute("SELECT * FROM question_banks WHERE user_id=? AND role_id=?", (user_id, role_id)).fetchone()


def public(row: Any) -> dict[str, Any]:
    body = json.loads(row["body_json"])
    return {
        "id": row["id"], "roleId": row["role_id"], "status": row["status"], "error": row["error"], "jobId": row["job_id"],
        "items": body["items"], "updated": row["updated"],
    }


def list_banks(user_id: int, role_id: int | None = None) -> list[dict[str, Any]]:
    sql, params = "SELECT * FROM question_banks WHERE user_id=?", [user_id]
    if role_id is not None:
        sql, params = sql + " AND role_id=?", [*params, role_id]
    with open_db() as db:
        return [public(r) for r in db.execute(sql + " ORDER BY updated DESC", params).fetchall()]


def start(user_id: int, role_id: int) -> int:
    """Create the role's bank, or put the existing one back to 'running' for a new search. Returns its id."""
    t = now()
    with open_db() as db, db:
        db.execute(
            "INSERT INTO question_banks(user_id, role_id, body_json, status, created, updated) VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(user_id, role_id) DO UPDATE SET status=excluded.status, error=NULL, job_id=NULL, updated=excluded.updated",
            (user_id, role_id, json.dumps(_empty()), RUNNING, t, t),
        )
    return int(by_role(user_id, role_id)["id"])


def set_job(user_id: int, bank_id: int, job_id: str) -> None:
    with open_db() as db, db:
        db.execute("UPDATE question_banks SET job_id=? WHERE id=? AND user_id=?", (job_id, bank_id, user_id))


def _save(user_id: int, bank_id: int, body: dict[str, Any], status: str, error: str | None = None) -> None:
    with open_db() as db, db:
        db.execute(
            "UPDATE question_banks SET body_json=?, status=?, error=?, updated=? WHERE id=? AND user_id=?",
            (json.dumps(body), status, error, now(), bank_id, user_id),
        )


def mark_failed(user_id: int, role_id: int, error: str) -> None:
    row = by_role(user_id, role_id)
    if row:
        _save(user_id, row["id"], json.loads(row["body_json"]), FAILED, error[:300])


def merged(body: dict[str, Any], usable: list[dict[str, Any]], still_visible: set[int]) -> dict[str, Any]:
    """Keep the user's items (minus any flagged since), then add store items they have not seen or removed."""
    removed = set(body["removed"])
    kept = [i for i in body["items"] if i["storeId"] is None or i["storeId"] in still_visible]
    have = {i["storeId"] for i in kept if i["storeId"] is not None}
    room = max(0, config.bank_size() - len(kept))
    fresh = [i for i in usable if i["storeId"] not in have and i["storeId"] not in removed][:room]
    return {"items": [*kept, *fresh], "removed": sorted(removed)}


def refresh(user_id: int, role_id: int, bucket: Bucket) -> dict[str, Any]:
    """Bring the role's bank up to date from the store and mark it ready."""
    row = by_role(user_id, role_id)
    if row is None:
        raise HTTPException(404, "Question bank not found.")
    body = json.loads(row["body_json"])
    store_ids = [i["storeId"] for i in body["items"] if i["storeId"] is not None]
    body = merged(body, store.usable(user_id, bucket), store.visible_ids(store_ids))
    _save(user_id, row["id"], body, READY)
    return public(by_role(user_id, role_id))


def _manual(question: str, category: str) -> dict[str, Any]:
    return {
        "ref": f"m{uuid.uuid4().hex[:8]}", "storeId": None, "question": question, "category": category, "kind": "question",
        "sourceUrl": "", "sourceName": "", "fetched": now(),
    }


def patch(user_id: int, bank_id: int, *, remove: list[str], edit: dict[str, str], add: list[tuple[str, str]]) -> dict[str, Any]:
    """Remove items, reword items, and add the user's own questions."""
    row = get_row(user_id, bank_id)
    body = json.loads(row["body_json"])
    gone = {i["storeId"] for i in body["items"] if i["ref"] in remove and i["storeId"] is not None}
    items = [{**i, "question": edit.get(i["ref"], i["question"])} for i in body["items"] if i["ref"] not in remove]
    items += [_manual(q, c) for q, c in add]
    if len(items) > MAX_ITEMS:
        raise HTTPException(422, f"A bank holds at most {MAX_ITEMS} questions.")
    _save(user_id, bank_id, {"items": items, "removed": sorted({*body["removed"], *gone})}, row["status"], row["error"])
    return public(get_row(user_id, bank_id))


def prompt_lines(user_id: int, role_id: int) -> list[str]:
    """The role's researched questions as short lines for the planner. Empty when there is no ready bank."""
    row = by_role(user_id, role_id)
    if row is None or row["status"] != READY:
        return []
    items = json.loads(row["body_json"])["items"][:PROMPT_ITEMS]
    return [f"- ({i['category']}) {i['question']}" for i in items]


def delete_for_role(user_id: int, role_id: int) -> None:
    with open_db() as db, db:
        db.execute("DELETE FROM question_banks WHERE user_id=? AND role_id=?", (user_id, role_id))
