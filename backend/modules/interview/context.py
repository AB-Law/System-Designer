"""The facts about a role and a candidate that go into prompts, written as plain text."""
from __future__ import annotations

from typing import Any

NO_JD = "(no job description was given)"
NO_CV = "(no CV is on file)"
MAX_REQUIREMENTS = 25


def _list_line(label: str, items: list[str]) -> list[str]:
    return [f"{label}: " + "; ".join(items)] if items else []


def job_brief(role: Any, reading: dict[str, Any] | None) -> str:
    """Title, level, company, and what the job description asks for."""
    head = [f"Title: {role['title']}", f"Level: {role['level'] or 'not stated'}"]
    if role["company"]:
        head.append(f"Company: {role['company']}")
    if not reading:
        return "\n".join([*head, NO_JD])
    requirements = reading.get("requirements", [])[:MAX_REQUIREMENTS]
    must = [r["text"] for r in requirements if r["kind"] == "must"]
    nice = [r["text"] for r in requirements if r["kind"] == "nice"]
    return "\n".join([
        *head, *_list_line("Domain", [reading["domain"]] if reading.get("domain") else []),
        *_list_line("Must have", must), *_list_line("Nice to have", nice), *_list_line("Themes to cover", reading.get("talking_points", [])),
    ])


def candidate_text(cv: str) -> str:
    return cv or NO_CV


def persona(role: Any) -> str:
    return f"a senior interviewer at {role['company']}" if role["company"] else "an experienced interviewer"
