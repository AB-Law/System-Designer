"""Rules-based CV reader: section headings, date ranges and bullets. Coarser than the model, but needs nothing and never fails."""
from __future__ import annotations

import re

from .dates import MONTH_PATTERN, norm_date
from .parsing import PAGE_BREAK
from .structure import CVStructure, Education, Project, Role, clamp

_DATE = rf"(?:(?:{MONTH_PATTERN})[a-z]*\.?\s+|(?:0?[1-9]|1[0-2])/)?(?:19|20)\d{{2}}(?:-(?:0[1-9]|1[0-2])(?!\d))?"
_RANGE_RE = re.compile(rf"({_DATE})\s*(?:-|–|—|to)\s*({_DATE}|present|current|now|today)", re.I)
_BULLET_RE = re.compile(r"^\s*([-*•▪●◦‣·]|\d+[.)])\s+")
_TITLE_SPLIT = re.compile(r"\s+[|@·]\s+|\s+at\s+|,\s+|\s+[-–—]\s+")
_DEGREE_RE = re.compile(r"\b(b\.?sc|m\.?sc|b\.?a|m\.?a|phd|bachelor|master|degree|diploma|b\.?tech|m\.?tech|mba)\b", re.I)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_LINK_RE = re.compile(r"(?:https?://|www\.|linkedin\.com/|github\.com/)\S+", re.I)
_SECTIONS = {
    "summary": "summary", "profile": "summary", "objective": "summary", "professional summary": "summary", "career summary": "summary",
    "about me": "summary", "about": "summary", "personal statement": "summary",
    "experience": "experience", "work experience": "experience", "professional experience": "experience", "employment": "experience",
    "work history": "experience", "employment history": "experience", "career history": "experience", "relevant experience": "experience",
    "technical experience": "experience",
    "education": "education", "education and training": "education", "academic background": "education", "qualifications": "education",
    "skills": "skills", "technical skills": "skills", "key skills": "skills", "core skills": "skills", "core competencies": "skills",
    "skills and tools": "skills", "technologies": "skills", "tech stack": "skills",
    "projects": "projects", "personal projects": "projects", "selected projects": "projects", "academic projects": "projects",
    "side projects": "projects", "open source": "projects",
}  # any other known heading (certifications, languages, ...) is read as "other" and ignored
_OTHER_HEADINGS = {
    "certifications", "certificates", "publications", "awards", "honors", "honours", "languages", "interests", "hobbies", "references",
    "volunteering", "volunteer experience", "courses", "achievements", "activities", "additional information",
}


class _Reader:
    """Feeds lines to one small handler per section, keeping the current role or project."""

    def __init__(self) -> None:
        self.cv = CVStructure()
        self.header: list[str] = []
        self.role: Role | None = None
        self.project: Project | None = None
        self.previous = ""  # the last plain line, which is the title when a role's dates sit on their own line

    def new_section(self) -> None:
        self.role = self.project = None
        self.previous = ""

    def feed(self, section: str, ln: str) -> None:
        getattr(self, f"_{section}", self._other)(ln)

    def _other(self, ln: str) -> None:
        pass

    def _header(self, ln: str) -> None:
        self.header.append(ln)

    def _summary(self, ln: str) -> None:
        self.cv.summary = f"{self.cv.summary} {ln}".strip()

    def _skills(self, ln: str) -> None:
        items = re.split(r"[,;|•·]", re.sub(r"^[A-Za-z /&]{2,30}:\s*", "", ln))
        self.cv.skills += [s.strip() for s in items if s.strip()]

    def _experience(self, ln: str) -> None:
        rng = _RANGE_RE.search(ln)
        if rng and not _BULLET_RE.match(ln):
            self.role = self._new_role(ln, rng)
            self.cv.experience.append(self.role)
        elif self.role is not None:
            self._role_line(self.role, ln)
        self.previous = "" if rng else ln

    def _new_role(self, ln: str, rng: re.Match[str]) -> Role:
        rest = f"{ln[: rng.start()]} {ln[rng.end() :]}".strip(" |,-–—()")
        title, employer = ([p.strip() for p in _TITLE_SPLIT.split(rest) if p.strip()] + ["", ""])[:2]
        if not rest:
            title, employer = self.previous, ""
        return Role(title=title, employer=employer, start=norm_date(rng.group(1)), end=norm_date(rng.group(2)))

    @staticmethod
    def _role_line(role: Role, ln: str) -> None:
        if _BULLET_RE.match(ln):
            role.bullets.append(_BULLET_RE.sub("", ln))
        elif role.bullets:
            role.bullets[-1] += " " + ln  # a wrapped bullet
        elif not role.employer:
            role.employer = ln
        else:
            role.bullets.append(ln)

    def _projects(self, ln: str) -> None:
        bullet = bool(_BULLET_RE.match(ln))
        if self.project is not None and (bullet or not (self.project.bullets and len(ln) < 60)):
            self.project.bullets.append(_BULLET_RE.sub("", ln))
        else:
            self.project = Project(name=ln[:120])
            self.cv.projects.append(self.project)

    def _education(self, ln: str) -> None:
        edu, rng = self.cv.education, _RANGE_RE.search(ln)
        if rng:
            rest = f"{ln[: rng.start()]} {ln[rng.end() :]}".strip(" |,-–—()")
            parts = [p.strip() for p in re.split(r"\s+[|·]\s+|\s+[-–—]\s+|,\s+", rest) if p.strip()]
            degree = " ".join(p for p in parts if _DEGREE_RE.search(p))
            school = " ".join(p for p in parts if not _DEGREE_RE.search(p))
            edu.append(Education(school=school, degree=degree, start=norm_date(rng.group(1)), end=norm_date(rng.group(2))))
        elif not _DEGREE_RE.search(ln):
            edu.append(Education(school=ln))
        elif edu and not edu[-1].degree:
            edu[-1].degree = ln
        else:
            edu.append(Education(degree=ln))

    def finish(self) -> CVStructure:
        """The header lines hold the name, headline, email and links."""
        cv = self.cv
        for ln in self.header:
            if not cv.email and (m := _EMAIL_RE.search(ln)):
                cv.email = m.group(0)
            cv.links += [u.rstrip(".,)") for u in _LINK_RE.findall(ln)]
        plain = [ln for ln in self.header if "@" not in ln and not re.search(r"https?://|www\.|linkedin|github|\+?\d[\d\s().-]{6,}\d", ln)]
        cv.name, cv.headline = (plain[0][:120] if plain else ""), (plain[1][:200] if len(plain) > 1 else "")
        return clamp(cv)


def parse_rules(text: str) -> CVStructure:
    reader, section = _Reader(), "header"
    for raw in text.replace(PAGE_BREAK, "\n").split("\n"):
        ln = raw.strip()
        if not ln:
            continue
        heading = re.sub(r"\s+", " ", re.sub(r"[^a-z ]", " ", ln.lower().replace("&", " and "))).strip() if len(ln) <= 40 else ""
        if heading in _SECTIONS or heading in _OTHER_HEADINGS:
            section = _SECTIONS.get(heading, "other")
            reader.new_section()
        else:
            reader.feed(section, ln)
    return reader.finish()
