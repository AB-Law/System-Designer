"""Research settings, read from the environment when used so a test or an operator can change them without a restart."""
from __future__ import annotations

import os
from typing import Literal

from dc_platform.tool_loop import Limits

FLAG = "interview.research"
DAY_MS = 24 * 60 * 60 * 1000
Scope = Literal["shared", "user"]


def _int(name: str, default: int) -> int:
    return int(os.environ.get(name, str(default)))


def min_items() -> int:
    """Fresh questions a role family and level should have before search is skipped."""
    return _int("RESEARCH_MIN_ITEMS", 12)


def min_company_items() -> int:
    """Fresh company-specific items a named company should have before search is skipped."""
    return _int("RESEARCH_COMPANY_MIN_ITEMS", 4)


def fresh_days(kind: str) -> int:
    """Questions change slowly; notes about a company's culture and engineering change faster."""
    return _int("RESEARCH_QUESTION_DAYS", 60) if kind == "question" else _int("RESEARCH_NOTE_DAYS", 14)


def cooldown_hours() -> int:
    """After a search for a bucket, how long before the same bucket may be searched again (0 turns the wait off)."""
    return _int("RESEARCH_COOLDOWN_HOURS", 24)


def runs_per_month() -> int:
    return _int("RESEARCH_USER_RUNS_PER_MONTH", 5)


def merge_threshold() -> float:
    return float(os.environ.get("RESEARCH_MERGE_COSINE", "0.92"))


def bank_size() -> int:
    return _int("RESEARCH_BANK_SIZE", 30)


def max_extract_urls() -> int:
    return _int("RESEARCH_MAX_EXTRACT_URLS", 5)


def store_scope() -> Scope:
    return "user" if os.environ.get("RESEARCH_STORE_SCOPE", "shared").strip().lower() == "user" else "shared"


def limits() -> Limits:
    return Limits(_int("RESEARCH_MAX_STEPS", 8), float(_int("RESEARCH_STEP_TIMEOUT_S", 45)), float(_int("RESEARCH_TOTAL_TIMEOUT_S", 180)))


def owner(user_id: int) -> int | None:
    """The user_id stored on a research row: nobody's when the store is shared."""
    return user_id if store_scope() == "user" else None
