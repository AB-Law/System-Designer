"""Shared sample data and a routing fake LLM for the CV tests. All names and employers are made up."""
from __future__ import annotations

import io
import json
from collections.abc import Callable
from typing import Any

from dc_platform.llm import FakeAdapter, Message

CV_TEXT = """Jane Doe
Senior Backend Engineer
jane@example.com | github.com/janedoe

Summary
Backend engineer with 8 years building payment APIs and data pipelines.

Experience
Senior Software Engineer | Acme Pay | Jan 2019 - Present
- Led the migration of a monolith to microservices on Kubernetes, cutting deploy time by 70%
- Built REST APIs in Python and FastAPI serving 2M requests per day
- Mentored four engineers and ran the on-call rotation
Software Engineer | Beta Data | Jun 2015 - Dec 2018
- Wrote ETL pipelines with Airflow and PostgreSQL
- Maintained CI/CD pipelines in Jenkins

Education
BSc Computer Science, State University 2011 - 2015

Skills
Python, Golang, PostgreSQL, Docker, k8s, AWS, Redis
"""

JD_TEXT = """Senior Backend Engineer
We are hiring a senior engineer with 5+ years of experience.

Requirements
- Python and FastAPI
- Kubernetes
- PostgreSQL
- Kafka
- Experience leading engineers

Nice to have
- Terraform
- AWS
"""

JD_ANALYSIS: dict[str, Any] = {
    "title": "Senior Backend Engineer", "level": "senior", "min_years": 5, "domain": "fintech",
    "requirements": [
        {"text": "Python", "kind": "must"}, {"text": "FastAPI", "kind": "must"}, {"text": "Kubernetes", "kind": "must"},
        {"text": "PostgreSQL", "kind": "must"}, {"text": "Kafka", "kind": "must"}, {"text": "Experience leading engineers", "kind": "must"},
        {"text": "Terraform", "kind": "nice"}, {"text": "AWS", "kind": "nice"},
    ],
    "talking_points": ["The Kubernetes migration", "Scaling the REST APIs"],
    "questions_to_ask": ["How are services deployed?"],
}

STRUCTURE_REPLY: dict[str, Any] = {
    "name": "Jane Doe", "headline": "Senior Backend Engineer", "email": "jane@example.com", "links": ["github.com/janedoe"],
    "summary": "Backend engineer", "skills": ["Python", "PostgreSQL", "Docker"],
    "experience": [
        {"employer": "Acme Pay", "title": "Senior Software Engineer", "start": "2019-01", "end": "present",
         "bullets": ["Led the migration of a monolith to microservices on Kubernetes, cutting deploy time by 70%",
                     "Built REST APIs in Python and FastAPI serving 2M requests per day"]},
    ],
    "education": [], "projects": [],
}


def judge_reply(overrides: dict[str, dict[str, Any]] | None = None, domain: int = 70) -> dict[str, Any]:
    """A judgement for JD_ANALYSIS: r1..r8 with quotes taken from CV_TEXT."""
    base = {
        "r1": ("met", "Built REST APIs in Python and FastAPI serving 2M requests per day", 3),
        "r2": ("met", "Built REST APIs in Python and FastAPI serving 2M requests per day", 3),
        "r3": ("met", "Led the migration of a monolith to microservices on Kubernetes, cutting deploy time by 70%", 3),
        "r4": ("met", "Wrote ETL pipelines with Airflow and PostgreSQL", 2),
        "r5": ("missing", "", 0),
        "r6": ("met", "Mentored four engineers and ran the on-call rotation", 2),
        "r7": ("missing", "", 0),
        "r8": ("partial", "Python, Golang, PostgreSQL, Docker, k8s, AWS, Redis", 1),
    }
    items = []
    for rid, (status, quote, strength) in base.items():
        it = {"id": rid, "status": status, "quote": quote, "strength": strength, "reason": ""}
        it.update((overrides or {}).get(rid, {}))
        items.append(it)
    return {"items": items, "domain": {"score": domain, "reason": "Payments background fits."}}


def fake_llm(
    *, jd: dict[str, Any] | None = JD_ANALYSIS, judge: dict[str, Any] | Callable[[int], dict[str, Any]] | None = None,
    structure: dict[str, Any] | None = STRUCTURE_REPLY, rewrite: dict[str, Any] | None = None,
) -> FakeAdapter:
    """Routes on the TASK marker in the system prompt. A task whose reply is None answers with invalid text, like a broken model."""
    counts = {"judge": 0}

    def reply(messages: list[Message]) -> str:
        system = messages[0]["content"]
        if "TASK:jd_analysis" in system:
            return json.dumps(jd) if jd is not None else "not json"
        if "TASK:cv_structure" in system:
            return json.dumps(structure) if structure is not None else "not json"
        if "TASK:judge" in system:
            counts["judge"] += 1
            if judge is None:
                return "not json"
            return json.dumps(judge(counts["judge"]) if callable(judge) else judge)
        if "TASK:rewrite" in system:
            return json.dumps(rewrite) if rewrite is not None else json.dumps({"proposals": []})
        return "ok"

    adapter = FakeAdapter(reply)
    adapter.judge_calls = counts  # type: ignore[attr-defined]
    return adapter


# ---- files built in memory so the tests carry no binary fixtures

def make_pdf(pages: list[list[tuple[tuple[float, float, float, float], str]]]) -> bytes:
    """A PDF whose text boxes are placed at the given rectangles on A4 pages."""
    import pymupdf

    doc = pymupdf.open()
    for boxes in pages:
        page = doc.new_page(width=595, height=842)
        for rect, text in boxes:
            page.insert_textbox(pymupdf.Rect(*rect), text, fontsize=10)
    out = doc.tobytes()
    doc.close()
    return out


def make_docx(paragraphs: list[str]) -> bytes:
    import docx

    d = docx.Document()
    for p in paragraphs:
        d.add_paragraph(p)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()
