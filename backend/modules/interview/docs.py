"""Reference documents a user uploads for interview practice. Scope is global or per-role; vectors live in the platform store."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import HTTPException

from db import open_db
from dc_platform import embeddings, files, jobs
from dc_platform.rows import now, owned

SCOPE_GLOBAL = "global"
SCOPE_ROLE = "role"
SCOPES = {SCOPE_GLOBAL, SCOPE_ROLE}

QUEUED, RUNNING, READY, FAILED = "queued", "running", "ready", "failed"
TRANSITIONS = {
    QUEUED: {RUNNING, FAILED},
    RUNNING: {READY, FAILED},
    READY: {QUEUED, RUNNING},  # re-embed
    FAILED: {QUEUED, RUNNING},
}

MIN_TEXT = 40
SOURCE_KIND = embeddings.SOURCE_DOC


def get_row(user_id: int, doc_id: int) -> Any:
    return owned("SELECT * FROM interview_docs WHERE id=? AND user_id=?", (doc_id, user_id), "Document")


def public(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "scope": row["scope"],
        "roleId": row["role_id"],
        "status": row["status"],
        "error": row["error"],
        "chunkCount": row["chunk_count"],
        "jobId": row["job_id"],
        "bytes": row["bytes"],
        "created": row["created"],
        "updated": row["updated"],
    }


def list_docs(user_id: int, *, role_id: int | None = None) -> list[dict[str, Any]]:
    with open_db() as db:
        if role_id is None:
            rows = db.execute(
                "SELECT * FROM interview_docs WHERE user_id=? ORDER BY created DESC, id DESC", (user_id,)
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM interview_docs WHERE user_id=? AND (scope=? OR (scope=? AND role_id=?)) "
                "ORDER BY created DESC, id DESC",
                (user_id, SCOPE_GLOBAL, SCOPE_ROLE, role_id),
            ).fetchall()
    return [public(r) for r in rows]


def ready_ids_for_role(user_id: int, role_id: int) -> list[int]:
    with open_db() as db:
        rows = db.execute(
            "SELECT id FROM interview_docs WHERE user_id=? AND status=? AND (scope=? OR (scope=? AND role_id=?))",
            (user_id, READY, SCOPE_GLOBAL, SCOPE_ROLE, role_id),
        ).fetchall()
    return [int(r["id"]) for r in rows]


def _set(user_id: int, doc_id: int, **fields: Any) -> None:
    fields["updated"] = now()
    with open_db() as db, db:
        db.execute(
            f"UPDATE interview_docs SET {', '.join(f'{k}=?' for k in fields)} WHERE id=? AND user_id=?",
            (*fields.values(), doc_id, user_id),
        )


def _transition(user_id: int, doc_id: int, status: str, **fields: Any) -> None:
    row = get_row(user_id, doc_id)
    allowed = TRANSITIONS.get(row["status"], set())
    if status not in allowed and status != row["status"]:
        raise HTTPException(409, f"Document cannot move from {row['status']} to {status}.")
    _set(user_id, doc_id, status=status, **fields)


def create(
    user_id: int,
    *,
    name: str,
    mime: str,
    data: bytes,
    text: str,
    scope: Literal["global", "role"],
    role_id: int | None,
) -> dict[str, Any]:
    if scope not in SCOPES:
        raise HTTPException(400, "Scope must be global or role.")
    if scope == SCOPE_ROLE and role_id is None:
        raise HTTPException(400, "Pick a role for a role-scoped document.")
    if scope == SCOPE_GLOBAL:
        role_id = None
    elif role_id is not None:
        from . import roles

        roles.get_row(user_id, role_id)
    if len(text.strip()) < MIN_TEXT:
        raise HTTPException(422, "No readable text was found. If this is a scanned file, upload a text-based PDF, DOCX, TXT or MD.")

    file_id = files.save_file(user_id, name, mime, data, text=text)
    t = now()
    with open_db() as db, db:
        cur = db.execute(
            "INSERT INTO interview_docs(user_id, file_id, name, scope, role_id, status, error, chunk_count, job_id, bytes, created, updated) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (user_id, file_id, name[:200], scope, role_id, QUEUED, None, 0, None, len(data), t, t),
        )
        doc_id = int(cur.lastrowid or 0)
    job_id = jobs.enqueue(user_id, "interview.embed", {"doc_id": doc_id})
    _set(user_id, doc_id, job_id=job_id)
    return public(get_row(user_id, doc_id))


def delete(user_id: int, doc_id: int) -> None:
    row = get_row(user_id, doc_id)
    embeddings.delete_source(user_id, SOURCE_KIND, doc_id)
    with open_db() as db, db:
        db.execute("DELETE FROM interview_docs WHERE id=? AND user_id=?", (doc_id, user_id))
    try:
        files.delete_file(user_id, row["file_id"])
    except HTTPException:
        pass


def mark_running(user_id: int, doc_id: int) -> None:
    _transition(user_id, doc_id, RUNNING, error=None)


def mark_ready(user_id: int, doc_id: int, chunk_count: int) -> None:
    _transition(user_id, doc_id, READY, chunk_count=chunk_count, error=None)


def mark_failed(user_id: int, doc_id: int, error: str) -> None:
    _transition(user_id, doc_id, FAILED, error=error[:300])


def file_text(user_id: int, doc_id: int) -> str:
    row = get_row(user_id, doc_id)
    f = files.get_file(user_id, row["file_id"])
    return f.get("text") or ""


def chunks(user_id: int, doc_id: int) -> list[dict[str, Any]]:
    get_row(user_id, doc_id)
    return embeddings.list_chunks(user_id, SOURCE_KIND, doc_id)


def reembed(user_id: int, doc_id: int) -> dict[str, Any]:
    get_row(user_id, doc_id)
    job_id = jobs.enqueue(user_id, "interview.reembed", {"doc_id": doc_id})
    _transition(user_id, doc_id, QUEUED, job_id=job_id, error=None)
    return public(get_row(user_id, doc_id))
