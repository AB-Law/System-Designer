"""The scoring rubric. Every weight and threshold lives here; change them only together with RUBRIC_VERSION.

Stored scores record the version, so history never compares scores made under different rubrics.
These weights are a judgement call tuned against the evaluation set (tests/cv_eval), not an objective truth.
"""
from __future__ import annotations

RUBRIC_VERSION = "1.0"

# Points out of 100 when every component applies. Components that do not apply (for example no stated years in the
# JD, or no model available) are dropped and the rest are re-scaled to 100.
WEIGHTS: dict[str, int] = {"must": 45, "nice": 10, "experience": 20, "evidence": 20, "domain": 5}
LABELS: dict[str, str] = {
    "must": "Must-have coverage",
    "nice": "Nice-to-have coverage",
    "experience": "Experience and level",
    "evidence": "Evidence strength",
    "domain": "Domain fit",
}

PARTIAL_CREDIT = 0.5
STRONG_MIN = 75
FAIR_MIN = 50
BORDERLINE = 3  # within this many points of a band edge, a deep score is run twice and the median taken

# Must-have gate: great experience cannot make up for missing most of what the role requires. If the share of
# must-haves met (partial counts half) is below the first number, the total is capped at the second.
GATES: list[tuple[int, int]] = [(50, FAIR_MIN - 1), (75, STRONG_MIN - 1)]

# inside the experience component
YEARS_SHARE = 0.6
LEVEL_SHARE = 0.4
LEVEL_STEP_PENALTY = 0.35  # per level below what the JD asks for

MAX_REQUIREMENTS = 25
MAX_JD_CHARS = 12_000
MAX_CV_CHARS = 24_000

FAST_STRENGTH_NOTE = "Evidence strength is estimated from wording in fast mode; run a deep score for a model rating."


def band(total: int) -> str:
    return "strong" if total >= STRONG_MIN else "fair" if total >= FAIR_MIN else "weak"


def near_edge(total: float) -> bool:
    return any(abs(total - edge) <= BORDERLINE for edge in (STRONG_MIN, FAIR_MIN))
