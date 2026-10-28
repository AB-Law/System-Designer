"""Structured CV: the schema, rendering back to text, bullet references, size limits and model extraction."""
from __future__ import annotations

import re

from pydantic import BaseModel, Field

from .dates import norm_date


class Role(BaseModel):
    employer: str = ""
    title: str = ""
    start: str = ""  # YYYY-MM or YYYY
    end: str = ""  # YYYY-MM, YYYY, or "present"
    location: str = ""
    bullets: list[str] = Field(default_factory=list)


class Education(BaseModel):
    school: str = ""
    degree: str = ""
    start: str = ""
    end: str = ""


class Project(BaseModel):
    name: str = ""
    link: str = ""
    bullets: list[str] = Field(default_factory=list)


class CVStructure(BaseModel):
    name: str = ""
    headline: str = ""
    email: str = ""
    links: list[str] = Field(default_factory=list)
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    experience: list[Role] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)


MAX_ITEMS = 60
MAX_BULLETS = 30
MAX_TEXT = 1500


def _heading(*parts: str) -> str:
    return " | ".join(p for p in parts if p)


def _section(title: str, lines: list[str]) -> list[str]:
    return ["", title, *lines] if lines else []


def render_text(cv: CVStructure) -> str:
    """Plain text of the structure, one fact per line, used when the original text no longer matches the edits."""

    def entry(heading: str, bullets: list[str]) -> list[str]:
        return [heading, *(f"- {b}" for b in bullets)]

    def span(start: str, end: str) -> str:
        return f"{start} - {end}".strip(" -")

    out = [h for h in [cv.name, cv.headline, cv.email, *cv.links] if h]
    out += _section("Summary", [cv.summary] if cv.summary else [])
    out += _section("Skills", [", ".join(cv.skills)] if cv.skills else [])
    out += _section("Experience", [x for r in cv.experience for x in entry(_heading(r.title, r.employer, r.location, span(r.start, r.end)), r.bullets)])
    out += _section("Projects", [x for p in cv.projects for x in entry(_heading(p.name, p.link), p.bullets)])
    out += _section("Education", [_heading(e.degree, e.school, span(e.start, e.end)) for e in cv.education])
    return "\n".join(out)


def bullet_refs(cv: CVStructure) -> list[tuple[str, str]]:
    """(reference, text) for every bullet. References look like 'exp.0.2' (role 0, bullet 2) or 'proj.1.0'."""
    refs = [(f"exp.{i}.{j}", b) for i, r in enumerate(cv.experience) for j, b in enumerate(r.bullets)]
    return refs + [(f"proj.{i}.{j}", b) for i, p in enumerate(cv.projects) for j, b in enumerate(p.bullets)]


def get_bullet(cv: CVStructure, ref: str) -> str | None:
    m = re.match(r"^(exp|proj)\.(\d+)\.(\d+)$", ref)
    if not m:
        return None
    items = cv.experience if m.group(1) == "exp" else cv.projects
    i, j = int(m.group(2)), int(m.group(3))
    if i >= len(items) or j >= len(items[i].bullets):
        return None
    return items[i].bullets[j]


def set_bullet(cv: CVStructure, ref: str, text: str) -> bool:
    if get_bullet(cv, ref) is None:
        return False
    m = re.match(r"^(exp|proj)\.(\d+)\.(\d+)$", ref)
    assert m
    items = cv.experience if m.group(1) == "exp" else cv.projects
    items[int(m.group(2))].bullets[int(m.group(3))] = text
    return True


def clamp(cv: CVStructure) -> CVStructure:
    """Bound sizes so a bad model reply or a hostile edit cannot store huge documents."""
    cv.skills = [s[:80] for s in cv.skills[:MAX_ITEMS]]
    cv.links = [s[:200] for s in cv.links[:10]]
    cv.summary = cv.summary[:MAX_TEXT]
    for r in cv.experience[:MAX_ITEMS]:
        r.bullets = [b[:MAX_TEXT] for b in r.bullets[:MAX_BULLETS]]
    cv.experience = cv.experience[:MAX_ITEMS]
    for p in cv.projects[:MAX_ITEMS]:
        p.bullets = [b[:MAX_TEXT] for b in p.bullets[:MAX_BULLETS]]
    cv.projects = cv.projects[:MAX_ITEMS]
    cv.education = cv.education[:MAX_ITEMS]
    for r in cv.experience:
        r.start, r.end = norm_date(r.start) if r.start else "", norm_date(r.end) if r.end else ""
    return cv
