"""Background job handlers for the CV module."""
from __future__ import annotations

from typing import Any

from dc_platform import jobs, llm

from . import scoring, service, structure
from .structure import CVStructure, render_text


def corpus_of(version: Any, cv: CVStructure) -> str:
    """The text citations point into: the original text, or a re-render once the structure has been edited."""
    return render_text(cv) if version["edited"] else version["raw_text"]


def extract_job(ctx: jobs.JobContext) -> dict[str, Any]:
    uid, vid = ctx.user_id, int(ctx.payload["version_id"])
    version = service.version_row(uid, vid)
    ctx.progress(0.2, "Reading your CV structure")
    cv, source = structure.extract(version["raw_text"], uid)
    stored = service.update_extracted(uid, vid, cv, source)
    return {"versionId": vid, "source": source, "stored": stored}


def score_job(ctx: jobs.JobContext) -> dict[str, Any]:
    uid, run_id = ctx.user_id, int(ctx.payload["run_id"])
    row = service.get_run_row(uid, run_id)
    service.set_run_status(uid, run_id, "running")
    try:
        version = service.version_row(uid, row["cv_version_id"])
        cv = CVStructure.model_validate_json(version["structured_json"] or "{}")
        prior = service.prior_analysis(uid, row["jd_text"], row["rubric_version"])
        analysis = scoring.JDAnalysis.model_validate(prior["analysis"]) if prior else None
        result = scoring.score(
            cv, corpus_of(version, cv), row["jd_text"], uid, mode=row["mode"], progress=ctx.progress,
            analysis=analysis, jd_source=prior["source"] if prior else "reused",
        )
        try:
            model = llm.client_for(uid).adapter.model
        except llm.LLMError:
            model = ""
        service.save_run_result(uid, run_id, result, model or row["model"])
        return {"runId": run_id, "total": result["total"]}
    except jobs.JobCancelled:
        service.set_run_status(uid, run_id, "failed", "Cancelled.")
        raise
    except Exception as e:
        service.set_run_status(uid, run_id, "failed", str(getattr(e, "detail", None) or e)[:300])
        raise


def register() -> None:
    jobs.register_handler("cv.extract", extract_job)
    jobs.register_handler("cv.score", score_job)
