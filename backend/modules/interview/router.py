"""Interview module API, mounted at /api/interview. Every route needs a signed-in user and only ever sees that user's rows."""
from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator

from dc_platform import files, jobs, stt
from deps import CurrentUser
from modules import feature_on
from rate_limit import meter

from . import conversation, docs, lifecycle, portability, roles, sessions, sources, views
from .schemas import Style

router = APIRouter(tags=["interview"])

MIN_JD = 40
MAX_JD = 60_000
MAX_ANSWER = 8_000
VOICE_FLAG = "interview.voice"


# ---------------------------------------------------------------- roles

class RoleIn(BaseModel):
    title: str = Field(default="", max_length=120)
    level: str = Field(default="", max_length=40)
    company: str | None = Field(default=None, max_length=120)
    jdText: str | None = Field(default=None, min_length=MIN_JD, max_length=MAX_JD)
    scoreRunId: int | None = None

    @model_validator(mode="after")
    def _needs_a_title(self) -> RoleIn:
        if not self.title.strip() and self.scoreRunId is None:
            raise ValueError("Give the role a title.")
        return self


class RolePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    level: str | None = Field(default=None, max_length=40)
    company: str | None = Field(default=None, max_length=120)
    jdText: str | None = Field(default=None, min_length=MIN_JD, max_length=MAX_JD)

    @model_validator(mode="after")
    def _title_and_level_cannot_be_cleared(self) -> RolePatch:
        if any(f in self.model_fields_set and getattr(self, f) is None for f in ("title", "level")):
            raise ValueError("A role needs a title and a level (it can be empty text).")
        return self


@router.post("/jd/upload")
async def upload_jd(request: Request, user: CurrentUser, name: str = Query(max_length=200)) -> dict[str, str]:
    """Turn a job description file into text for the role form. Nothing is stored."""
    data = await files.read_upload(request)

    def work() -> dict[str, str]:
        meter(f"interview_doc|{user['id']}", limit=30)
        text = sources.read_text(data, name).replace("\f", "\n").strip()
        if len(text) < MIN_JD:
            raise HTTPException(422, "No readable text was found. If this is a scanned file, upload a text-based PDF or a DOCX.")
        return {"text": text[:MAX_JD]}

    return await run_in_threadpool(work)


@router.get("/export")
def export_data(user: CurrentUser) -> dict[str, Any]:
    return portability.export_all(user["id"])


@router.delete("/data")
def delete_data(user: CurrentUser) -> dict[str, bool]:
    portability.delete_all(user["id"])
    return {"ok": True}


@router.post("/roles")
def create_role(body: RoleIn, user: CurrentUser) -> dict[str, Any]:
    return roles.create(
        user["id"], title=body.title.strip(), level=body.level.strip(), company=body.company, jd_text=body.jdText, score_run_id=body.scoreRunId,
    )


@router.get("/roles")
def list_roles(user: CurrentUser) -> list[dict[str, Any]]:
    return roles.list_roles(user["id"])


@router.patch("/roles/{role_id:int}")
def patch_role(role_id: int, body: RolePatch, user: CurrentUser) -> dict[str, Any]:
    return roles.update(user["id"], role_id, body.model_dump(exclude_unset=True))


@router.delete("/roles/{role_id:int}")
def delete_role(role_id: int, user: CurrentUser) -> dict[str, bool]:
    roles.delete(user["id"], role_id)
    return {"ok": True}


# ---------------------------------------------------------------- sessions

class SessionIn(BaseModel):
    roleId: int
    style: Style = Field(default_factory=Style)


class TurnIn(BaseModel):
    """The candidate's answer. Left out, it asks for the reply the interviewer still owes (the first line, or after a dropped connection)."""

    text: str | None = Field(default=None, max_length=MAX_ANSWER)

    @field_validator("text")
    @classmethod
    def _not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("Write an answer first.")
        return v.strip() if v is not None else None


@router.post("/sessions")
def start_session(body: SessionIn, user: CurrentUser) -> dict[str, Any]:
    """Create the session and queue its plan; the job id lets the page follow the preparation."""
    uid = user["id"]
    meter(f"interview_session|{uid}", limit=20)
    roles.get_row(uid, body.roleId)
    session_id = sessions.create(uid, body.roleId, body.style)
    job_id = jobs.enqueue(uid, "interview.plan", {"session_id": session_id})
    sessions.set_plan_job(uid, session_id, job_id)
    return {"id": session_id, "jobId": job_id}


