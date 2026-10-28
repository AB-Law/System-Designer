"""Cross-module inputs for Study decks. Soft-fails when CV / readiness data is unavailable."""
from __future__ import annotations

import importlib
import json
from typing import Any

from fastapi import HTTPException

from db import open_db

MAX_JD_CHARS = 12_000


def _cv() -> Any | None:
    try:
        return importlib.import_module("modules.cv")
    except ImportError:
        return None


def analyse_jd(text: str, user_id: int) -> dict[str, Any]:
    if _cv() is None:
        raise HTTPException(409, "The CV module is not enabled, so a job description cannot be analysed.")
    from modules.cv import scoring

    analysis, _source = scoring.analyze_jd(text[:MAX_JD_CHARS], user_id)
    return analysis.model_dump()


def score_run(user_id: int, run_id: int) -> dict[str, Any]:
    """Reuse a past score run's JD analysis (or re-read the stored JD text)."""
    try:
        svc = importlib.import_module("modules.cv.service")
    except ImportError as e:
        raise HTTPException(409, "The CV module is not enabled, so there is no score run to use.") from e
    from modules.cv.scoring import JDAnalysis

    run = svc.get_run_row(user_id, run_id)
    stored = json.loads(run["analysis_json"] or "{}")
    if stored:
        return JDAnalysis.model_validate(stored).model_dump()
    if not (run["jd_text"] or "").strip():
        raise HTTPException(422, "That score run has no job description.")
    return analyse_jd(run["jd_text"], user_id)


def cards_from_analysis(analysis: dict[str, Any]) -> list[dict[str, str]]:
    """Deterministic cards from a JD reading — no second model call when analysis already exists."""
    out: list[dict[str, str]] = []
    title = (analysis.get("title") or "this role").strip() or "this role"
    for req in analysis.get("requirements") or []:
        text = (req.get("text") if isinstance(req, dict) else str(req) or "").strip()
        if len(text) < 2:
            continue
        kind = (req.get("kind") if isinstance(req, dict) else "must") or "must"
        out.append({
            "kind": "basic",
            "front": f"What does {title} expect for: {text}?",
            "back": f"{'Must-have' if kind == 'must' else 'Nice-to-have'}: {text}",
        })
    for point in analysis.get("talking_points") or []:
        p = str(point).strip()
        if len(p) < 4:
            continue
        out.append({"kind": "basic", "front": f"Be ready to discuss: {p}", "back": p})
    return out


def interview_weakness_topics(user_id: int, *, limit: int = 20) -> list[str]:
    """Distinct weakness topics the interview module wrote into readiness_events."""
    with open_db() as db:
        rows = db.execute(
            """SELECT topic, MAX(at) AS latest FROM readiness_events
               WHERE user_id=? AND module='interview' AND signal='weakness'
               GROUP BY topic ORDER BY latest DESC LIMIT ?""",
            (user_id, limit),
        ).fetchall()
    return [str(r["topic"]).strip() for r in rows if str(r["topic"]).strip()]


def cards_from_weaknesses(topics: list[str]) -> list[dict[str, str]]:
    return [
        {
            "kind": "basic",
            "front": f"Interview gap — explain clearly: {topic}",
            "back": f"Practise a crisp explanation of «{topic}» with one concrete example. This was flagged in interview feedback.",
        }
        for topic in topics
    ]


def document_corpus(user_id: int, doc_id: int, *, max_chars: int = 12_000) -> tuple[str, str]:
    """Plain text and display name for an interview reference doc. Soft-fails when Interview is off."""
    try:
        docs = importlib.import_module("modules.interview.docs")
    except ImportError as e:
        raise HTTPException(409, "The Interview module is not enabled, so documents are unavailable.") from e
    row = docs.get_row(user_id, doc_id)
    if row["status"] != docs.READY:
        raise HTTPException(409, "That document is not ready yet. Wait for embedding to finish.")
    text = docs.file_text(user_id, doc_id).strip()
    if len(text) < 40:
        chunks = docs.chunks(user_id, doc_id)
        text = "\n\n".join(c["text"] for c in chunks)
    if len(text.strip()) < 40:
        raise HTTPException(422, "That document has no readable text.")
    return text[:max_chars], str(row["name"])
