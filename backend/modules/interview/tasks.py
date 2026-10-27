"""Background jobs for the interview module: planning a session and writing its feedback."""
from __future__ import annotations

from typing import Any

from dc_platform import jobs

from . import feedback, planner, roles, sessions, sources


def plan_job(ctx: jobs.JobContext) -> dict[str, Any]:
    uid, sid = ctx.user_id, int(ctx.payload["session_id"])
    row = sessions.get_row(uid, sid)
    try:
        role = roles.get_row(uid, row["role_id"])
        ctx.progress(0.2, "Reading the job description")
        reading = roles.jd_reading(uid, role)
        ctx.progress(0.5, "Planning the questions")
        plan = planner.build_plan(role, reading, sources.candidate_brief(uid), sessions.style_of(row), uid)
        sessions.set_plan(uid, sid, plan)
        return {"sessionId": sid, "questions": len(plan.items)}
    except jobs.JobCancelled:
        sessions.set_failed(uid, sid, "Cancelled.")
        raise
    except Exception as e:
        sessions.set_failed(uid, sid, str(getattr(e, "detail", None) or e))
        raise


def feedback_job(ctx: jobs.JobContext) -> dict[str, Any]:
    uid, sid = ctx.user_id, int(ctx.payload["session_id"])
    row = sessions.get_row(uid, sid)
    ctx.progress(0.3, "Marking your answers")
    return feedback.write(uid, sid, roles.get_row(uid, row["role_id"])["title"])


def register() -> None:
    jobs.register_handler("interview.plan", plan_job)
    jobs.register_handler("interview.feedback", feedback_job)
