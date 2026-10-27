"""Ending a session: mark it ended and make sure its feedback is being written."""
from __future__ import annotations

from fastapi import HTTPException

from dc_platform import jobs

from . import sessions

IN_PROGRESS = {jobs.QUEUED, jobs.RUNNING}


def _feedback_is_pending(user_id: int, job_id: str | None) -> bool:
    return bool(job_id) and jobs.get_job(user_id, job_id or "")["status"] in IN_PROGRESS


def end(user_id: int, session_id: int) -> str | None:
    """End the session (once) and return the id of the job writing its feedback. Calling again retries a feedback job that failed."""
    row = sessions.get_row(user_id, session_id)
    if row["status"] not in (sessions.ACTIVE, sessions.ENDED):
        raise HTTPException(409, "That interview has not started.")
    if sessions.feedback_of(user_id, session_id) or _feedback_is_pending(user_id, row["feedback_job_id"]):
        return row["feedback_job_id"]
    if row["status"] == sessions.ACTIVE:
        sessions.mark_ended(user_id, session_id)
    job_id = jobs.enqueue(user_id, "interview.feedback", {"session_id": session_id})
    sessions.set_feedback_job(user_id, session_id, job_id)
    return job_id
