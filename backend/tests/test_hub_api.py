from __future__ import annotations

import datetime as dt
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from dc_platform import readiness, topics
from modules.hub import actions, readiness_view
from tests.helpers import assert_isolated, two_users

CACHE_JD = "We need strong caching experience with Redis and a CDN."
QUEUE_JD = "You will own our Kafka pipelines and message queues."


@pytest.fixture()
def clients(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[tuple[TestClient, TestClient], None, None]:
    monkeypatch.setenv("ENABLED_MODULES", "design,hub")
    from main import create_app

    alice, bobby = two_users(lambda: TestClient(create_app()))
    with alice, bobby:
        yield alice, bobby


def uid(client: TestClient) -> int:
    """alice's id; these tests only record events for her."""
    from db import open_db

    _ = client
    with open_db() as db:
        return int(db.execute("SELECT id FROM users WHERE username='alice'").fetchone()["id"])


def target(client: TestClient, title: str = "Backend Engineer", **extra: Any) -> dict[str, Any]:
    r = client.post("/api/hub/targets", json={"title": title, **extra})
    assert r.status_code == 200, r.text
    return r.json()


def record(user_id: int, topic: str, strength: float, ref: str, module: str = "study") -> None:
    readiness.replace(user_id, module, ref, [readiness.Event(topic, strength)])


def card(client: TestClient, slug: str) -> dict[str, Any]:
    return next(t for t in client.get("/api/hub/summary").json()["readiness"] if t["slug"] == slug)


# ---------------------------------------------------------------- topics


@pytest.mark.parametrize(
    ("raw", "slug"),
    [
        ("Caching and CDNs", "caching"), ("rate limiting", "api-design"), ("Behavioral", "behavioral"),
        ("Kafka consumers", "queues-streaming"), ("caching", "caching"), ("Technical", topics.OTHER), ("", topics.OTHER),
    ],
)
def test_labels_resolve_to_the_shared_topic_list(raw: str, slug: str) -> None:
    assert topics.resolve(raw) == slug


def test_the_job_description_names_the_topics_it_asks_for() -> None:
    assert topics.mentioned_in(CACHE_JD) == {"caching"}
    assert topics.mentioned_in("Nothing relevant here.") == set()


def test_events_are_stored_under_a_known_topic(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    record(uid(alice), "Caching and CDNs", 0.9, "a")
    record(uid(alice), "Some unrelated deck", 0.9, "b")
    from db import open_db

    with open_db() as db:
        stored = {r["topic"] for r in db.execute("SELECT topic FROM readiness_events")}
    assert stored == {"caching", topics.OTHER}


# ---------------------------------------------------------------- targets


def test_the_first_target_becomes_active_and_the_newest_takes_over(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    assert alice.get("/api/hub/summary").json()["target"] is None
    first = target(alice, "Backend Engineer")
    assert alice.get("/api/hub/summary").json()["target"]["id"] == first["id"]
    second = target(alice, "Platform Engineer")
    assert alice.get("/api/hub/summary").json()["target"]["id"] == second["id"]


def test_switching_target_changes_what_the_hub_stresses(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    cache = target(alice, "Cache Engineer", jdText=CACHE_JD, date="2099-01-01")
    queue = target(alice, "Streaming Engineer", jdText=QUEUE_JD)
    first = alice.get("/api/hub/summary").json()
    assert first["target"]["id"] == queue["id"] and first["readiness"][0]["slug"] == "queues-streaming"
    assert alice.put("/api/hub/targets/active", json={"targetId": cache["id"]}).status_code == 200
    second = alice.get("/api/hub/summary").json()
    assert second["target"]["id"] == cache["id"] and second["readiness"][0]["slug"] == "caching"
    assert second["target"]["daysLeft"] > 0 and [t["id"] for t in second["targets"]] == [cache["id"], queue["id"]]


def test_readiness_is_about_the_user_not_the_target(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    a, b = target(alice, "A", jdText=CACHE_JD), target(alice, "B", jdText=QUEUE_JD)
    for n in range(3):
        record(uid(alice), "Caching", 0.9, f"c{n}")
    alice.put("/api/hub/targets/active", json={"targetId": a["id"]})
    one = card(alice, "caching")
    alice.put("/api/hub/targets/active", json={"targetId": b["id"]})
    two = card(alice, "caching")
    assert one["strength"] == two["strength"] and one["tier"] == two["tier"] == "strong"
    assert one["relevant"] and not two["relevant"]


def test_deleting_the_active_target_falls_back_to_another(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    first, second = target(alice, "One"), target(alice, "Two")
    assert alice.delete(f"/api/hub/targets/{second['id']}").status_code == 200
    assert alice.get("/api/hub/summary").json()["target"]["id"] == first["id"]
    alice.delete(f"/api/hub/targets/{first['id']}")
    assert alice.get("/api/hub/summary").json()["target"] is None


def test_a_target_can_be_edited_and_its_date_cleared(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    t = target(alice, "Old", date="2099-01-01")
    got = alice.patch(f"/api/hub/targets/{t['id']}", json={"title": "New", "date": None}).json()
    assert got["title"] == "New" and got["date"] is None and got["level"] == ""
    assert alice.patch(f"/api/hub/targets/{t['id']}", json={"date": "tomorrow"}).status_code == 422


def test_targets_are_capped(clients: tuple[TestClient, TestClient]) -> None:
    from modules.hub import targets

    alice, _ = clients
    for n in range(targets.MAX_TARGETS):
        target(alice, f"Role {n}")
    assert alice.post("/api/hub/targets", json={"title": "One too many"}).status_code == 409


def test_targets_are_private(clients: tuple[TestClient, TestClient]) -> None:
    alice, bobby = clients
    t = target(alice)
    assert_isolated(alice, bobby, "GET", f"/api/hub/targets/{t['id']}")
    assert_isolated(alice, bobby, "PATCH", f"/api/hub/targets/{t['id']}", json={"title": "x"})
    assert bobby.put("/api/hub/targets/active", json={"targetId": t["id"]}).status_code == 404
    assert bobby.get("/api/hub/summary").json()["target"] is None
    assert bobby.get("/api/hub/targets").json() == []


def test_export_and_delete_all(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    target(alice, "One")
    assert [t["title"] for t in alice.get("/api/hub/export").json()["targets"]] == ["One"]
    alice.delete("/api/hub/data")
    assert alice.get("/api/hub/export").json() == {"targets": [], "activeTargetId": None}


# ---------------------------------------------------------------- readiness


def test_a_few_data_points_are_an_early_read_not_a_verdict(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    record(uid(alice), "Caching", 0.2, "one")
    assert card(alice, "caching")["tier"] == "early" and card(alice, "caching")["points"] == 1
    assert card(alice, "security")["tier"] == "none"


def test_old_evidence_counts_for_less() -> None:
    now = 1_000_000_000_000
    fresh = {"module": "study", "topic": "caching", "strength": 1.0, "ref": "a", "at": now}
    old = {"module": "study", "topic": "caching", "strength": 0.0, "ref": "b", "at": now - 90 * readiness_view.MS_PER_DAY}
    mixed = readiness_view._topic_card("caching", [fresh, old, old], now, False)
    assert mixed["strength"] > 0.5  # the fresh answer outweighs two old ones


def test_the_streak_counts_back_from_today_or_yesterday() -> None:
    day = dt.date(2026, 3, 10)

    def at(d: dt.date) -> dict[str, Any]:
        return {"at": int(dt.datetime.combine(d, dt.time(12), tzinfo=dt.timezone.utc).timestamp() * 1000)}

    back = dt.timedelta
    run = [at(day), at(day - back(days=1)), at(day - back(days=2)), at(day - back(days=5))]
    assert readiness_view.streak(run, day)["days"] == 3
    assert readiness_view.streak(run[1:], day)["days"] == 2  # nothing today yet, the streak is still alive
    assert readiness_view.streak([at(day - back(days=3))], day)["days"] == 0
    assert [d["active"] for d in readiness_view.streak(run, day)["week"]] == [False, True, False, False, True, True, True]


def test_activity_is_one_entry_per_source_newest_first(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    record(uid(alice), "Caching", 0.9, "card:1")
    record(uid(alice), "Caching", 0.4, "card:1")  # a re-review replaces, never adds
    record(uid(alice), "Kafka", 0.9, "card:2")
    got = alice.get("/api/hub/summary").json()["activity"]
    assert [a["ref"] for a in got] == ["card:2", "card:1"] and got[0]["topics"] == ["Queues and streaming"]


# ---------------------------------------------------------------- next actions


def ctx(**over: Any) -> actions.Context:
    base: dict[str, Any] = {
        "target": {"title": "Backend Engineer"}, "topics": [], "due_cards": 0, "fit": None,
        "enabled": frozenset({"design", "study", "cv", "interview"}), "has_interview": True,
    }
    return actions.Context(**{**base, **over})


def test_without_a_target_the_first_action_is_to_set_one() -> None:
    assert actions.next_actions(ctx(target=None))[0]["key"] == "set-target"


def test_actions_are_ranked_and_use_only_enabled_modules() -> None:
    weak = {"slug": "consistency", "label": "Consistency and replication", "tier": "needs_work", "points": 5, "strength": 0.2, "relevant": True}
    fit = {"gaps": [{"text": "Kafka"}]}
    got = actions.next_actions(ctx(due_cards=18, topics=[weak], fit=fit))
    assert [a["key"] for a in got] == ["review-cards", "weak-consistency", "cv-gap"]
    assert got[0]["title"] == "Review 18 due cards"
    assert actions.next_actions(ctx(due_cards=18, fit=fit, enabled=frozenset({"design"}))) == []


def test_a_thin_topic_is_never_called_weak() -> None:
    thin = {"slug": "caching", "label": "Caching", "tier": "needs_work", "points": 1, "strength": 0.1, "relevant": True}
    assert actions.next_actions(ctx(topics=[thin])) == []


def test_summary_lists_actions_for_the_active_target(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    assert [a["key"] for a in alice.get("/api/hub/summary").json()["actions"]] == ["set-target"]
    target(alice, jdText=CACHE_JD)
    keys = [a["key"] for a in alice.get("/api/hub/summary").json()["actions"]]
    assert "set-target" not in keys and "start-caching" in keys


# ---------------------------------------------------------------- setup checklist


def test_setup_steps_follow_the_enabled_modules_and_complete_from_real_data(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODULES", "design,hub,study")
    from main import create_app

    alice, bobby = two_users(lambda: TestClient(create_app()))

    def steps(client: TestClient) -> dict[str, bool]:
        return {s["key"]: s["done"] for s in client.get("/api/hub/summary").json()["setup"]}

    assert steps(alice) == {"target": False, "deck": False}  # no CV or interview steps while those modules are off
    target(alice)
    alice.post("/api/study/decks", json={"name": "Caching"})
    assert steps(alice) == {"target": True, "deck": True}
    assert steps(bobby) == {"target": False, "deck": False}
