from __future__ import annotations

import json
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from db import open_db
from dc_platform import llm
from tests.helpers import assert_isolated, two_users
from tests.interview_fixtures import fake_interview_llm
from tests.test_cv_api import JD_TEXT, score, upload, wait_job

STYLE = {"tone": "friendly", "durationMin": 30, "counts": {"behavioral": 1, "technical": 2}}
DETAILED = "I led the migration last year because deploys were slow, and we cut release time by 70% across twelve services."


@pytest.fixture()
def clients(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[tuple[TestClient, TestClient], None, None]:
    monkeypatch.setenv("ENABLED_MODULES", "design,cv,interview")
    from main import create_app

    alice, bobby = two_users(lambda: TestClient(create_app()))
    llm.set_adapter_factory(fake_interview_llm)
    yield alice, bobby
    llm.set_adapter_factory(None)


def make_role(c: TestClient, **extra: Any) -> dict[str, Any]:
    r = c.post("/api/interview/roles", json={"title": "Backend Engineer", "level": "senior", "company": "Acme", **extra})
    assert r.status_code == 200, r.text
    return r.json()


def start(c: TestClient, role_id: int, style: dict[str, Any] | None = None) -> int:
    r = c.post("/api/interview/sessions", json={"roleId": role_id, "style": style or STYLE})
    assert r.status_code == 200, r.text
    assert wait_job(c, r.json()["jobId"])["status"] == "done"
    return int(r.json()["id"])


def say(c: TestClient, sid: int, text: str | None = None) -> list[dict[str, Any]]:
    """Send an answer (or ask for the reply that is owed) and return the stream's events."""
    r = c.post(f"/api/interview/sessions/{sid}/turn", json={} if text is None else {"text": text})
    assert r.status_code == 200, r.text
    return [json.loads(line[6:]) for line in r.text.splitlines() if line.startswith("data: ")]


def last_turn(events: list[dict[str, Any]]) -> dict[str, Any]:
    done = events[-1]
    assert done["type"] == "done", events
    return done


def tags(c: TestClient, sid: int) -> list[str]:
    return [t["tag"] for t in c.get(f"/api/interview/sessions/{sid}").json()["turns"]]


# ---------------------------------------------------------------- roles

def test_role_crud(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    role = make_role(alice, jdText=JD_TEXT)
    assert role["hasJd"] and role["jdText"] == JD_TEXT and role["jdStructured"] is None
    assert [r["id"] for r in alice.get("/api/interview/roles").json()] == [role["id"]]
    assert "jdText" not in alice.get("/api/interview/roles").json()[0]
    patched = alice.patch(f"/api/interview/roles/{role['id']}", json={"title": "Staff Engineer", "company": None}).json()
    assert patched["title"] == "Staff Engineer" and patched["company"] is None and patched["level"] == "senior"
    assert alice.patch(f"/api/interview/roles/{role['id']}", json={"title": None}).status_code == 422
    assert alice.post("/api/interview/roles", json={"level": "mid"}).status_code == 422
    assert alice.delete(f"/api/interview/roles/{role['id']}").status_code == 200
    assert alice.get("/api/interview/roles").json() == []


def test_role_from_a_score_run_carries_its_jd_and_reading(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    upload(alice)
    run = score(alice)
    role = alice.post("/api/interview/roles", json={"scoreRunId": run["id"]}).json()
    assert role["title"] == "Backend" and role["level"] == "senior"
    assert role["sourceScoreRunId"] == run["id"] and role["jdText"] == JD_TEXT.strip()
    assert [r["text"] for r in role["jdStructured"]["requirements"]][:2] == ["Python", "FastAPI"]
    assert alice.post("/api/interview/roles", json={"scoreRunId": 9999}).status_code == 404


def test_a_new_jd_clears_the_stored_reading(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    upload(alice)
    role = alice.post("/api/interview/roles", json={"scoreRunId": score(alice)["id"]}).json()
    patched = alice.patch(f"/api/interview/roles/{role['id']}", json={"jdText": JD_TEXT + "\nAlso: Rust."}).json()
    assert patched["jdStructured"] is None


# ---------------------------------------------------------------- the interview, replayed

def test_a_whole_interview_replays_through_the_flow(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    role = make_role(alice, jdText=JD_TEXT)
    sid = start(alice, role["id"])

    detail = alice.get(f"/api/interview/sessions/{sid}").json()
    assert detail["status"] == "active" and detail["plan"] is None  # hidden unless the user asked to see it

    opening = last_turn(say(alice, sid))
    assert opening["turn"]["tag"] == "question" and opening["finished"] is False
    assert "Tell me about a time you led a migration." in opening["turn"]["text"]

    probe = last_turn(say(alice, sid, "It went fine."))  # too thin: one follow-up, not a new question
    assert probe["turn"]["tag"] == "follow-up" and "thin" in probe["turn"]["text"]

    topic = last_turn(say(alice, sid, DETAILED))  # behavioral -> technical
    assert topic["turn"]["tag"] == "transition" and "change of topic" in topic["turn"]["text"]
    same = last_turn(say(alice, sid, DETAILED))
    assert same["turn"]["tag"] == "question" and "When would you pick Kafka" in same["turn"]["text"]

    invite = last_turn(say(alice, sid, DETAILED))
    assert invite["turn"]["tag"] == "closing" and "questions for you" in invite["turn"]["text"]
    end = last_turn(say(alice, sid, "What does the on-call rotation look like?"))
    assert end["finished"] is True and end["feedbackJobId"]

    assert tags(alice, sid) == [
        "question", "answer", "follow-up", "answer", "transition", "answer", "question", "answer", "closing", "answer", "closing",
    ]
    assert alice.post(f"/api/interview/sessions/{sid}/turn", json={"text": "hello?"}).status_code == 409
    assert wait_job(alice, end["feedbackJobId"])["status"] == "done"

    done = alice.get(f"/api/interview/sessions/{sid}").json()
    assert done["status"] == "ended" and [p["question"] for p in done["plan"]][0] == "Tell me about a time you led a migration."
    assert done["feedback"]["promptVersion"] == "1.0"
    marked = done["feedback"]["perAnswer"]
    assert [m["category"] for m in marked] == ["behavioral", "technical", "technical"]  # the invented ref 999 is dropped
    assert marked[0]["answer"].count("\n\n") == 1 and marked[0]["rubric"][0].startswith("Situation")
    summary = done["feedback"]["summary"]
    assert summary["practiceNext"] == ["Quantify results", "Name trade-offs", "Use STAR"]
    assert done["score"] == summary["score"] == 60  # mean of 4, 2, 3 out of 5
    assert summary["byCategory"] == {"behavioral": 80, "technical": 50}


def test_feedback_writes_readiness_events_once(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    sid = start(alice, make_role(alice)["id"])
    say(alice, sid)
    say(alice, sid, DETAILED)
    job = alice.post(f"/api/interview/sessions/{sid}/end").json()["jobId"]
    assert wait_job(alice, job)["status"] == "done"
    assert alice.post(f"/api/interview/sessions/{sid}/end").json()["jobId"] == job  # ending again changes nothing

    with open_db() as db:
        rows = db.execute("SELECT module, topic, signal, strength, ref FROM readiness_events").fetchall()
    assert [(r["module"], r["topic"], r["signal"], r["ref"]) for r in rows] == [("interview", "Leadership", "strength", f"interview_session:{sid}")]
    assert rows[0]["strength"] == pytest.approx(0.8)


def test_ending_early_with_no_answers_gives_empty_feedback(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    sid = start(alice, make_role(alice)["id"])
    say(alice, sid)
    assert wait_job(alice, alice.post(f"/api/interview/sessions/{sid}/end").json()["jobId"])["status"] == "done"
    done = alice.get(f"/api/interview/sessions/{sid}").json()
    assert done["score"] is None and done["feedback"]["perAnswer"] == [] and done["feedback"]["summary"]["practiceNext"] == []


def test_failed_feedback_can_be_retried(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODULES", "design,cv,interview")
    from main import create_app

    llm.set_adapter_factory(lambda: fake_interview_llm(critique=False))
    try:
        alice, _ = two_users(lambda: TestClient(create_app()))
        sid = start(alice, make_role(alice)["id"])
        say(alice, sid)
        say(alice, sid, DETAILED)
        first = alice.post(f"/api/interview/sessions/{sid}/end").json()["jobId"]
        assert wait_job(alice, first)["status"] == "failed"
        assert alice.get(f"/api/interview/sessions/{sid}").json()["status"] == "ended"
        llm.set_adapter_factory(fake_interview_llm)
        second = alice.post(f"/api/interview/sessions/{sid}/end").json()["jobId"]
        assert second != first and wait_job(alice, second)["status"] == "done"
    finally:
        llm.set_adapter_factory(None)


# ---------------------------------------------------------------- the plan

def test_the_plan_respects_the_counts_and_can_be_shown_up_front(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    sid = start(alice, make_role(alice)["id"], {**STYLE, "showPlan": True})
    plan = alice.get(f"/api/interview/sessions/{sid}").json()["plan"]
    assert [(p["category"], p["focus"]) for p in plan] == [("behavioral", "Leadership"), ("technical", "PostgreSQL"), ("technical", "Messaging")]


def test_sessions_are_listed_with_their_role_style_and_score(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    role = make_role(alice)
    first, second = start(alice, role["id"]), start(alice, role["id"], {"durationMin": 20})
    rows = alice.get("/api/interview/sessions").json()
    assert [r["id"] for r in rows] == [second, first]  # newest first
    assert rows[0]["roleTitle"] == "Backend Engineer" and rows[0]["style"]["durationMin"] == 20 and rows[0]["score"] is None
    assert [r["id"] for r in alice.get(f"/api/interview/sessions?role_id={role['id']}").json()] == [second, first]
    assert alice.get("/api/interview/sessions?role_id=999").json() == []


def test_a_plan_the_model_cannot_write_fails_the_session_cleanly(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODULES", "design,cv,interview")
    from main import create_app

    llm.set_adapter_factory(lambda: fake_interview_llm(plan=None))
    try:
        alice, _ = two_users(lambda: TestClient(create_app()))
        role = make_role(alice)
        r = alice.post("/api/interview/sessions", json={"roleId": role["id"], "style": STYLE}).json()
        assert wait_job(alice, r["jobId"])["status"] == "failed"
        detail = alice.get(f"/api/interview/sessions/{r['id']}").json()
        assert detail["status"] == "failed" and detail["error"]
        assert alice.post(f"/api/interview/sessions/{r['id']}/turn", json={}).status_code == 409
    finally:
        llm.set_adapter_factory(None)


# ---------------------------------------------------------------- turn rules, resuming, errors

def test_turns_must_alternate_and_a_dropped_reply_can_be_asked_for_again(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    sid = start(alice, make_role(alice)["id"])
    assert alice.post(f"/api/interview/sessions/{sid}/turn", json={"text": "I go first"}).status_code == 409
    say(alice, sid)
    assert alice.post(f"/api/interview/sessions/{sid}/turn", json={}).status_code == 409  # the candidate owes an answer
    assert alice.post(f"/api/interview/sessions/{sid}/turn", json={"text": "   "}).status_code == 422

    # the reply is lost after the answer was stored: asking again with no text produces it, without a second answer
    from modules.interview import sessions as store

    with open_db() as db:
        uid = db.execute("SELECT id FROM users WHERE username='alice'").fetchone()["id"]
    store.add_turn(uid, sid, "candidate", "answer", DETAILED)
    assert tags(alice, sid) == ["question", "answer"]
    assert last_turn(say(alice, sid))["turn"]["tag"] == "transition"
    assert tags(alice, sid) == ["question", "answer", "transition"]


def test_a_model_failure_streams_an_error_and_stores_no_reply(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODULES", "design,cv,interview")
    from main import create_app

    base = fake_interview_llm()
    state = {"fail": False}

    class Flaky:
        model = "fake"

        def chat(self, *a: Any, **k: Any) -> Any:
            return base.chat(*a, **k)

        def stream(self, messages: Any, *, temperature: Any) -> Any:
            if state["fail"]:
                raise llm.LLMError("the model is down")
            return base.stream(messages, temperature=temperature)

    llm.set_adapter_factory(Flaky)
    try:
        alice, _ = two_users(lambda: TestClient(create_app()))
        sid = start(alice, make_role(alice)["id"])
        state["fail"] = True
        events = say(alice, sid)
        assert events[-1] == {"type": "error", "message": "the model is down"}
        assert tags(alice, sid) == []
    finally:
        llm.set_adapter_factory(None)


# ---------------------------------------------------------------- ownership

def test_one_users_data_is_invisible_to_another(clients: tuple[TestClient, TestClient]) -> None:
    alice, bobby = clients
    role = make_role(alice)
    sid = start(alice, role["id"])
    say(alice, sid)
    assert_isolated(alice, bobby, "PATCH", f"/api/interview/roles/{role['id']}", json={"level": "mid"})
    assert_isolated(alice, bobby, "GET", f"/api/interview/sessions/{sid}")
    assert bobby.post(f"/api/interview/sessions/{sid}/end").status_code == 404
    assert bobby.post("/api/interview/sessions", json={"roleId": role["id"]}).status_code == 404
    assert bobby.post(f"/api/interview/sessions/{sid}/turn", json={"text": "hi"}).status_code == 404
    assert bobby.get("/api/interview/sessions").json() == [] and bobby.get("/api/interview/roles").json() == []
    assert bobby.delete(f"/api/interview/sessions/{sid}").status_code == 404
    assert bobby.delete(f"/api/interview/roles/{role['id']}").status_code == 404
    assert alice.get(f"/api/interview/sessions/{sid}").status_code == 200


def test_deleting_a_role_deletes_its_sessions(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    role = make_role(alice)
    sid = start(alice, role["id"])
    say(alice, sid)
    alice.delete(f"/api/interview/roles/{role['id']}")
    assert alice.get(f"/api/interview/sessions/{sid}").status_code == 404
    with open_db() as db:
        assert db.execute("SELECT COUNT(*) FROM interview_turns").fetchone()[0] == 0


def test_the_module_is_off_unless_enabled(client: TestClient) -> None:
    assert "/api/interview/roles" not in {getattr(r, "path", "") for r in client.app.routes}


# ---------------------------------------------------------------- voice / transcribe


class _FakeStt:
    def transcribe(self, audio: bytes, *, mime: str, language: str | None = "en") -> str:
        if not audio:
            from dc_platform.stt import SttNoSpeechError

            raise SttNoSpeechError("No audio data was captured.")
        return "I led the migration and cut release time."


@pytest.fixture()
def voice_clients(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[tuple[TestClient, TestClient], None, None]:
    monkeypatch.setenv("ENABLED_MODULES", "design,cv,interview,interview.voice")
    from dc_platform import stt
    from main import create_app

    alice, bobby = two_users(lambda: TestClient(create_app()))
    llm.set_adapter_factory(fake_interview_llm)
    stt.set_transcriber_factory(lambda: _FakeStt())
    yield alice, bobby
    stt.set_transcriber_factory(None)
    llm.set_adapter_factory(None)


def test_transcribe_returns_text(voice_clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = voice_clients
    sid = start(alice, make_role(alice)["id"])
    say(alice, sid)  # opening so the session is live
    r = alice.post(
        f"/api/interview/sessions/{sid}/transcribe",
        content=b"fake-audio-bytes",
        headers={"Content-Type": "audio/webm"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["text"] == "I led the migration and cut release time."


def test_transcribe_requires_voice_flag(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    sid = start(alice, make_role(alice)["id"])
    say(alice, sid)
    r = alice.post(f"/api/interview/sessions/{sid}/transcribe", content=b"x", headers={"Content-Type": "audio/webm"})
    assert r.status_code == 404


def test_transcribe_rejects_inactive_and_foreign_sessions(voice_clients: tuple[TestClient, TestClient]) -> None:
    alice, bobby = voice_clients
    role = make_role(alice)
    planning = alice.post("/api/interview/sessions", json={"roleId": role["id"], "style": STYLE}).json()["id"]
    assert alice.post(f"/api/interview/sessions/{planning}/transcribe", content=b"x", headers={"Content-Type": "audio/webm"}).status_code == 409
    sid = start(alice, role["id"])
    say(alice, sid)
    assert bobby.post(f"/api/interview/sessions/{sid}/transcribe", content=b"x", headers={"Content-Type": "audio/webm"}).status_code == 404
    alice.post(f"/api/interview/sessions/{sid}/end")
    assert alice.post(f"/api/interview/sessions/{sid}/transcribe", content=b"x", headers={"Content-Type": "audio/webm"}).status_code == 409


def test_transcribe_empty_audio_is_422(voice_clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = voice_clients
    sid = start(alice, make_role(alice)["id"])
    say(alice, sid)
    r = alice.post(f"/api/interview/sessions/{sid}/transcribe", content=b"", headers={"Content-Type": "audio/webm"})
    assert r.status_code == 422


# ---------------------------------------------------------------- JD upload, export, delete-all

def test_jd_upload_returns_text_and_stores_nothing(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    r = alice.post("/api/interview/jd/upload", params={"name": "jd.txt"}, content=JD_TEXT.encode(), headers={"content-type": "text/plain"})
    assert r.status_code == 200 and r.json()["text"].startswith("Senior Backend Engineer")
    assert alice.post("/api/interview/jd/upload", params={"name": "jd.txt"}, content=b"too short", headers={"content-type": "text/plain"}).status_code == 422
    with open_db() as db:
        assert db.execute("SELECT COUNT(*) FROM files").fetchone()[0] == 0


def _finished_session(c: TestClient) -> tuple[dict[str, Any], int]:
    role = make_role(c, jdText=JD_TEXT)
    sid = start(c, role["id"])
    say(c, sid)
    say(c, sid, DETAILED)
    assert wait_job(c, c.post(f"/api/interview/sessions/{sid}/end").json()["jobId"])["status"] == "done"
    return role, sid


def test_export_holds_everything_and_only_the_owners(clients: tuple[TestClient, TestClient]) -> None:
    alice, bobby = clients
    role, sid = _finished_session(alice)
    out = alice.get("/api/interview/export").json()
    assert [r["id"] for r in out["roles"]] == [role["id"]] and out["roles"][0]["jdText"]
    assert [s["id"] for s in out["sessions"]] == [sid] and out["sessions"][0]["feedback"]["perAnswer"]
    assert out["docs"] == []
    assert bobby.get("/api/interview/export").json() == {"roles": [], "sessions": [], "docs": []}


def test_delete_all_removes_the_users_data_and_nobody_elses(clients: tuple[TestClient, TestClient]) -> None:
    alice, bobby = clients
    _finished_session(alice)
    bob_role, _ = _finished_session(bobby)
    assert alice.delete("/api/interview/data").json() == {"ok": True}
    assert alice.get("/api/interview/export").json() == {"roles": [], "sessions": [], "docs": []}
    with open_db() as db:
        mine = db.execute("SELECT id FROM users WHERE username='alice'").fetchone()["id"]
        assert db.execute("SELECT COUNT(*) FROM readiness_events WHERE user_id=?", (mine,)).fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM readiness_events WHERE user_id<>?", (mine,)).fetchone()[0] > 0
    assert [r["id"] for r in bobby.get("/api/interview/roles").json()] == [bob_role["id"]]
