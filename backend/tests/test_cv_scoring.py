from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from dc_platform import llm
from modules.cv import rubric, scoring, structure
from tests.cv_fixtures import CV_TEXT, JD_ANALYSIS, JD_TEXT, fake_llm, judge_reply

CV = structure.parse_rules(CV_TEXT)


@pytest.fixture()
def api(app_env: Path) -> Generator[TestClient, None, None]:
    from main import create_app
    from tests.helpers import register

    with TestClient(create_app()) as c:
        register(c, "alice")
        yield c
    llm.set_adapter_factory(None)


def uid() -> int:
    from db import open_db

    with open_db() as db:
        return int(db.execute("SELECT id FROM users WHERE username='alice'").fetchone()["id"])


def use(adapter) -> None:  # type: ignore[no-untyped-def]
    llm.set_adapter_factory(lambda: adapter)


def run(mode: str, **kw):  # type: ignore[no-untyped-def]
    return scoring.score(CV, CV_TEXT, JD_TEXT, uid(), mode=mode, **kw)


def test_weights_sum_to_100() -> None:
    assert sum(rubric.WEIGHTS.values()) == 100


def test_alias_matching_finds_k8s_for_kubernetes() -> None:
    a = scoring.JDAnalysis.model_validate(JD_ANALYSIS)
    a = scoring._clean_analysis(a)
    by = {m.text: m for m in scoring.match_all(a, CV_TEXT)}
    assert by["Kubernetes"].status == "met" and by["Kubernetes"].method == "alias"
    assert by["Kafka"].status == "missing" and by["Kafka"].evidence == []
    assert by["AWS"].status == "met"
    assert by["Experience leading engineers"].status in {"partial", "met"}


def test_evidence_carries_line_citations() -> None:
    a = scoring._clean_analysis(scoring.JDAnalysis.model_validate(JD_ANALYSIS))
    m = next(m for m in scoring.match_all(a, CV_TEXT) if m.text == "PostgreSQL")
    ev = m.evidence[0]
    assert ev.line and CV_TEXT.split("\n")[ev.line - 1].strip().lstrip("- ") == ev.quote  # the bullet marker is not part of the quote


def test_fast_score_uses_one_model_call_and_no_judge(api: TestClient) -> None:
    ad = fake_llm()
    use(ad)
    r = run("fast")
    assert len(ad.calls) == 1 and r["mode"] == "fast"
    assert 40 <= r["total"] <= 95 and r["band"] in {"fair", "strong"}
    keys = {c["key"]: c for c in r["breakdown"]["components"]}
    assert keys["domain"]["weight"] == 0  # not rated in fast mode, so the rest are rescaled
    assert abs(sum(c["weight"] for c in r["breakdown"]["components"]) - 100) < 0.5


def test_deep_score_rates_evidence_and_domain(api: TestClient) -> None:
    use(fake_llm(judge=judge_reply()))
    r = run("deep")
    keys = {c["key"]: c for c in r["breakdown"]["components"]}
    assert r["mode"] == "deep" and keys["domain"]["score"] == 70 and keys["domain"]["weight"] > 0
    kafka = next(e for e in r["evidence"] if e["text"] == "Kafka")
    assert kafka["status"] == "missing" and kafka["strength"] == 0
    assert r["analysis"]["gaps"][0]["text"] == "Kafka"  # the biggest gap first


def test_gaps_are_ordered_by_impact(api: TestClient) -> None:
    use(fake_llm())
    pts = [g["points"] for g in run("fast")["analysis"]["gaps"]]
    assert pts == sorted(pts, reverse=True) and pts[0] > 0


def test_missing_requirement_lowers_score(api: TestClient) -> None:
    use(fake_llm())
    with_kafka = scoring.score(structure.parse_rules(CV_TEXT + "\n- Ran Kafka clusters for event streaming at scale\n"), CV_TEXT + "\n- Ran Kafka clusters for event streaming at scale\n", JD_TEXT, uid(), mode="fast")
    without = run("fast")
    assert with_kafka["total"] > without["total"]


def test_model_quote_must_exist_in_the_cv(api: TestClient) -> None:
    """A made-up quote cannot upgrade a requirement to 'met'."""
    forged = judge_reply({"r5": {"status": "met", "quote": "Deployed Kafka at LinkedIn for six years", "strength": 3}})
    use(fake_llm(judge=forged))
    kafka = next(e for e in run("deep")["evidence"] if e["text"] == "Kafka")
    assert kafka["status"] == "partial" and kafka["strength"] <= 1 and kafka["evidence"] == []


