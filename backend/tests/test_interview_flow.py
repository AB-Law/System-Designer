"""The interview's pure logic: which move comes next, how thin answers are spotted, how many questions of each kind, prompts."""
from __future__ import annotations

import pytest

from modules.interview import flow, planner, prompts, vagueness
from modules.interview.feedback import build_exchanges
from modules.interview.flow import Move, Turn
from modules.interview.interviewer import changes_topic, directive
from modules.interview.schemas import Plan, PlanItem, Style

LONG = "I led the migration last year because deploys were slow, and we cut release time by 70% across twelve services."


def turn(idx: int, who: str, tag: str, text: str = LONG, at: int = 0) -> Turn:
    return Turn(idx, who, tag, text, at)


def say(tags: list[str], text: str = LONG) -> list[Turn]:
    """A conversation from tags alone: even positions are the interviewer, odd are the candidate."""
    return [turn(i, flow.INTERVIEWER if i % 2 == 0 else flow.CANDIDATE, t, text if i % 2 else "Q") for i, t in enumerate(tags)]


def move(turns: list[Turn], plan_size: int = 3, style: Style | None = None, minutes: float = 1) -> Move:
    return flow.next_move(turns, plan_size, style or Style(), minutes)


# ---------------------------------------------------------------- moves

def test_the_interviewer_speaks_first() -> None:
    assert move([]) is Move.OPEN


def test_a_full_answer_moves_on_to_the_next_question() -> None:
    assert move(say(["question", "answer"])) is Move.NEXT


def test_a_thin_answer_is_probed_once_when_friendly_and_twice_when_tough() -> None:
    thin = "It went fine."
    once = say(["question", "answer"], thin)
    assert move(once) is Move.PROBE
    twice = say(["question", "answer", "follow-up", "answer"], thin)
    assert move(twice) is Move.NEXT
    assert move(twice, style=Style(tone="tough")) is Move.PROBE
    thrice = say(["question", "answer", "follow-up", "answer", "follow-up", "answer"], thin)
    assert move(thrice, style=Style(tone="tough")) is Move.NEXT


def test_a_new_question_resets_the_probe_count() -> None:
    turns = say(["question", "answer", "follow-up", "answer", "question", "answer"], "Not much.")
    assert move(turns) is Move.PROBE


def test_the_interview_closes_when_the_plan_is_used_up() -> None:
    assert move(say(["question", "answer", "transition", "answer", "question", "answer"])) is Move.INVITE


def test_time_running_out_closes_early_without_probing() -> None:
    thin = say(["question", "answer"], "No.")
    assert move(thin, style=Style(durationMin=10), minutes=10.5) is Move.INVITE


def test_after_the_invitation_the_interviewer_wraps_up_then_is_done() -> None:
    invited = say(["question", "answer", "closing", "answer"])
    assert move(invited) is Move.WRAP
    assert move([*invited, turn(4, flow.INTERVIEWER, "closing")]) is Move.DONE


@pytest.mark.parametrize(
    ("which", "changed", "tag"),
    [(Move.OPEN, False, "question"), (Move.NEXT, False, "question"), (Move.NEXT, True, "transition"),
     (Move.PROBE, True, "follow-up"), (Move.INVITE, False, "closing"), (Move.WRAP, False, "closing")],
)
def test_tags_follow_the_move(which: Move, changed: bool, tag: str) -> None:
    assert flow.tag_for(which, changed) == tag


def test_elapsed_time_counts_from_the_first_turn() -> None:
    assert flow.elapsed_minutes([], 5) == 0
    assert flow.elapsed_minutes([turn(0, flow.INTERVIEWER, "question", at=60_000)], 180_000) == 2


# ---------------------------------------------------------------- vagueness

@pytest.mark.parametrize(
    ("answer", "vague"),
    [
        ("It went fine.", True),
        ("We moved some things around and it worked out in the end for everyone.", True),
        ("We moved the jobs to Kafka because the queue kept falling behind, and lag dropped 90%.", False),
        (LONG, False),
        ("I don't know.", False),
        ("Honestly no idea, I have not used it.", False),
    ],
)
def test_vagueness(answer: str, vague: bool) -> None:
    assert vagueness.is_vague(answer) is vague


