"""Is an answer too thin to move on from? A cheap rule check, so the flow stays predictable and testable."""
from __future__ import annotations

import re

SHORT_WORDS = 8  # fewer words than this is always thin
THIN_WORDS = 25  # below this, an answer needs something concrete in it
CONCRETE = re.compile(
    r"\d|%|\b(for example|for instance|specifically|because|resulted?|reduced|increased|improved|built|designed|implemented|led)\b",
    re.IGNORECASE,
)
GAVE_UP = re.compile(r"\b(i (do not|don't|dont) know|no idea|not sure|pass|skip)\b", re.IGNORECASE)


def is_vague(answer: str) -> bool:
    """True when the interviewer should ask for specifics. A candidate who says they do not know is moved on, not pressed."""
    if GAVE_UP.search(answer):
        return False
    words = len(answer.split())
    if words < SHORT_WORDS:
        return True
    return words < THIN_WORDS and not CONCRETE.search(answer)
