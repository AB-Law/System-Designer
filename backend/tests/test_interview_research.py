"""Question research end to end with a fake search provider and a fake LLM: spend limits, reuse, the bank, and safety."""
from __future__ import annotations

import json
from collections.abc import Generator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from db import open_db
from dc_platform import llm, search
from dc_platform.llm import FakeAdapter, Message
from modules.interview.research import config
from modules.interview.research import store as research_store
from modules.interview.research.buckets import Bucket, Gap, role_family
from tests.helpers import assert_isolated, two_users
from tests.interview_fixtures import fake_interview_llm
from tests.test_cv_api import wait_job
from tests.test_interview_api import make_role, start
from tests.test_platform import uid
from tests.test_search import FakeProvider

URL = "https://a.example/q"  # what FakeProvider("a") returns for a search
RATE_LIMITER = "How would you design a rate limiter for a public API?"
WHY_ACME = "Why do you want to work at Acme?"
DISTILLED = {"items": [
    {"question": RATE_LIMITER, "category": "system_design", "kind": "question", "source_url": URL},
    {"question": WHY_ACME, "category": "company", "kind": "question", "source_url": URL},
    {"question": "A question that names a source nobody gathered.", "category": "technical", "kind": "question", "source_url": "https://evil.example/x"},
]}


def act(tool: str, **args: Any) -> str:
    return json.dumps({"tool": tool, "args": args})


@dataclass
class World:
    alice: TestClient
    bobby: TestClient
    provider: FakeProvider
    plan_prompts: list[str] = field(default_factory=list)
    distill_reply: str = json.dumps(DISTILLED)


def research_llm(world: World) -> FakeAdapter:
    base = fake_interview_llm()

    def reply(messages: list[Message]) -> str:
        system = messages[0]["content"]
        if "TASK:research_agent" in system:
            return {2: act("search", topic="questions"), 4: act("read", urls=[URL])}.get(len(messages), act("finish"))
        if "TASK:research_distill" in system:
            return world.distill_reply
        if "TASK:interview_plan" in system:
            world.plan_prompts.append(messages[1]["content"])
        return base.replies(messages)  # type: ignore[operator]

    return FakeAdapter(reply)