def test_model_cannot_remove_a_deterministic_match(api: TestClient) -> None:
    use(fake_llm(judge=judge_reply({"r3": {"status": "missing", "quote": "", "strength": 0}})))
    k8s = next(e for e in run("deep")["evidence"] if e["text"] == "Kubernetes")
    assert k8s["status"] == "met"


def test_borderline_result_gets_a_second_pass(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    ad = fake_llm(judge=judge_reply())
    use(ad)
    monkeypatch.setattr(rubric, "near_edge", lambda total: True)
    r = run("deep")
    assert r["stages"]["second_pass"] is True and ad.judge_calls["judge"] == 2  # type: ignore[attr-defined]


def test_clear_result_is_judged_once(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    ad = fake_llm(judge=judge_reply())
    use(ad)
    monkeypatch.setattr(rubric, "near_edge", lambda total: False)
    r = run("deep")
    assert "second_pass" not in r["stages"] and ad.judge_calls["judge"] == 1  # type: ignore[attr-defined]


def test_near_edge_window() -> None:
    assert rubric.near_edge(76) and rubric.near_edge(48) and not rubric.near_edge(62) and not rubric.near_edge(95)


def test_second_pass_takes_the_median() -> None:
    a = scoring.JDAnalysis.model_validate(JD_ANALYSIS)
    a = scoring._clean_analysis(a)
    matches = scoring.match_all(a, CV_TEXT)
    p1 = scoring.Judgement.model_validate(judge_reply({"r5": {"status": "met", "quote": "Wrote ETL pipelines with Airflow and PostgreSQL", "strength": 3}}, domain=90))
    p2 = scoring.Judgement.model_validate(judge_reply(domain=50))
    d = scoring.apply_judgement(matches, CV_TEXT, [p1, p2])
    assert d == 70  # median of 90 and 50
    kafka = next(m for m in matches if m.id == "r5")
    assert kafka.status in {"missing", "partial"}  # two passes disagree; the rules said missing; the median wins


def test_judge_failure_falls_back_to_rules_only(api: TestClient) -> None:
    use(fake_llm(judge=None))
    r = run("deep")
    assert r["mode"] == "fast" and r["stages"]["fell_back_to_fast"] is True and r["total"] > 0


def test_no_model_still_scores_with_rules(api: TestClient) -> None:
    use(fake_llm(jd=None))
    r = run("fast")
    assert r["stages"]["requirements"]["source"] == "rules"
    assert {e["text"] for e in r["evidence"]} >= {"Python", "Kubernetes", "PostgreSQL"}


def test_experience_is_deterministic() -> None:
    a = scoring._clean_analysis(scoring.JDAnalysis.model_validate(JD_ANALYSIS))
    score, note = scoring.experience_component(a, CV)
    assert score is not None and score > 90 and "years" in note
    junior = structure.CVStructure(experience=[structure.Role(title="Intern", start="2025-06", end="present")])
    low, _ = scoring.experience_component(a, junior)
    assert low is not None and low < 40


def test_no_stated_years_drops_the_component() -> None:
    a = scoring.JDAnalysis(requirements=[])
    assert scoring.experience_component(a, CV)[0] is None


def test_same_inputs_same_score(api: TestClient) -> None:
    use(fake_llm(judge=judge_reply()))
    assert run("deep")["total"] == run("deep")["total"]


def test_truncation_is_reported(api: TestClient) -> None:
    use(fake_llm())
    r = scoring.score(CV, CV_TEXT, JD_TEXT + "x " * 10_000, uid(), mode="fast")
    assert r["truncated"] is True


def test_must_have_gate_caps_the_total(monkeypatch: pytest.MonkeyPatch) -> None:
    """Strong experience cannot rescue a CV that misses most of the must-haves (real gates are exercised by the eval set)."""
    a = scoring._clean_analysis(scoring.JDAnalysis.model_validate(JD_ANALYSIS))
    matches = scoring.match_all(a, CV_TEXT)
    assert scoring.build_breakdown(a, matches, CV, None, True)["cap"] is None
    monkeypatch.setattr(rubric, "GATES", [(100, 30)])  # pretend anything under 100% of the must-haves is capped at 30
    b = scoring.build_breakdown(a, matches, CV, None, True)
    assert b["total"] == 30 and b["cap"]["limit"] == 30 and "caps the total" in b["cap"]["reason"]
