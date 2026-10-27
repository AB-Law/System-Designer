"""SM-2 spaced-repetition schedule as a pure function.

Four ratings (again / hard / good / easy) follow the common Anki-style SM-2 rules, not the
classic 0–5 quality scale. Differences from classic SM-2 that we keep on purpose:

- Ratings are four named buttons instead of a 0–5 integer.
- Hard multiplies the prior interval by 1.2 and lowers ease by 0.15 (classic has no Hard).
- Easy uses a 1.3 bonus and raises ease by 0.15.
- Ease never falls below 1.3 (classic floor).

Default starting ease is 2.5; a new card's first Good lands tomorrow (interval 1).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Rating = Literal["again", "hard", "good", "easy"]
RATINGS: frozenset[str] = frozenset({"again", "hard", "good", "easy"})

EASE_FLOOR = 1.3
DEFAULT_EASE = 2.5
HARD_FACTOR = 1.2
EASY_BONUS = 1.3
HARD_EASE_DELTA = -0.15
EASY_EASE_DELTA = 0.15
AGAIN_EASE_DELTA = -0.2


@dataclass(frozen=True)
class CardState:
    ease_factor: float
    interval_days: int
    reps: int
    lapses: int


@dataclass(frozen=True)
class ScheduleResult:
    ease_factor: float
    interval_days: int
    reps: int
    lapses: int


def _clamp_ease(ease: float) -> float:
    return max(EASE_FLOOR, round(ease, 4))


def _days(n: float) -> int:
    return max(1, int(round(n)))


def _after_again(state: CardState) -> ScheduleResult:
    return ScheduleResult(
        ease_factor=_clamp_ease(state.ease_factor + AGAIN_EASE_DELTA),
        interval_days=1,
        reps=0,
        lapses=state.lapses + 1,
    )


def _after_hard(state: CardState) -> ScheduleResult:
    if state.reps == 0:
        interval = 1
    else:
        interval = _days(state.interval_days * HARD_FACTOR)
    return ScheduleResult(
        ease_factor=_clamp_ease(state.ease_factor + HARD_EASE_DELTA),
        interval_days=interval,
        reps=state.reps + 1,
        lapses=state.lapses,
    )


def _growing_interval(state: CardState) -> int:
    if state.reps == 0:
        return 1
    if state.reps == 1:
        return 6
    return _days(state.interval_days * state.ease_factor)


def _after_good(state: CardState) -> ScheduleResult:
    return ScheduleResult(
        ease_factor=_clamp_ease(state.ease_factor),
        interval_days=_growing_interval(state),
        reps=state.reps + 1,
        lapses=state.lapses,
    )


def _after_easy(state: CardState) -> ScheduleResult:
    if state.reps == 0:
        interval = 4
    else:
        interval = _days(state.interval_days * state.ease_factor * EASY_BONUS)
    return ScheduleResult(
        ease_factor=_clamp_ease(state.ease_factor + EASY_EASE_DELTA),
        interval_days=interval,
        reps=state.reps + 1,
        lapses=state.lapses,
    )


_HANDLERS = {
    "again": _after_again,
    "hard": _after_hard,
    "good": _after_good,
    "easy": _after_easy,
}


def schedule(state: CardState, rating: Rating) -> ScheduleResult:
    """Next ease, interval, reps and lapses for one review rating."""
    try:
        handler = _HANDLERS[rating]
    except KeyError as e:
        raise ValueError(f"unknown rating: {rating!r}") from e
    return handler(state)


# Strength written to readiness_events for Hub (0..1).
STRENGTH: dict[Rating, float] = {
    "again": 0.2,
    "hard": 0.45,
    "good": 0.75,
    "easy": 0.95,
}
