"""What the interview borrows from the CV module. Everything degrades to "not available" when the CV module is off.

Modules share ids and service functions, never routes. If a later phase moves the JD extraction to the platform,
only this file changes.
"""
from __future__ import annotations

import importlib
import json
from typing import Any

from fastapi import HTTPException

MAX_CV_CHARS = 6_000
MAX_JD_CHARS = 12_000


def _cv_service() -> Any | None:
    try:
        return importlib.import_module("modules.cv.service")
    except ImportError:
        return None


def candidate_brief(user_id: int) -> str:
    """The active CV as plain text, or "" when there is none or the CV module is not enabled."""
    svc = _cv_service()
    cv = svc.active_cv(user_id) if svc else None
    if not cv or not cv["latest"]:
        return ""
    from modules.cv.structure import CVStructure, render_text

    return render_text(CVStructure.model_validate(cv["latest"]["structure"]))[:MAX_CV_CHARS]


def analyse_jd(text: str, user_id: int) -> dict[str, Any]:
    """The Phase 1 reading of a job description (requirements, level, talking points), as plain data."""
    from modules.cv import scoring

    analysis, _source = scoring.analyze_jd(text[:MAX_JD_CHARS], user_id)
    return analysis.model_dump()


def score_run_jd(user_id: int, run_id: int) -> dict[str, Any]:
    """The JD of one of the user's score runs: its text, title and the reading the run already paid for (None if it has none)."""
    svc = _cv_service()
    if svc is None:
        raise HTTPException(409, "The CV module is not enabled, so there is no score to start from.")
    from modules.cv.scoring import JDAnalysis

    run = svc.get_run_row(user_id, run_id)
    stored = json.loads(run["analysis_json"] or "{}")
    analysis = JDAnalysis.model_validate(stored).model_dump() if stored else None
    return {"text": run["jd_text"], "title": run["jd_title"], "analysis": analysis}
