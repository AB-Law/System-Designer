"""Background jobs for the interview module: planning, feedback, and document embedding."""
from __future__ import annotations

from typing import Any

from dc_platform import embeddings, jobs
from modules import feature_on

from . import docs, feedback, planner, roles, sessions, sources
from .research import banks as research_banks
from .research import config as research_config
from .research import routes as research_routes
from .research import run as research_run

SOURCE_KIND = docs.SOURCE_KIND


def plan_job(ctx: jobs.JobContext) -> dict[str, Any]:
    uid, sid = ctx.user_id, int(ctx.payload["session_id"])
    row = sessions.get_row(uid, sid)
    try:
        role = roles.get_row(uid, row["role_id"])
        ctx.progress(0.2, "Reading the job description")
        reading = roles.jd_reading(uid, role)
        ctx.progress(0.5, "Planning the questions")
        researched = research_banks.prompt_lines(uid, role["id"]) if feature_on(research_config.FLAG) else []
        style = sessions.style_of(row)
        plan = planner.build_plan(role, reading, sources.candidate_brief(uid) if style.useCv else "", style, uid, researched=researched)
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
    role = roles.get_row(uid, row["role_id"])
    job = roles.job_text(role) if role["jd_text"] else ""  # from the reading stored when the plan was made
    return feedback.write(uid, sid, role["title"], job)


def _embed_doc(ctx: jobs.JobContext) -> dict[str, Any]:
    uid, doc_id = ctx.user_id, int(ctx.payload["doc_id"])
    docs.get_row(uid, doc_id)
    try:
        docs.mark_running(uid, doc_id)
        text = docs.file_text(uid, doc_id)
        ctx.progress(0.05, "Chunking the document")

        def progress(fraction: float, message: str = "") -> None:
            ctx.progress(0.05 + 0.9 * fraction, message)

        result = embeddings.embed_and_store(
            uid, SOURCE_KIND, doc_id, text, module="interview", progress=progress, check=ctx.check,
        )
        docs.mark_ready(uid, doc_id, int(result["chunks"]))
        ctx.progress(1.0, "Ready")
        return {"docId": doc_id, **result}
    except jobs.JobCancelled:
        docs.mark_failed(uid, doc_id, "Cancelled.")
        raise
    except Exception as e:
        docs.mark_failed(uid, doc_id, str(getattr(e, "detail", None) or e))
        raise


def embed_job(ctx: jobs.JobContext) -> dict[str, Any]:
    return _embed_doc(ctx)


def reembed_job(ctx: jobs.JobContext) -> dict[str, Any]:
    return _embed_doc(ctx)


def register() -> None:
    jobs.register_handler("interview.plan", plan_job)
    jobs.register_handler("interview.feedback", feedback_job)
    jobs.register_handler("interview.embed", embed_job)
    jobs.register_handler("interview.reembed", reembed_job)
    jobs.register_handler(research_routes.JOB_KIND, research_run.job)