# ---------------------------------------------------------------- how many questions of each kind

def test_allocation_adds_up_and_gives_the_leftovers_to_the_largest_remainders() -> None:
    got = planner.allocate(5, {"behavioral": 3, "technical": 4, "system_design": 1, "company": 1})
    assert sum(got.values()) == 5 and got["technical"] == 2
    assert planner.allocate(2, {"behavioral": 1, "technical": 1}) == {"behavioral": 1, "technical": 1}


def test_seniors_get_more_system_design_than_juniors() -> None:
    style = Style(durationMin=60)
    junior = planner.question_counts(style, "Junior engineer", None)
    senior = planner.question_counts(style, "Senior", None)
    assert senior.get("system_design", 0) > junior.get("system_design", 0)
    assert sum(junior.values()) == sum(senior.values()) == 10


def test_the_company_category_needs_a_company() -> None:
    assert "company" not in planner.question_counts(Style(), "mid", None)
    assert "company" in planner.question_counts(Style(), "mid", "Acme")
    assert planner.question_counts(Style(categories=["company"]), "mid", None)  # falls back instead of dividing by zero


def test_the_user_can_set_the_counts_and_the_total_is_capped() -> None:
    assert planner.question_counts(Style(counts={"behavioral": 2, "technical": 0}), "mid", None) == {"behavioral": 2}
    with pytest.raises(ValueError):
        Style(counts={"behavioral": 6, "technical": 6, "system_design": 1})


@pytest.mark.parametrize(("level", "key"), [("Senior Engineer", "senior"), ("PRINCIPAL", "staff"), ("", "mid"), ("intern", "mid")])
def test_level_key(level: str, key: str) -> None:
    assert planner.level_key(level) == key


# ---------------------------------------------------------------- prompts

PLAN = Plan(items=[PlanItem(category="behavioral", question="Q one?"), PlanItem(category="technical", question="Q two?")])


def test_every_move_has_an_instruction_and_the_question_is_filled_in() -> None:
    for which in (Move.OPEN, Move.NEXT, Move.PROBE, Move.INVITE, Move.WRAP):
        assert "{{" not in directive(which, PLAN, say(["question", "answer"]) if which is not Move.OPEN else [])
    assert "Q one?" in directive(Move.OPEN, PLAN, [])
    assert "Q two?" in directive(Move.NEXT, PLAN, say(["question", "answer"]))
    assert "change of topic" in directive(Move.NEXT, PLAN, say(["question", "answer"]))


def test_a_topic_change_is_only_flagged_between_different_categories() -> None:
    assert not changes_topic(PLAN, [])
    assert changes_topic(PLAN, say(["question", "answer"]))
    same = Plan(items=[PlanItem(category="technical", question="First question?"), PlanItem(category="technical", question="Second question?")])
    assert not changes_topic(same, say(["question", "answer"]))


def test_fill_leaves_user_text_alone_and_rejects_unknown_slots() -> None:
    assert prompts.fill("Hi {{name}}", name="{{role}} {{x}}") == "Hi {{role}} {{x}}"
    with pytest.raises(KeyError):
        prompts.fill("Hi {{missing}}")


# ---------------------------------------------------------------- pairing answers with questions

def test_exchanges_pair_answers_with_plan_questions_and_ignore_the_closing_reply() -> None:
    turns = [
        turn(0, "interviewer", "question"), turn(1, "candidate", "answer", "first"), turn(2, "interviewer", "follow-up"),
        turn(3, "candidate", "answer", "more detail"), turn(4, "interviewer", "transition"), turn(5, "candidate", "answer", "second"),
        turn(6, "interviewer", "closing"), turn(7, "candidate", "answer", "what is the team like?"),
    ]
    got = build_exchanges(turns, PLAN)
    assert [(e.ref, e.category, e.question) for e in got] == [(0, "behavioral", "Q one?"), (4, "technical", "Q two?")]
    assert got[0].answer == "first\n\nmore detail" and got[1].answer == "second"


def test_an_unanswered_question_is_not_marked() -> None:
    assert build_exchanges([turn(0, "interviewer", "question")], PLAN) == []
