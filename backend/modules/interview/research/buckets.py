"""What a role is looked up as: role family, level band and (when given) company. Nothing from the CV or the JD.

The key is structured, not a similarity match, so a company's items can never turn up for another company.
Search queries are built here from the same three fields, which is also what keeps personal text out of providers.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from ..planner import level_key

DEFAULT_FAMILY = "software"
# first match wins, so the narrower families come before "backend"
FAMILIES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("data", ("data engineer", "data scientist", "analytics", "machine learning", "ml engineer", "ai engineer")),
    ("devops", ("devops", "sre", "site reliability", "platform engineer", "infrastructure", "cloud engineer")),
    ("mobile", ("ios", "android", "mobile")),
    ("frontend", ("frontend", "front-end", "front end", "ui engineer", "web developer")),
    ("backend", ("backend", "back-end", "back end", "api engineer", "server")),
)
FAMILY_LABEL = {
    "software": "software engineer", "data": "data engineer", "devops": "devops engineer",
    "mobile": "mobile engineer", "frontend": "frontend engineer", "backend": "backend engineer",
}
MAX_COMPANY = 80

QUESTIONS, COMPANY_QUESTIONS, CULTURE = "questions", "company_questions", "culture"
GENERIC_TOPICS = (QUESTIONS,)
COMPANY_TOPICS = (COMPANY_QUESTIONS, CULTURE)
NOTE_KINDS = {"culture", "engineering"}


def role_family(title: str) -> str:
    text = title.lower()
    return next((family for family, words in FAMILIES if any(w in text for w in words)), DEFAULT_FAMILY)


def _clean_company(company: str | None) -> str | None:
    cleaned = re.sub(r"[\s|]+", " ", company or "").strip()[:MAX_COMPANY]
    return cleaned or None


@dataclass(frozen=True)
class Gap:
    """What the store lacks for a role. Falsy when nothing needs searching."""

    generic: bool
    company: bool

    def __bool__(self) -> bool:
        return self.generic or self.company

    def topics(self) -> tuple[str, ...]:
        return (*GENERIC_TOPICS * self.generic, *COMPANY_TOPICS * self.company)


@dataclass(frozen=True)
class Bucket:
    family: str
    level: str
    company: str | None

    @classmethod
    def of(cls, role: Any) -> Bucket:
        return cls(role_family(role["title"]), level_key(role["level"] or ""), _clean_company(role["company"]))

    @property
    def generic_key(self) -> str:
        return f"{self.family}|{self.level}|*"

    @property
    def company_key(self) -> str | None:
        return f"{self.family}|{self.level}|{self.company.lower()}" if self.company else None

    @property
    def keys(self) -> list[str]:
        """Every bucket a role draws on: its own company's, then the generic one for its family and level."""
        return [k for k in (self.company_key, self.generic_key) if k]

    def key_for(self, category: str, kind: str) -> str:
        """Where a distilled item belongs: company-specific items under the company, everything else under the generic key."""
        company_specific = category == "company" or kind in NOTE_KINDS
        return self.company_key if company_specific and self.company_key else self.generic_key

    def query(self, topic: str) -> str:
        label = FAMILY_LABEL[self.family]
        queries = {
            QUESTIONS: f"{label} {self.level} interview questions",
            COMPANY_QUESTIONS: f"{self.company} {label} interview questions",
            CULTURE: f"{self.company} engineering culture and interview process",
        }
        return queries[topic]