@pytest.fixture()
def world(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[World, None, None]:
    monkeypatch.setenv("ENABLED_MODULES", "design,cv,interview,interview.research")
    monkeypatch.setenv("RESEARCH_COOLDOWN_HOURS", "0")  # most tests search again at once; the cooldown tests turn it on
    from main import create_app

    alice, bobby = two_users(lambda: TestClient(create_app()))
    w = World(alice, bobby, FakeProvider("a", cap=50))
    search.set_providers([w.provider])
    llm.set_adapter_factory(lambda: research_llm(w))
    yield w
    llm.set_adapter_factory(None)
    search.set_providers(None)


def research(c: TestClient, role_id: int) -> dict[str, Any]:
    r = c.post("/api/interview/research", json={"roleId": role_id})
    assert r.status_code == 200, r.text
    job = wait_job(c, r.json()["jobId"])
    assert job["status"] == "done", job
    return {**r.json(), **job["result"]}


def bank(c: TestClient, bank_id: int) -> dict[str, Any]:
    r = c.get(f"/api/interview/banks/{bank_id}")
    assert r.status_code == 200, r.text
    return r.json()


def fresh_store(monkeypatch: pytest.MonkeyPatch) -> None:
    """Treat one stored question per bucket as enough, so a second run has nothing to search for."""
    monkeypatch.setenv("RESEARCH_MIN_ITEMS", "1")
    monkeypatch.setenv("RESEARCH_COMPANY_MIN_ITEMS", "1")


def usage_units(provider: str) -> int:
    with open_db() as db:
        row = db.execute("SELECT SUM(units) AS n FROM research_usage WHERE provider=?", (provider,)).fetchone()
    return int(row["n"] or 0)


# ---------------------------------------------------------------- buckets (no database)

def test_role_family_reads_the_title_and_defaults_to_software() -> None:
    assert role_family("Senior Site Reliability Engineer") == "devops"
    assert role_family("Staff Data Engineer") == "data"
    assert role_family("iOS Developer") == "mobile"
    assert role_family("Backend Engineer") == "backend"
    assert role_family("Wizard") == "software"


def test_a_company_has_its_own_bucket_and_generic_items_stay_generic() -> None:
    acme = Bucket("backend", "senior", "Acme")
    assert acme.keys == ["backend|senior|acme", "backend|senior|*"]
    assert acme.key_for("company", "question") == "backend|senior|acme"
    assert acme.key_for("technical", "culture") == "backend|senior|acme"
    assert acme.key_for("technical", "question") == "backend|senior|*"
    assert Bucket("backend", "senior", None).key_for("company", "question") == "backend|senior|*"
    assert "backend|senior|acme" not in Bucket("backend", "senior", "Other").keys


def test_queries_come_only_from_family_level_and_company() -> None:
    b = Bucket("backend", "senior", "Acme")
    assert b.query("questions") == "backend engineer senior interview questions"
    assert b.query("company_questions") == "Acme backend engineer interview questions"
    assert Gap(generic=True, company=True).topics() == ("questions", "company_questions", "culture")
    assert Gap(generic=False, company=False).topics() == () and not Gap(False, False)


def test_a_company_name_cannot_smuggle_a_key_separator() -> None:
    class Row(dict[str, Any]):
        pass

    b = Bucket.of(Row(title="Backend Engineer", level="senior", company="Ac|me\n  Inc"))
    assert b.company == "Ac me Inc" and "|" not in b.company


# ---------------------------------------------------------------- the flag

def test_every_route_needs_the_flag(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODULES", "design,cv,interview")
    from main import create_app

    alice, _ = two_users(lambda: TestClient(create_app()))
    role = make_role(alice)
    assert alice.post("/api/interview/research", json={"roleId": role["id"]}).status_code == 404
    assert alice.get("/api/interview/banks").status_code == 404
    assert alice.post("/api/interview/research/items/1/flag").status_code == 404


# ---------------------------------------------------------------- a research run

def test_research_finds_questions_with_their_sources_and_charges_the_ledger(world: World) -> None:
    role = make_role(world.alice)
    out = research(world.alice, role["id"])
    assert out["searchConfigured"] and out["skipped"] is None
    assert out["added"] == 2  # the item naming a source nobody gathered is dropped
    assert [(s["tool"], s["ok"]) for s in out["steps"]] == [("search", True), ("read", True), ("finish", True)]
    items = bank(world.alice, out["bankId"])["items"]
    assert {i["question"] for i in items} == {RATE_LIMITER, WHY_ACME}
    assert all(i["sourceUrl"] == URL and i["sourceName"] == "a.example" for i in items)
    assert usage_units("a") == 2  # one search and one page
    with open_db() as db:
        keys = {r["bucket_key"] for r in db.execute("SELECT bucket_key FROM research_questions")}
    assert keys == {"backend|senior|*", "backend|senior|acme"}


def test_what_is_stored_is_reused_without_another_search(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    fresh_store(monkeypatch)
    role = make_role(world.alice)
    research(world.alice, role["id"])
    calls = world.provider.calls
    again = research(world.alice, role["id"])
    assert world.provider.calls == calls and again["steps"] == [] and again["items"] == 2


def test_another_user_reuses_the_shared_store_and_company_items_do_not_cross(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    fresh_store(monkeypatch)
    research(world.alice, make_role(world.alice)["id"])
    calls = world.provider.calls
    no_company = make_role(world.bobby, company=None)
    got = research(world.bobby, no_company["id"])
    assert world.provider.calls == calls  # the generic bucket was already full
    assert [i["question"] for i in bank(world.bobby, got["bankId"])["items"]] == [RATE_LIMITER]  # not "Why ... Acme?"


def test_a_per_user_store_is_not_shared(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    fresh_store(monkeypatch)
    monkeypatch.setenv("RESEARCH_STORE_SCOPE", "user")
    research(world.alice, make_role(world.alice)["id"])
    calls = world.provider.calls
    research(world.bobby, make_role(world.bobby)["id"])
    assert world.provider.calls > calls
    with open_db() as db:
        owners = {r["user_id"] for r in db.execute("SELECT user_id FROM research_questions")}
    assert owners == {uid("alice"), uid("bobby")}


def test_no_search_key_skips_the_search_and_uses_no_quota(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEARCH_USER_RUNS_PER_MONTH", "1")
    search.set_providers([FakeProvider("a", configured=False)])
    role = make_role(world.alice)
    for _ in range(2):
        out = research(world.alice, role["id"])
        assert out["searchConfigured"] is False and out["skipped"] == "no_search" and out["items"] == 0


def test_a_provider_at_its_cap_is_not_called(world: World) -> None:
    capped = FakeProvider("a", cap=0)
    search.set_providers([capped])
    out = research(world.alice, make_role(world.alice)["id"])
    assert out["skipped"] == "no_search" and capped.calls == 0


def test_the_monthly_run_quota_is_per_user(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEARCH_USER_RUNS_PER_MONTH", "1")
    role = make_role(world.alice)
    research(world.alice, role["id"])
    refused = world.alice.post("/api/interview/research", json={"roleId": role["id"]})
    assert refused.status_code == 429 and "this month" in refused.json()["detail"]
    research(world.bobby, make_role(world.bobby)["id"])  # bobby's share is his own


def test_a_failed_distill_marks_the_bank_failed(world: World) -> None:
    world.distill_reply = "not json"
    role = make_role(world.alice)
    r = world.alice.post("/api/interview/research", json={"roleId": role["id"]})
    assert wait_job(world.alice, r.json()["jobId"])["status"] == "failed"
    failed = bank(world.alice, r.json()["bankId"])
    assert failed["status"] == "failed" and failed["error"]


def test_research_needs_a_role_you_own(world: World) -> None:
    role = make_role(world.alice)
    assert world.bobby.post("/api/interview/research", json={"roleId": role["id"]}).status_code == 404


# ---------------------------------------------------------------- the bank

def test_the_user_can_remove_reword_and_add_and_a_new_search_keeps_it(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    fresh_store(monkeypatch)
    role = make_role(world.alice)
    out = research(world.alice, role["id"])
    first, second = bank(world.alice, out["bankId"])["items"]
    patched = world.alice.patch(f"/api/interview/banks/{out['bankId']}", json={
        "remove": [first["ref"]],
        "edit": {second["ref"]: "Tell me why Acme."},
        "add": [{"question": "Describe your worst outage.", "category": "behavioral"}],
    })
    assert patched.status_code == 200, patched.text
    questions = [i["question"] for i in patched.json()["items"]]
    assert questions[0] == "Tell me why Acme." and questions[1] == "Describe your worst outage." and len(questions) == 2
    again = research(world.alice, role["id"])
    assert [i["question"] for i in bank(world.alice, again["bankId"])["items"]] == questions  # the removed one stays removed


def test_bank_edits_are_validated(world: World) -> None:
    out = research(world.alice, make_role(world.alice)["id"])
    path = f"/api/interview/banks/{out['bankId']}"
    assert world.alice.patch(path, json={"add": [{"question": "short", "category": "technical"}]}).status_code == 422
    assert world.alice.patch(path, json={"add": [{"question": "A long enough question here?", "category": "nope"}]}).status_code == 422


def test_banks_are_private_to_their_owner(world: World) -> None:
    out = research(world.alice, make_role(world.alice)["id"])
    assert_isolated(world.alice, world.bobby, "GET", f"/api/interview/banks/{out['bankId']}")
    assert_isolated(world.alice, world.bobby, "PATCH", f"/api/interview/banks/{out['bankId']}", json={})
    assert world.bobby.get("/api/interview/banks").json() == []


def test_a_flagged_question_drops_out_of_every_bank(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    fresh_store(monkeypatch)
    role = make_role(world.alice)
    out = research(world.alice, role["id"])
    item = next(i for i in bank(world.alice, out["bankId"])["items"] if i["question"] == RATE_LIMITER)
    assert world.bobby.post(f"/api/interview/research/items/{item['storeId']}/flag").status_code == 200  # anyone sharing the store may flag
    after = research(world.alice, role["id"])
    assert RATE_LIMITER not in [i["question"] for i in bank(world.alice, after["bankId"])["items"]]
    assert world.alice.post("/api/interview/research/items/9999/flag").status_code == 404


def test_deleting_a_role_deletes_its_bank(world: World) -> None:
    role = make_role(world.alice)
    research(world.alice, role["id"])
    assert world.alice.delete(f"/api/interview/roles/{role['id']}").status_code == 200
    assert world.alice.get("/api/interview/banks").json() == []


def test_export_includes_banks_and_delete_all_clears_the_users_own_rows(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEARCH_STORE_SCOPE", "user")
    research(world.alice, make_role(world.alice)["id"])
    assert len(world.alice.get("/api/interview/export").json()["questionBanks"]) == 1
    assert world.alice.delete("/api/interview/data").status_code == 200
    with open_db() as db:
        assert db.execute("SELECT COUNT(*) AS n FROM research_questions").fetchone()["n"] == 0
        assert db.execute("SELECT COUNT(*) AS n FROM question_banks").fetchone()["n"] == 0


# ---------------------------------------------------------------- planner

def test_the_planner_is_offered_the_researched_questions_as_data(world: World) -> None:
    role = make_role(world.alice)
    research(world.alice, role["id"])
    start(world.alice, role["id"])
    prompt = world.plan_prompts[-1]
    assert "<researched_questions>" in prompt and RATE_LIMITER in prompt


def test_without_a_bank_the_plan_prompt_has_no_researched_block(world: World) -> None:
    start(world.alice, make_role(world.alice)["id"])
    assert "<researched_questions>" not in world.plan_prompts[-1]


# ---------------------------------------------------------------- store internals

def test_a_repeated_question_renews_the_stored_one_instead_of_adding_another(world: World) -> None:
    u = uid("alice")
    bucket = Bucket("backend", "senior", None)
    a = research_store.Candidate("What is a deadlock?", "technical", "question", URL, "a.example")
    b = research_store.Candidate("what  is a DEADLOCK", "technical", "question", URL, "a.example")
    assert research_store.add(u, bucket, [a]) == 1
    assert research_store.add(u, bucket, [b]) == 0
    with open_db() as db:
        assert db.execute("SELECT COUNT(*) AS n FROM research_questions").fetchone()["n"] == 1


def test_a_near_paraphrase_merges_by_vector_similarity(monkeypatch: pytest.MonkeyPatch) -> None:
    known = [research_store._Known(1, "k", "alpha question", False, [1.0, 0.0])]
    assert research_store._find(known, "k", "other words", [0.99, 0.05]) is known[0]
    assert research_store._find(known, "k", "other words", [0.0, 1.0]) is None
    assert research_store._find(known, "elsewhere", "alpha question", [1.0, 0.0]) is None  # never across buckets


def test_old_items_stop_counting_as_fresh_but_are_still_served(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    fresh_store(monkeypatch)
    u = uid("alice")
    bucket = Bucket("backend", "senior", None)
    research_store.add(u, bucket, [research_store.Candidate("What is a deadlock?", "technical", "question", URL, "a.example")])
    assert not research_store.gap(u, bucket)
    with open_db() as db, db:
        db.execute("UPDATE research_questions SET fetched = fetched - ?", (61 * config.DAY_MS,))
    assert research_store.gap(u, bucket).generic
    assert [i["question"] for i in research_store.usable(u, bucket)] == ["What is a deadlock?"]


# ---------------------------------------------------------------- regressions found in review

def quota_runs(user: str = "alice") -> int:
    with open_db() as db:
        row = db.execute(
            "SELECT SUM(runs) AS n FROM research_user_quota q JOIN users u ON u.id=q.user_id WHERE u.username=?", (user,),
        ).fetchone()
    return int(row["n"] or 0)


def test_a_run_that_needs_no_search_does_not_use_the_monthly_quota(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    fresh_store(monkeypatch)
    monkeypatch.setenv("RESEARCH_USER_RUNS_PER_MONTH", "1")
    role = make_role(world.alice)
    research(world.alice, role["id"])
    assert quota_runs() == 1
    calls = world.provider.calls
    again = research(world.alice, role["id"])  # the store is full: no provider call, so no quota use and no 429
    assert world.provider.calls == calls and again["steps"] == [] and quota_runs() == 1


def test_a_run_with_no_allowance_left_does_not_use_the_monthly_quota(world: World) -> None:
    world.provider._cap = 0  # nothing left to spend: the run cannot search, so it must not count
    role = make_role(world.alice)
    research(world.alice, role["id"])
    assert quota_runs() == 0


def test_reported_questions_do_not_make_every_run_search_again(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    fresh_store(monkeypatch)
    monkeypatch.setenv("RESEARCH_COOLDOWN_HOURS", "24")
    role = make_role(world.alice)
    first = research(world.alice, role["id"])
    for item in bank(world.alice, first["bankId"])["items"]:
        assert world.alice.post(f"/api/interview/research/items/{item['storeId']}/flag").status_code == 200
    calls = world.provider.calls
    for _ in range(2):
        assert research(world.alice, role["id"])["steps"] == []
    assert world.provider.calls == calls  # the buckets were searched today, so nothing is bought again until the wait is over
    monkeypatch.setenv("RESEARCH_COOLDOWN_HOURS", "0")
    research(world.alice, role["id"])
    assert world.provider.calls > calls


def test_a_search_that_failed_outright_is_not_put_on_cooldown(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEARCH_COOLDOWN_HOURS", "24")
    world.provider.fail = True
    role = make_role(world.alice)
    research(world.alice, role["id"])
    world.provider.fail = False
    calls = world.provider.calls
    research(world.alice, role["id"])
    assert world.provider.calls > calls


def test_a_refused_embedding_does_not_lose_the_paid_results(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException

    def refuse(*_a: Any, **_k: Any) -> Any:
        raise HTTPException(429, "Monthly AI usage limit reached.")

    monkeypatch.setattr(llm.LLMClient, "embed", refuse)
    done = research(world.alice, make_role(world.alice)["id"])
    assert done["added"] == 2 and usage_units("a") > 0  # stored without vectors; only exact repeats will merge until embedding works again
