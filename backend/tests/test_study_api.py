from __future__ import annotations

import json
import time
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from dc_platform import llm
from dc_platform.llm import FakeAdapter
from tests.helpers import assert_isolated, two_users

TOPIC_CARDS = {
    "cards": [
        {"kind": "basic", "front": "What does a write-through cache do?", "back": "It writes to cache and store together."},
        {"kind": "cloze", "front": "A {{c1::cache}} sits in front of slower storage.", "back": "cache"},
        {"kind": "basic", "front": "What does a write-through cache do?", "back": "duplicate should drop"},
        {"kind": "basic", "front": "x", "back": "too short front"},
    ]
}


MAP_DRAFT = {
    "root": {
        "id": "root",
        "label": "Caching",
        "summary": "Fast store in front of slower storage.",
        "sources": ["A cache sits in front of slower storage."],
        "children": [
            {
                "id": "n1",
                "label": "Write-through",
                "summary": "Writes hit cache and store together.",
                "sources": [],
                "children": [],
            }
        ],
    }
}


@pytest.fixture()
def clients(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[tuple[TestClient, TestClient], None, None]:
    monkeypatch.setenv("ENABLED_MODULES", "design,study,study.maps")
    from main import create_app

    alice, bobby = two_users(lambda: TestClient(create_app()))

    def replies(messages: list[dict[str, str]]) -> str:
        blob = " ".join(m["content"] for m in messages)
        if "study_mindmap" in blob or "mind map" in blob.lower():
            return json.dumps(MAP_DRAFT)
        if "study_node_chat" in blob:
            return "Write-through updates both layers."
        return json.dumps(TOPIC_CARDS)

    llm.set_adapter_factory(lambda: FakeAdapter(replies))
    yield alice, bobby
    llm.set_adapter_factory(None)


def wait_job(c: TestClient, job_id: str, timeout: float = 8.0) -> dict[str, Any]:
    end = time.time() + timeout
    while time.time() < end:
        j = c.get(f"/api/tasks/{job_id}").json()
        if j["status"] in {"done", "failed", "cancelled"}:
            return j
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish")


def test_manual_deck_card_review_and_due(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    r = alice.post("/api/study/decks", json={"name": "Caching"})
    assert r.status_code == 200, r.text
    deck = r.json()
    assert deck["name"] == "Caching" and deck["status"] == "ready" and deck["cardCount"] == 0

    c = alice.post(f"/api/study/decks/{deck['id']}/cards", json={"kind": "basic", "front": "What is a cache?", "back": "Fast store"})
    assert c.status_code == 200, c.text
    card = c.json()
    assert card["front"].startswith("What") and card["reps"] == 0

    due = alice.get("/api/study/decks/due").json()
    assert len(due) == 1 and due[0]["id"] == card["id"]

    reviewed = alice.post(f"/api/study/cards/{card['id']}/review", json={"rating": "good"}).json()
    assert reviewed["reps"] == 1 and reviewed["intervalDays"] == 1
    assert alice.get("/api/study/decks/due").json() == []

    stats = alice.get(f"/api/study/decks/{deck['id']}/stats").json()
    assert stats["totalReviews"] == 1 and stats["retention"] == 1.0 and stats["streak"] >= 1


def test_nested_deck_and_patch_card(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    parent = alice.post("/api/study/decks", json={"name": "Role"}).json()
    child = alice.post("/api/study/decks", json={"name": "Queues", "parentId": parent["id"]}).json()
    assert child["parentId"] == parent["id"]

    card = alice.post(
        f"/api/study/decks/{child['id']}/cards",
        json={"kind": "cloze", "front": "A {{c1::queue}} is FIFO", "back": "queue"},
    ).json()
    patched = alice.patch(f"/api/study/cards/{card['id']}", json={"back": "queue (FIFO)"}).json()
    assert patched["back"] == "queue (FIFO)" and patched["kind"] == "cloze"


def test_delete_deck_removes_cards(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    deck = alice.post("/api/study/decks", json={"name": "Temp"}).json()
    card = alice.post(f"/api/study/decks/{deck['id']}/cards", json={"front": "Q", "back": "A"}).json()
    assert alice.delete(f"/api/study/decks/{deck['id']}").json() == {"ok": True}
    assert alice.get(f"/api/study/decks/{deck['id']}").status_code == 404
    assert alice.post(f"/api/study/cards/{card['id']}/review", json={"rating": "good"}).status_code == 404


def test_decks_are_user_scoped(clients: tuple[TestClient, TestClient]) -> None:
    alice, bobby = clients
    deck = alice.post("/api/study/decks", json={"name": "Mine"}).json()
    alice.post(f"/api/study/decks/{deck['id']}/cards", json={"front": "Q", "back": "A"})
    assert_isolated(alice, bobby, "GET", f"/api/study/decks/{deck['id']}")
    assert bobby.get("/api/study/decks").json() == []


def test_review_writes_readiness(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    from db import open_db

    deck = alice.post("/api/study/decks", json={"name": "Databases"}).json()
    card = alice.post(f"/api/study/decks/{deck['id']}/cards", json={"front": "Q", "back": "A"}).json()
    alice.post(f"/api/study/cards/{card['id']}/review", json={"rating": "easy"})
    with open_db() as db:
        rows = db.execute(
            "SELECT module, topic, signal, strength, ref FROM readiness_events WHERE module='study'"
        ).fetchall()
    assert len(rows) == 1
    assert rows[0]["topic"] == "databases" and rows[0]["signal"] == "strength"
    assert rows[0]["ref"] == f"study_card:{card['id']}"


def test_generate_topic_review_confirm(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    r = alice.post("/api/study/decks/generate", json={"sourceKind": "topic", "sourceRef": "Caching", "name": "Caching"})
    assert r.status_code == 200, r.text
    deck = r.json()
    assert deck["status"] in ("generating", "review") and deck["jobId"]  # the job may already be done
    assert wait_job(alice, deck["jobId"])["status"] == "done"
    deck = alice.get(f"/api/study/decks/{deck['id']}").json()
    assert deck["status"] == "review"
    cards = alice.get(f"/api/study/decks/{deck['id']}/cards").json()
    assert len(cards) == 2  # duplicate + short front filtered
    confirmed = alice.post(f"/api/study/decks/{deck['id']}/confirm").json()
    assert confirmed["status"] == "ready"


def test_jd_and_weakness_sources(clients: tuple[TestClient, TestClient], monkeypatch: pytest.MonkeyPatch) -> None:
    alice, _ = clients
    from modules.study import sources as study_sources

    monkeypatch.setattr(
        study_sources,
        "analyse_jd",
        lambda text, user_id: {
            "title": "Backend",
            "requirements": [{"text": "Kafka", "kind": "must"}, {"text": "Go", "kind": "nice"}],
            "talking_points": ["scaling the API"],
        },
    )
    deck = alice.post(
        "/api/study/decks/generate",
        json={"sourceKind": "jd", "sourceRef": "We need a backend engineer with Kafka and Go experience for our platform."},
    ).json()
    assert wait_job(alice, deck["jobId"])["status"] == "done"
    assert len(alice.get(f"/api/study/decks/{deck['id']}/cards").json()) >= 3

    from db import open_db
    from dc_platform.rows import now

    with open_db() as db, db:
        uid = db.execute("SELECT id FROM users WHERE username='alice'").fetchone()["id"]
        db.execute(
            "INSERT INTO readiness_events(user_id, module, topic, signal, strength, ref, at) VALUES (?,?,?,?,?,?,?)",
            (uid, "interview", "consistent hashing", "weakness", 0.3, "interview_session:1", now()),
        )
    weak = alice.post("/api/study/decks/generate", json={"sourceKind": "interview_weakness", "sourceRef": ""}).json()
    assert wait_job(alice, weak["jobId"])["status"] == "done"
    fronts = [c["front"] for c in alice.get(f"/api/study/decks/{weak['id']}/cards").json()]
    assert any("consistent hashing" in f for f in fronts)


def test_mind_map_lesson_and_node_deck(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    r = alice.post("/api/study/maps", json={"sourceKind": "lesson", "sourceRef": "module-0"})
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["status"] in ("generating", "ready") and m["jobId"]  # the job may already be done
    assert wait_job(alice, m["jobId"])["status"] == "done"
    detail = alice.get(f"/api/study/maps/{m['id']}").json()
    assert detail["status"] == "ready" and len(detail["nodes"]) >= 2
    root = next(n for n in detail["nodes"] if n["parentId"] is None)
    deck = alice.post(f"/api/study/maps/{m['id']}/nodes/{root['id']}/deck").json()
    assert deck["sourceKind"] == "mindmap_node" and (deck.get("cardCount") or 0) >= 1
    patched = alice.patch(
        f"/api/study/maps/{m['id']}/nodes/{root['id']}",
        json={"addChildLabel": "Extra idea"},
    ).json()
    assert any(n["label"] == "Extra idea" for n in patched["nodes"])


def test_maps_hidden_without_flag(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODULES", "design,study")
    from main import create_app

    alice, _ = two_users(lambda: TestClient(create_app()))
    llm.set_adapter_factory(lambda: FakeAdapter([json.dumps(TOPIC_CARDS)]))
    try:
        assert alice.get("/api/study/maps").status_code == 404
    finally:
        llm.set_adapter_factory(None)


def test_glossary_and_lesson_need_no_model(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    lessons = alice.get("/api/study/content/lessons").json()
    assert any(x["id"] == "module-0" for x in lessons)
    assert len(alice.get("/api/study/content/glossary").json()) >= 10

    g = alice.post("/api/study/decks/generate", json={"sourceKind": "glossary", "sourceRef": ""}).json()
    assert wait_job(alice, g["jobId"])["status"] == "done"
    assert len(alice.get(f"/api/study/decks/{g['id']}/cards").json()) >= 20

    lesson = alice.post("/api/study/decks/generate", json={"sourceKind": "lesson", "sourceRef": "module-0"}).json()
    assert wait_job(alice, lesson["jobId"])["status"] == "done"
    assert len(alice.get(f"/api/study/decks/{lesson['id']}/cards").json()) >= 3


# ---------------------------------------------------------------- regressions found in review

def test_unconfirmed_drafts_are_not_due(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    deck = alice.post("/api/study/decks/generate", json={"sourceKind": "topic", "sourceRef": "Caching", "name": "Caching"}).json()
    assert wait_job(alice, deck["jobId"])["status"] == "done"
    assert alice.get(f"/api/study/decks/{deck['id']}").json()["status"] == "review"
    assert alice.get("/api/study/decks/due").json() == []
    assert alice.get(f"/api/study/decks/due?deckId={deck['id']}").json() == []
    assert alice.get("/api/study/decks/stats").json()["dueToday"] == 0
    assert alice.get(f"/api/study/decks/{deck['id']}/stats").json()["dueToday"] == 0
    assert alice.get(f"/api/study/decks/{deck['id']}").json()["dueCount"] == 0
    alice.post(f"/api/study/decks/{deck['id']}/confirm")  # once confirmed, the same cards are due
    assert len(alice.get("/api/study/decks/due").json()) == 2
    assert alice.get("/api/study/decks/stats").json()["dueToday"] == 2


def test_deleting_a_card_or_deck_clears_its_readiness_events(clients: tuple[TestClient, TestClient]) -> None:
    from db import open_db

    alice, _ = clients
    deck = alice.post("/api/study/decks", json={"name": "Queues"}).json()
    ids = [alice.post(f"/api/study/decks/{deck['id']}/cards", json={"kind": "basic", "front": f"Question number {i}?", "back": "An answer."}).json()["id"] for i in range(2)]
    for i in ids:
        alice.post(f"/api/study/cards/{i}/review", json={"rating": "good"})

    def events() -> int:
        with open_db() as db:
            return int(db.execute("SELECT COUNT(*) FROM readiness_events WHERE module='study'").fetchone()[0])

    assert events() == 2
    alice.delete(f"/api/study/cards/{ids[0]}")
    assert events() == 1
    alice.delete(f"/api/study/decks/{deck['id']}")
    assert events() == 0


def test_export_and_delete_all_cover_only_the_users_own_data(clients: tuple[TestClient, TestClient]) -> None:
    alice, bobby = clients
    deck = alice.post("/api/study/decks", json={"name": "Mine"}).json()
    card = alice.post(f"/api/study/decks/{deck['id']}/cards", json={"kind": "basic", "front": "What is a cache?", "back": "A fast store."}).json()
    alice.post(f"/api/study/cards/{card['id']}/review", json={"rating": "easy"})
    bobby.post("/api/study/decks", json={"name": "Theirs"})
    out = alice.get("/api/study/export").json()
    assert [d["name"] for d in out["decks"]] == ["Mine"] and len(out["cards"]) == 1 and len(out["reviews"]) == 1
    assert alice.delete("/api/study/data").json() == {"ok": True}
    assert alice.get("/api/study/export").json() == {"decks": [], "cards": [], "reviews": [], "mindmaps": [], "mindmapNodes": [], "mindmapEdges": []}
    assert [d["name"] for d in bobby.get("/api/study/decks").json()] == ["Theirs"]


def test_regenerating_a_map_keeps_the_old_version_and_its_edits(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    first = alice.post("/api/study/maps", json={"sourceKind": "lesson", "sourceRef": "module-1"}).json()
    assert wait_job(alice, first["jobId"])["status"] == "done"
    old = alice.get(f"/api/study/maps/{first['id']}").json()
    root = next(n for n in old["nodes"] if n["parentId"] is None)
    alice.patch(f"/api/study/maps/{first['id']}/nodes/{root['id']}", json={"label": "My own title"})
    again = alice.post(f"/api/study/maps/{first['id']}/regenerate").json()
    assert again["id"] != first["id"] and again["version"] == 2 and again["sourceRef"] == "module-1"
    assert wait_job(alice, again["jobId"])["status"] == "done"
    kept = alice.get(f"/api/study/maps/{first['id']}").json()
    assert next(n for n in kept["nodes"] if n["parentId"] is None)["label"] == "My own title"
    assert [m["version"] for m in alice.get("/api/study/maps").json()] == [2, 1]


def test_long_node_ids_cannot_collide_on_edges() -> None:
    from modules.study.map_generate import MapNodeIn, flatten_tree

    long_id = "x" * 38
    root = MapNodeIn(id="root", label="Root", children=[MapNodeIn(id=long_id + "a", label="A"), MapNodeIn(id=long_id + "b", label="B")])
    _, edges = flatten_tree(root)
    assert len({e["id"] for e in edges}) == len(edges) == 2


def test_packaged_lessons_match_the_apps_lessons() -> None:
    """The server cannot read app/content in its image, so it carries copies. They must not drift."""
    from pathlib import Path

    src = Path(__file__).resolve().parents[2] / "app" / "content" / "lessons"
    copy = Path(__file__).resolve().parents[1] / "modules" / "study" / "content" / "lessons"
    for f in sorted(copy.glob("module-*.md")):
        assert f.read_text(encoding="utf-8").replace("\r\n", "\n") == (src / f.name).read_text(encoding="utf-8").replace("\r\n", "\n"), f.name
    assert {f.name for f in copy.glob("module-*.md")} == {f.name for f in src.glob("module-*.md")}
