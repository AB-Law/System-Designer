"""CV module API, mounted at /api/cv. Every route needs a signed-in user and only ever sees that user's rows."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from dc_platform import files, jobs, llm
from deps import CurrentUser
from rate_limit import meter

from . import parsing, rewrites, rubric, service
from .rules_parser import parse_rules
from .structure import CVStructure, clamp

router = APIRouter(tags=["cv"])

MIN_TEXT = 40


def _parse_or_422(data: bytes, name: str) -> parsing.Parsed:
    parsed = parsing.parse_bytes(data, name)
    if len(parsed.text.strip()) < MIN_TEXT:
        raise HTTPException(422, "No readable text was found. If this is a scanned file, upload a text-based PDF or a DOCX.")
    return parsed


# ---------------------------------------------------------------- JD and CV upload

@router.post("/jd/upload")
async def upload_jd(request: Request, user: CurrentUser, name: str = Query(max_length=200)) -> dict[str, Any]:
    """Turn a JD file into text for the score form. Nothing is stored."""
    data = await files.read_upload(request)

    def work() -> dict[str, Any]:
        meter(f"cv_upload|{user['id']}", limit=30)
        p = _parse_or_422(data, name)
        return {"text": p.text.replace(parsing.PAGE_BREAK, "").strip(), "parseQuality": p.quality, "warnings": p.warnings}

    return await run_in_threadpool(work)


@router.post("/upload")
async def upload_cv(request: Request, user: CurrentUser, name: str = Query(max_length=200), cvName: str = Query(default="", max_length=120)) -> dict[str, Any]:
    data = await files.read_upload(request)
    mime = request.headers.get("content-type", "application/octet-stream")

    def work() -> dict[str, Any]:
        uid = user["id"]
        meter(f"cv_upload|{uid}", limit=30)
        p = _parse_or_422(data, name)
        file_id = files.save_file(uid, name, mime, data, text=p.text)
        # the rules parser gives a usable structure at once; a background job replaces it with the model's reading
        cv_id, version_id = service.create_cv(
            uid, cvName.strip() or name.rsplit(".", 1)[0] or "CV", file_id=file_id, raw_text=p.text, quality=p.quality,
            warnings=p.warnings, structure=parse_rules(p.text), source="rules",
        )
        job_id = jobs.enqueue(uid, "cv.extract", {"version_id": version_id})
        return {**service.get_cv(uid, cv_id), "jobId": job_id}

    return await run_in_threadpool(work)


# ---------------------------------------------------------------- scoring (static paths before /{cv_id})

class JDIn(BaseModel):
    text: str = Field(min_length=MIN_TEXT, max_length=60_000)
    title: str = Field(default="", max_length=200)


class ScoreIn(BaseModel):
    cvId: int | None = None
    mode: Literal["fast", "deep"] = "fast"
    jds: list[JDIn] = Field(min_length=1, max_length=5)


def _model_name(uid: int) -> str:
    try:
        return llm.client_for(uid).adapter.model
    except llm.LLMError:
        return ""


def _queue(uid: int, version_id: int, jd: JDIn, mode: str, rescored_from: int | None = None) -> dict[str, Any]:
    run_id, cached = service.create_run(
        uid, version_id, jd_text=jd.text.strip(), jd_title=jd.title.strip(), mode=mode, rubric_version=rubric.RUBRIC_VERSION,
        model=_model_name(uid), rescored_from=rescored_from,
    )
    if not cached:
        service.set_run_job(uid, run_id, jobs.enqueue(uid, "cv.score", {"run_id": run_id}))
    row = service.get_run_row(uid, run_id)
    return {"id": run_id, "jobId": row["job_id"], "cached": cached, "status": row["status"]}


@router.post("/score")
def start_score(body: ScoreIn, user: CurrentUser) -> dict[str, Any]:
    uid = user["id"]
    meter(f"cv_score|{uid}", limit=30)
    if body.cvId is None:
        active = service.active_cv(uid)
        if not active:
            raise HTTPException(400, "Upload a CV first.")
        cv_id = active["id"]
    else:
        cv_id = body.cvId
    version = service.latest_version_row(uid, cv_id)
    return {"runs": [_queue(uid, version["id"], jd, body.mode) for jd in body.jds]}


@router.get("/score/history")
def history(user: CurrentUser, band: Literal["strong", "fair", "weak"] | None = None, cvId: int | None = None) -> list[dict[str, Any]]:
    return service.list_runs(user["id"], band=band, cv_id=cvId)


@router.get("/score/{run_id:int}")
def get_score(run_id: int, user: CurrentUser) -> dict[str, Any]:
    return service.get_run(user["id"], run_id)


@router.delete("/score/{run_id:int}")
def delete_score(run_id: int, user: CurrentUser) -> dict[str, bool]:
    service.delete_run(user["id"], run_id)
    return {"ok": True}


@router.get("/score/{run_id:int}/rewrites")
def list_rewrites(run_id: int, user: CurrentUser) -> list[dict[str, Any]]:
    service.get_run_row(user["id"], run_id)
    return service.list_rewrites(user["id"], run_id)


@router.post("/score/{run_id:int}/rewrites")
def make_rewrites(run_id: int, user: CurrentUser) -> list[dict[str, Any]]:
    uid = user["id"]
    run = service.get_run_row(uid, run_id)
    if run["status"] != "done":
        raise HTTPException(409, "Wait for the score to finish first.")
    version = service.version_row(uid, run["cv_version_id"])
    cv = service.structure_of(version)
    gaps = service.get_run(uid, run_id)["analysis"].get("gaps", [])
    try:
        items = rewrites.generate(cv, gaps, uid)
    except llm.LLMError as e:
        raise HTTPException(503, f"The AI could not write suggestions: {str(e)[:160]}") from e
    return service.replace_rewrites(uid, run_id, items)


class RewritePatch(BaseModel):
    status: Literal["pending", "approved", "rejected"] | None = None
    proposed: str | None = Field(default=None, min_length=1, max_length=800)


@router.patch("/rewrites/{rewrite_id:int}")
def patch_rewrite(rewrite_id: int, body: RewritePatch, user: CurrentUser) -> dict[str, Any]:
    if service.get_rewrite(user["id"], rewrite_id)["status"] == "applied":
        raise HTTPException(409, "That suggestion was already applied.")
    return service.update_rewrite(user["id"], rewrite_id, status=body.status, proposed=body.proposed)


class RescoreIn(BaseModel):
    mode: Literal["fast", "deep"] | None = None


@router.post("/score/{run_id:int}/rescore")
def rescore(run_id: int, user: CurrentUser, body: RescoreIn | None = None) -> dict[str, Any]:
    """Apply the approved suggestions to a new CV version (the original is kept), then score it against the same JD."""
    uid = user["id"]
    meter(f"cv_score|{uid}", limit=30)
    run = service.get_run_row(uid, run_id)
    base = service.version_row(uid, run["cv_version_id"])
    latest = service.latest_version_row(uid, base["cv_id"])
    approved = [r for r in service.list_rewrites(uid, run_id) if r["status"] == "approved"]
    version_id = latest["id"]
    if approved:
        cv, applied = rewrites.apply(service.structure_of(latest), approved)
        if not applied:
            raise HTTPException(409, "Those suggestions no longer match your CV text.")
        version_id = service.add_version(
            uid, base["cv_id"], file_id=latest["file_id"], raw_text=service.corpus_of(latest),
            quality=latest["parse_quality"], warnings=[], structure=cv, source="rewrite", edited=True,
        )
        service.mark_applied(uid, applied)
    elif latest["id"] == run["cv_version_id"]:
        raise HTTPException(400, "Approve at least one suggestion, or edit your CV, before re-scoring.")
    return {**_queue(uid, version_id, JDIn(text=run["jd_text"], title=run["jd_title"]), (body.mode if body and body.mode else run["mode"]), run_id), "cvVersionId": version_id}


# ---------------------------------------------------------------- export and delete-all

@router.get("/export")
def export(user: CurrentUser) -> dict[str, Any]:
    return service.export_all(user["id"])


@router.delete("/data")
def delete_data(user: CurrentUser) -> dict[str, bool]:
    service.delete_all(user["id"])
    return {"ok": True}


@router.get("/active")
def active(user: CurrentUser) -> dict[str, Any]:
    cv = service.active_cv(user["id"])
    if not cv:
        raise HTTPException(404, "No active CV.")
    return cv


# ---------------------------------------------------------------- library

@router.get("")
def list_cvs(user: CurrentUser) -> list[dict[str, Any]]:
    return service.list_cvs(user["id"])


@router.get("/{cv_id:int}")
def get_cv(cv_id: int, user: CurrentUser) -> dict[str, Any]:
    return service.get_cv(user["id"], cv_id)


class RenameIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


@router.patch("/{cv_id:int}")
def rename(cv_id: int, body: RenameIn, user: CurrentUser) -> dict[str, Any]:
    service.rename_cv(user["id"], cv_id, body.name)
    return service.get_cv(user["id"], cv_id)


@router.patch("/{cv_id:int}/structure")
def edit_structure(cv_id: int, body: CVStructure, user: CurrentUser) -> dict[str, Any]:
    """Save the user's corrections as a new version; earlier versions and their scores stay as they were."""
    uid = user["id"]
    latest = service.latest_version_row(uid, cv_id)
    service.add_version(
        uid, cv_id, file_id=latest["file_id"], raw_text=latest["raw_text"], quality=latest["parse_quality"],
        warnings=[], structure=clamp(body), source="edited", edited=True,
    )
    return service.get_cv(uid, cv_id)


@router.post("/{cv_id:int}/extract")
def re_extract(cv_id: int, user: CurrentUser) -> dict[str, str]:
    """Ask the model to read the original text again. Only works while the structure has not been edited by hand."""
    uid = user["id"]
    latest = service.latest_version_row(uid, cv_id)
    if latest["edited"]:
        raise HTTPException(409, "You have edited this CV. Re-reading it would overwrite your changes.")
    meter(f"cv_upload|{uid}", limit=30)
    return {"jobId": jobs.enqueue(uid, "cv.extract", {"version_id": latest["id"]})}


@router.post("/{cv_id:int}/activate")
def activate(cv_id: int, user: CurrentUser) -> dict[str, Any]:
    service.activate(user["id"], cv_id)
    return service.get_cv(user["id"], cv_id)


@router.delete("/{cv_id:int}")
def delete_cv(cv_id: int, user: CurrentUser) -> dict[str, bool]:
    service.delete_cv(user["id"], cv_id)
    return {"ok": True}
