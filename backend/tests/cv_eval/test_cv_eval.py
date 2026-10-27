"""Scoring evaluation set, run with a recorded fake model. See specs.py for the cases and eval_cv.py for the real-model run."""
from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from dc_platform import llm
from modules.cv import rubric, rules_parser, scoring
from tests.cv_eval import specs
from tests.cv_fixtures import fake_llm

IDS = [c[0] for c in specs.CASES]


@pytest.fixture(scope="module")
def results(tmp_path_factory: pytest.TempPathFactory) -> Generator[dict[str, dict], None, None]:
    mp = pytest.MonkeyPatch()
    mp.setenv("DB_PATH", str(tmp_path_factory.mktemp("eval") / "eval.sqlite3"))
    mp.setenv("INVITE_CODE", "test-invite")
    from main import create_app

    out: dict[str, dict] = {}
    with TestClient(create_app()):  # creates the schema
        for case_id, cand, job, _, _ in specs.CASES:
            llm.set_adapter_factory(lambda job=job: fake_llm(jd=specs.jd_reply(job)))
            text = specs.cv_text(cand)
            out[case_id] = scoring.score(rules_parser.parse_rules(text), text, specs.jd_text(job), 0, mode="fast")
    llm.set_adapter_factory(None)
    mp.undo()
    yield out


def test_set_has_enough_cases() -> None:
    assert 15 <= len(specs.CASES) <= 25 and len(set(IDS)) == len(IDS)


@pytest.mark.parametrize("case", specs.CASES, ids=IDS)
def test_score_lands_in_expected_range(results: dict[str, dict], case: specs.Case) -> None:
    case_id, _, _, (lo, hi), _ = case
    total = results[case_id]["total"]
    assert lo <= total <= hi, f"{case_id}: scored {total}, expected {lo}-{hi} (rubric {rubric.RUBRIC_VERSION})"


@pytest.mark.parametrize("case", specs.CASES, ids=IDS)
def test_missing_must_haves_are_exactly_the_expected_ones(results: dict[str, dict], case: specs.Case) -> None:
    case_id, _, _, _, missing = case
    got = {e["text"] for e in results[case_id]["evidence"] if e["status"] == "missing" and e["kind"] == "must"}
    assert got == set(missing), f"{case_id}: expected must-have gaps {sorted(missing)}, got {sorted(got)}"


def test_better_matches_outscore_worse_ones(results: dict[str, dict]) -> None:
    for better, worse in specs.ORDER:
        assert results[better]["total"] > results[worse]["total"], f"{better} should beat {worse}"


def test_scores_are_stable_between_runs(results: dict[str, dict]) -> None:
    cand, job = "be_senior", "be_senior"
    llm.set_adapter_factory(lambda: fake_llm(jd=specs.jd_reply(job)))
    try:
        text = specs.cv_text(cand)
        again = scoring.score(rules_parser.parse_rules(text), text, specs.jd_text(job), 0, mode="fast")
    finally:
        llm.set_adapter_factory(None)
    assert again["total"] == results["be_vs_be"]["total"] and again["breakdown"] == results["be_vs_be"]["breakdown"]
