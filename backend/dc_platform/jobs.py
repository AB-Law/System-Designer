"""Background jobs on a SQLite table and an in-process thread pool (one process, one writer).

Modules register a handler per `kind`, then call enqueue(). Progress, result and errors live in bg_jobs,
so status survives restarts; jobs left running when the process died are re-queued by recover().
Mounted at /api/tasks (not /api/jobs, which belongs to the Jobs module).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
import uuid
from collections.abc import AsyncIterator, Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from db import open_db
from deps import CurrentUser

log = logging.getLogger("dc.jobs")

QUEUED, RUNNING, DONE, FAILED, CANCELLED = "queued", "running", "done", "failed", "cancelled"
FINAL = {DONE, FAILED, CANCELLED}


class JobCancelled(Exception):
    pass


class JobContext:
    def __init__(self, job_id: str, user_id: int, payload: dict[str, Any], cancel: threading.Event) -> None:
        self.job_id, self.user_id, self.payload, self._cancel = job_id, user_id, payload, cancel

    def check(self) -> None:
        """Handlers call this between steps; raises when the user cancelled."""
        if self._cancel.is_set():
            raise JobCancelled()

    def progress(self, fraction: float, message: str = "") -> None:
        self.check()
        _update(self.job_id, progress=max(0.0, min(1.0, fraction)), message=message[:200])


Handler = Callable[[JobContext], Any]
_handlers: dict[str, Handler] = {}
_cancels: dict[str, threading.Event] = {}
_lock = threading.Lock()
_pool: ThreadPoolExecutor | None = None


def register_handler(kind: str, fn: Handler) -> None:
    _handlers[kind] = fn


def _now() -> int:
    return int(time.time() * 1000)


def _update(job_id: str, **fields: Any) -> None:
    fields["updated"] = _now()
    cols = ", ".join(f"{k}=?" for k in fields)
    with open_db() as db, db:
        db.execute(f"UPDATE bg_jobs SET {cols} WHERE id=?", (*fields.values(), job_id))


def _executor() -> ThreadPoolExecutor:
    global _pool
    with _lock:
        if _pool is None:
            _pool = ThreadPoolExecutor(max_workers=int(os.environ.get("JOB_CONCURRENCY", "2")), thread_name_prefix="job")
        return _pool


def _run(job_id: str) -> None:
    with _lock:
        cancel = _cancels.setdefault(job_id, threading.Event())
    try:
        with open_db() as db, db:
            # claim: only a queued job starts (a job cancelled while waiting stays cancelled)
            claimed = db.execute("UPDATE bg_jobs SET status=?, updated=? WHERE id=? AND status=?", (RUNNING, _now(), job_id, QUEUED)).rowcount
            row = db.execute("SELECT user_id, kind, payload FROM bg_jobs WHERE id=?", (job_id,)).fetchone()
        if not claimed or not row:
            return
        handler = _handlers.get(row["kind"])
        if handler is None:
            _update(job_id, status=FAILED, error=f"no handler for {row['kind']}")
            return
        try:
            result = handler(JobContext(job_id, row["user_id"], json.loads(row["payload"]), cancel))
            _update(job_id, status=DONE, progress=1.0, result=json.dumps(result))
        except JobCancelled:
            _update(job_id, status=CANCELLED)
        except Exception as e:
            # the message can contain CV text or model output, so log the type only
            log.error("job %s (%s) failed: %s", job_id, row["kind"], e.__class__.__name__)
            _update(job_id, status=FAILED, error=f"{e.__class__.__name__}: {str(e)[:300]}")
    finally:
        with _lock:
            _cancels.pop(job_id, None)


def enqueue(user_id: int, kind: str, payload: dict[str, Any] | None = None) -> str:
    job_id = uuid.uuid4().hex
    t = _now()
    with open_db() as db, db:
        db.execute(
            "INSERT INTO bg_jobs(id, user_id, kind, status, payload, created, updated) VALUES (?,?,?,?,?,?,?)",
            (job_id, user_id, kind, QUEUED, json.dumps(payload or {}), t, t),
        )
    _executor().submit(_run, job_id)
    return job_id


def recover() -> int:
    """At startup: jobs that were running when the process died go back to the queue, then every queued job is submitted."""
    with open_db() as db, db:
        db.execute("UPDATE bg_jobs SET status=?, updated=? WHERE status=?", (QUEUED, _now(), RUNNING))
        ids = [r["id"] for r in db.execute("SELECT id FROM bg_jobs WHERE status=? ORDER BY created", (QUEUED,))]
    for job_id in ids:
        _executor().submit(_run, job_id)
    return len(ids)


def _public(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"], "kind": row["kind"], "status": row["status"], "progress": row["progress"],
        "message": row["message"], "result": json.loads(row["result"]) if row["result"] else None,
        "error": row["error"], "created": row["created"], "updated": row["updated"],
    }


def get_job(user_id: int, job_id: str) -> dict[str, Any]:
    with open_db() as db:
        row = db.execute("SELECT * FROM bg_jobs WHERE id=? AND user_id=?", (job_id, user_id)).fetchone()
    if not row:
        raise HTTPException(404, "Job not found.")
    return _public(row)


def cancel_job(user_id: int, job_id: str) -> dict[str, Any]:
    job = get_job(user_id, job_id)
    if job["status"] in FINAL:
        return job
    with _lock:
        ev = _cancels.get(job_id)
        if ev:
            ev.set()
    with open_db() as db, db:
        # a queued job can be cancelled right away; a running one stops at its next check()
        db.execute("UPDATE bg_jobs SET status=?, updated=? WHERE id=? AND user_id=? AND status=?", (CANCELLED, _now(), job_id, user_id, QUEUED))
    return get_job(user_id, job_id)


router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/{job_id}")
def job_status(job_id: str, user: CurrentUser) -> dict[str, Any]:
    return get_job(user["id"], job_id)


@router.post("/{job_id}/cancel")
def job_cancel(job_id: str, user: CurrentUser) -> dict[str, Any]:
    return cancel_job(user["id"], job_id)


@router.get("/{job_id}/events")
async def job_events(job_id: str, user: CurrentUser) -> StreamingResponse:
    get_job(user["id"], job_id)  # 404 before the stream opens

    async def gen() -> AsyncIterator[str]:
        last = ""
        while True:
            job = await asyncio.to_thread(get_job, user["id"], job_id)
            frame = json.dumps({k: job[k] for k in ("status", "progress", "message", "error")})
            if frame != last:
                last = frame
                yield f"data: {frame}\n\n"
            if job["status"] in FINAL:
                return
            await asyncio.sleep(0.4)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
