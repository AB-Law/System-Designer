"""Experience maths from role dates: total years, years per skill and seniority. Deterministic, no model."""
from __future__ import annotations

import re
from datetime import date

from . import skills
from .dates import ym
from .structure import CVStructure, Role


def role_span(r: Role, today: date | None = None) -> tuple[int, int] | None:
    """(start, end) in months since year 0, or None when the dates are unusable."""
    today = today or date.today()
    s, e = ym(r.start, end=False, today=today), ym(r.end or "present", end=True, today=today)
    if not s or not e:
        return None
    a, b = s[0] * 12 + s[1], e[0] * 12 + e[1]
    return (a, max(a, b))


def _union_months(spans: list[tuple[int, int]]) -> int:
    total, cur = 0, None
    for a, b in sorted(spans):
        if cur is None or a > cur[1]:
            if cur:
                total += cur[1] - cur[0]
            cur = (a, b)
        else:
            cur = (cur[0], max(cur[1], b))
    if cur:
        total += cur[1] - cur[0]
    return total


def total_years(cv: CVStructure, today: date | None = None) -> float:
    spans = [s for r in cv.experience if (s := role_span(r, today))]
    return round(_union_months(spans) / 12, 1)


def years_per_skill(cv: CVStructure, today: date | None = None) -> dict[str, float]:
    """Years a skill was in use, from the dates of the roles whose text mentions it. Overlapping roles are not double counted."""
    by_skill: dict[str, list[tuple[int, int]]] = {}
    for r in cv.experience:
        span = role_span(r, today)
        if not span:
            continue
        for s in skills.mentions(" ".join([r.title, *r.bullets])):
            by_skill.setdefault(s, []).append(span)
    return {s: round(_union_months(sp) / 12, 1) for s, sp in sorted(by_skill.items())}


_LEVEL_WORDS = {
    "intern": 0, "graduate": 1, "junior": 1, "associate": 1, "mid": 2, "intermediate": 2, "senior": 3, "sr": 3,
    "lead": 4, "staff": 4, "principal": 5, "head": 5, "director": 6, "architect": 4,
}


def level_from_text(text: str) -> int | None:
    best = None
    for w in re.findall(r"[a-z]+", text.lower()):
        if w in _LEVEL_WORDS:
            best = max(best if best is not None else 0, _LEVEL_WORDS[w])
    return best


def level_from_years(years: float) -> int:
    return 1 if years < 2 else 2 if years < 5 else 3 if years < 9 else 4


def cv_level(cv: CVStructure, today: date | None = None) -> int:
    titles = [level_from_text(r.title) for r in cv.experience[:2]]
    explicit = max([t for t in titles if t is not None], default=None)
    by_years = level_from_years(total_years(cv, today))
    return max(explicit, by_years) if explicit is not None else by_years