@router.get("/sessions")
def list_sessions(user: CurrentUser, role_id: int | None = None) -> list[dict[str, Any]]:
    return sessions.list_sessions(user["id"], role_id)


@router.get("/sessions/{session_id:int}")
def get_session(session_id: int, user: CurrentUser) -> dict[str, Any]:
    return views.session_detail(user["id"], session_id)


def _sse(events: Iterator[dict[str, Any]]) -> Iterator[str]:
    yield ": open\n\n"
    for event in events:
        yield f"data: {json.dumps(event)}\n\n"


@router.post("/sessions/{session_id:int}/turn")
def take_turn(session_id: int, body: TurnIn, user: CurrentUser) -> StreamingResponse:
    """Send an answer and stream the interviewer's reply as server-sent events: start, delta..., done (or error)."""
    uid = user["id"]
    prepared = conversation.prepare(uid, session_id, body.text)
    return StreamingResponse(
        _sse(conversation.run(prepared, uid, session_id)), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/sessions/{session_id:int}/end")
def end_session(session_id: int, user: CurrentUser) -> dict[str, Any]:
    """End the interview now and start writing the feedback. Safe to call again: it retries feedback that failed."""
    job_id = lifecycle.end(user["id"], session_id)
    if job_id is None:
        raise HTTPException(500, "Feedback could not be started.")
    return {"jobId": job_id}


@router.post("/sessions/{session_id:int}/transcribe")
async def transcribe_turn(session_id: int, request: Request, user: CurrentUser) -> dict[str, str]:
    """Turn a short audio clip into text. Audio is not stored. Requires the `interview.voice` flag."""
    if not feature_on(VOICE_FLAG):
        raise HTTPException(404, "Voice input is not enabled.")
    uid = user["id"]
    row = sessions.get_row(uid, session_id)
    if row["status"] != sessions.ACTIVE:
        raise HTTPException(409, conversation.NOT_READY.get(row["status"], "That interview is not running."))
    data = await files.read_upload(request)
    mime = request.headers.get("content-type", "application/octet-stream")

    def work() -> dict[str, str]:
        meter(f"interview_transcribe|{uid}", limit=60)
        try:
            text = stt.transcribe_for_user(uid, data, mime=mime, module="interview")
        except stt.SttNoSpeechError as e:
            raise HTTPException(422, str(e)) from e
        except stt.SttUnavailableError as e:
            raise HTTPException(503, str(e)) from e
        except stt.SttError as e:
            raise HTTPException(502, str(e)) from e
        return {"text": text}

    return await run_in_threadpool(work)


@router.delete("/sessions/{session_id:int}")
def delete_session(session_id: int, user: CurrentUser) -> dict[str, bool]:
    sessions.delete(user["id"], session_id)
    return {"ok": True}


# ---------------------------------------------------------------- docs

@router.post("/docs")
async def upload_doc(
    request: Request,
    user: CurrentUser,
    name: str = Query(max_length=200),
    scope: Literal["global", "role"] = Query(default="global"),
    roleId: int | None = Query(default=None),
) -> dict[str, Any]:
    data = await files.read_upload(request)
    mime = request.headers.get("content-type", "application/octet-stream")

    def work() -> dict[str, Any]:
        uid = user["id"]
        meter(f"interview_doc|{uid}", limit=30)
        return docs.create(uid, name=name, mime=mime, data=data, text=sources.read_text(data, name), scope=scope, role_id=roleId)

    return await run_in_threadpool(work)


@router.get("/docs")
def list_docs(user: CurrentUser, role_id: int | None = None) -> list[dict[str, Any]]:
    return docs.list_docs(user["id"], role_id=role_id)


@router.get("/docs/{doc_id:int}")
def get_doc(doc_id: int, user: CurrentUser) -> dict[str, Any]:
    return docs.public(docs.get_row(user["id"], doc_id))


@router.get("/docs/{doc_id:int}/chunks")
def doc_chunks(doc_id: int, user: CurrentUser) -> list[dict[str, Any]]:
    return docs.chunks(user["id"], doc_id)


@router.post("/docs/{doc_id:int}/reembed")
def reembed_doc(doc_id: int, user: CurrentUser) -> dict[str, Any]:
    return docs.reembed(user["id"], doc_id)


@router.delete("/docs/{doc_id:int}")
def delete_doc(doc_id: int, user: CurrentUser) -> dict[str, bool]:
    docs.delete(user["id"], doc_id)
    return {"ok": True}
