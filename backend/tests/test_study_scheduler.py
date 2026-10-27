"""Pure SM-2 schedule cases — no database."""
from __future__ import annotations

import pytest

from modules.study.scheduler import DEFAULT_EASE, EASE_FLOOR, CardState, schedule


def fresh() -> CardState:
    return CardState(ease_factor=DEFAULT_EASE, interval_days=1, reps=0, lapses=0)


def test_first_good_is_tomorrow() -> None:
    got = schedule(fresh(), "good")
    assert got.interval_days == 1 and got.reps == 1 and got.ease_factor == DEFAULT_EASE


def test_second_good_is_six_days() -> None:
    after_first = schedule(fresh(), "good")
    got = schedule(
        CardState(after_first.ease_factor, after_first.interval_days, after_first.reps, after_first.lapses),
        "good",
    )
    assert got.interval_days == 6 and got.reps == 2


def test_again_resets_reps_and_bumps_lapses() -> None:
    mid = CardState(ease_factor=2.5, interval_days=10, reps=4, lapses=0)
    got = schedule(mid, "again")
    assert got.reps == 0 and got.lapses == 1 and got.interval_days == 1
    assert got.ease_factor == pytest.approx(2.3)


def test_hard_shortens_growth_and_lowers_ease() -> None:
    mid = CardState(ease_factor=2.5, interval_days=10, reps=3, lapses=0)
    got = schedule(mid, "hard")
    assert got.interval_days == 12 and got.reps == 4
    assert got.ease_factor == pytest.approx(2.35)


def test_easy_applies_bonus_and_raises_ease() -> None:
    mid = CardState(ease_factor=2.5, interval_days=10, reps=2, lapses=0)
    got = schedule(mid, "easy")
    assert got.interval_days == 32  # round(10 * 2.5 * 1.3) — banker's round of 32.5
    assert got.ease_factor == pytest.approx(2.65)


def test_ease_never_below_floor() -> None:
    low = CardState(ease_factor=EASE_FLOOR, interval_days=1, reps=0, lapses=2)
    got = schedule(low, "again")
    assert got.ease_factor == EASE_FLOOR


def test_unknown_rating_raises() -> None:
    with pytest.raises(ValueError, match="unknown rating"):
        schedule(fresh(), "meh")  # type: ignore[arg-type]
