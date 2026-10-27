"""Interview module API, mounted at /api/interview. Every route needs a signed-in user and only ever sees that user's rows."""
from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator

from dc_platform import jobs
from deps import CurrentUser
from rate_limit import meter

from . import conversation, lifecycle, roles, sessions, views
from .schemas import Style

router = APIRouter(tags=["interview"])

MIN_JD = 40
MAX_JD = 60_000
MAX_ANSWER = 8_000


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


@router.delete("/sessions/{session_id:int}")
def delete_session(session_id: int, user: CurrentUser) -> dict[str, bool]:
    sessions.delete(user["id"], session_id)
    return {"ok": True}
