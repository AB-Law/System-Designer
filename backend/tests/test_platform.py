from __future__ import annotations

import threading
import time
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from db import open_db
from dc_platform import files, jobs, llm, usage
from dc_platform.llm import FakeAdapter, LLMClient, LLMError, LLMTransient
from tests.helpers import assert_isolated, register

MSG = [{"role": "user", "content": "x"}]


class Out(BaseModel):
    title: str
    score: int


@pytest.fixture()
def api(app_env: Path) -> Generator[TestClient, None, None]:
    from main import create_app

    with TestClient(create_app()) as c:
        register(c, "alice")
        yield c


def uid(name: str = "alice") -> int:
    with open_db() as db:
        return int(db.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone()["id"])


def wait(user_id: int, job_id: str, status: str, timeout: float = 5.0) -> dict:
    end = time.time() + timeout
    while time.time() < end:
        j = jobs.get_job(user_id, job_id)
        if j["status"] == status:
            return j
        time.sleep(0.02)
    raise AssertionError(f"job stuck at {jobs.get_job(user_id, job_id)['status']}, wanted {status}")


# ---------- usage ----------
def test_usage_adds_up_and_quota_blocks(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    u = uid()
    usage.record(u, "cv", "fake", "complete", 100, 50)
    assert usage.month_tokens(u) == 150
    monkeypatch.setenv("MONTHLY_TOKEN_QUOTA", "150")
    with pytest.raises(HTTPException) as e:
        usage.check_quota(u)
    assert e.value.status_code == 429
    monkeypatch.setenv("MONTHLY_TOKEN_QUOTA", "0")
    usage.check_quota(u)


def test_usage_is_per_user(api: TestClient) -> None:
    usage.record(uid(), "cv", "fake", "complete", 10, 10)
    assert usage.month_tokens(999) == 0


# ---------- llm ----------
def test_complete_records_usage(api: TestClient) -> None:
    c = LLMClient(FakeAdapter(["hello there"]))
    assert c.complete(MSG, user_id=uid(), module="cv") == "hello there"
    assert usage.month_tokens(uid()) > 0


def test_json_mode_validates_and_strips_fences(api: TestClient) -> None:
    c = LLMClient(FakeAdapter(['```json\n{"title": "a", "score": 3}\n```']))
    assert c.complete_json(MSG, Out, user_id=uid(), module="cv") == Out(title="a", score=3)


def test_json_mode_repairs_once(api: TestClient) -> None:
    c = LLMClient(FakeAdapter(['{"title": "a"}', '{"title": "a", "score": 9}']))
    assert c.complete_json(MSG, Out, user_id=uid(), module="cv").score == 9


def test_json_mode_gives_up_after_repair(api: TestClient) -> None:
    c = LLMClient(FakeAdapter(["not json", "still not"]))
    with pytest.raises(LLMError):
        c.complete_json(MSG, Out, user_id=uid(), module="cv")


def test_transient_errors_retry_with_backoff(api: TestClient) -> None:
    sleeps: list[float] = []
    c = LLMClient(FakeAdapter([LLMTransient("429"), LLMTransient("503"), "fine"]), sleep=sleeps.append)
    assert c.complete(MSG, user_id=uid(), module="cv") == "fine"
    assert sleeps == [1.0, 2.0]


def test_permanent_errors_do_not_retry(api: TestClient) -> None:
    fake = FakeAdapter([LLMError("bad key"), "never"])
    with pytest.raises(LLMError):
        LLMClient(fake, sleep=lambda s: None).complete(MSG, user_id=uid(), module="cv")
    assert len(fake.calls) == 1


def test_stream_yields_and_records(api: TestClient) -> None:
    c = LLMClient(FakeAdapter(["streamed answer"]))
    assert "".join(c.stream(MSG, user_id=uid(), module="cv")) == "streamed answer"
    assert usage.month_tokens(uid()) > 0


def test_quota_stops_llm_calls(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    usage.record(uid(), "cv", "fake", "complete", 10, 10)
    monkeypatch.setenv("MONTHLY_TOKEN_QUOTA", "5")
    fake = FakeAdapter(["x"])
    with pytest.raises(HTTPException):
        LLMClient(fake).complete(MSG, user_id=uid(), module="cv")
    assert fake.calls == []


def test_concurrency_limit(api: TestClient) -> None:
    active = peak = 0
    lock = threading.Lock()

    def reply(_m: list) -> str:
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(0.05)
        with lock:
            active -= 1
        return "ok"

    c = LLMClient(FakeAdapter(reply), concurrency=2)
    u = uid()
    ts = [threading.Thread(target=c.complete, args=(MSG,), kwargs={"user_id": u, "module": "cv"}) for _ in range(6)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert peak == 2


def test_lmstudio_rejects_non_local_url() -> None:
    with pytest.raises(LLMError):
        llm.LMStudioAdapter(base_url="http://example.com/v1")
    assert llm.LMStudioAdapter(base_url="http://localhost:1234/v1").base == "http://localhost:1234/v1"


def test_openai_needs_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(LLMError):
        llm.OpenAIAdapter()


# ---------- jobs ----------
def test_job_runs_and_reports_result(api: TestClient) -> None:
    def work(ctx: jobs.JobContext) -> dict:
        ctx.progress(0.5, "half")
        return {"n": ctx.payload["n"] * 2}

    jobs.register_handler("t_double", work)
    j = jobs.enqueue(uid(), "t_double", {"n": 21})
    done = wait(uid(), j, "done")
    assert done["result"] == {"n": 42} and done["progress"] == 1.0
    assert api.get(f"/api/tasks/{j}").json()["status"] == "done"


def test_job_failure_is_recorded(api: TestClient) -> None:
    def boom(_ctx: jobs.JobContext) -> None:
        raise ValueError("bad input")

    jobs.register_handler("t_boom", boom)
    j = jobs.enqueue(uid(), "t_boom")
    assert "ValueError" in wait(uid(), j, "failed")["error"]


def test_unknown_kind_fails(api: TestClient) -> None:
    j = jobs.enqueue(uid(), "t_nobody")
    assert "no handler" in wait(uid(), j, "failed")["error"]


def test_running_job_can_be_cancelled(api: TestClient) -> None:
    started = threading.Event()

    def slow(ctx: jobs.JobContext) -> None:
        started.set()
        for _ in range(500):
            time.sleep(0.01)
            ctx.check()

    jobs.register_handler("t_slow", slow)
    j = jobs.enqueue(uid(), "t_slow")
    assert started.wait(2)
    assert api.post(f"/api/tasks/{j}/cancel").status_code == 200
    wait(uid(), j, "cancelled")


def test_queued_job_cancelled_never_runs(api: TestClient) -> None:
    ran: list[int] = []
    gate = threading.Event()
    jobs.register_handler("t_gate", lambda ctx: gate.wait(5))
    jobs.register_handler("t_mark", lambda ctx: ran.append(1))
    blockers = [jobs.enqueue(uid(), "t_gate") for _ in range(2)]  # fill both workers
    for b in blockers:
        wait(uid(), b, "running")
    queued = jobs.enqueue(uid(), "t_mark")
    assert jobs.cancel_job(uid(), queued)["status"] == "cancelled"
    gate.set()
    for b in blockers:
        wait(uid(), b, "done")
    time.sleep(0.1)
    assert ran == [] and jobs.get_job(uid(), queued)["status"] == "cancelled"


def test_recover_requeues_interrupted_jobs(api: TestClient) -> None:
    jobs.register_handler("t_after_restart", lambda ctx: "ran")
    t = int(time.time() * 1000)
    with open_db() as db, db:
        db.execute(
            "INSERT INTO bg_jobs(id, user_id, kind, status, payload, created, updated) VALUES ('stuck1', ?, 't_after_restart', 'running', '{}', ?, ?)",
            (uid(), t, t),
        )
    assert jobs.recover() >= 1
    assert wait(uid(), "stuck1", "done")["result"] == "ran"


def test_job_sse_streams_until_done(api: TestClient) -> None:
    jobs.register_handler("t_sse", lambda ctx: "x")
    j = jobs.enqueue(uid(), "t_sse")
    assert '"status": "done"' in api.get(f"/api/tasks/{j}/events").text


def test_jobs_are_private_to_their_owner(app_env: Path) -> None:
    from main import create_app

    app = create_app()
    with TestClient(app) as alice, TestClient(app) as bobby:
        register(alice, "alice")
        register(bobby, "bobby")
        jobs.register_handler("t_priv", lambda ctx: 1)
        j = jobs.enqueue(uid("alice"), "t_priv")
        wait(uid("alice"), j, "done")
        assert_isolated(alice, bobby, "GET", f"/api/tasks/{j}")
        assert bobby.post(f"/api/tasks/{j}/cancel").status_code == 404
        assert bobby.get(f"/api/tasks/{j}/events").status_code == 404


# ---------- files ----------
def test_files_roundtrip_and_isolation(api: TestClient) -> None:
    fid = files.save_file(uid(), "cv.txt", "text/plain", b"hello", text="hello")
    assert files.get_file(uid(), fid)["data"] == b"hello"
    with pytest.raises(HTTPException) as e:
        files.get_file(uid() + 1, fid)
    assert e.value.status_code == 404
    files.delete_file(uid(), fid)
    with pytest.raises(HTTPException):
        files.get_file(uid(), fid)


def test_file_size_cap_and_user_quota(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MAX_FILE_BYTES", "10")
    monkeypatch.setenv("FILES_QUOTA_BYTES", "15")
    with pytest.raises(HTTPException) as e:
        files.save_file(uid(), "big", "text/plain", b"x" * 11)
    assert e.value.status_code == 413
    files.save_file(uid(), "a", "text/plain", b"x" * 10)
    with pytest.raises(HTTPException) as e2:
        files.save_file(uid(), "b", "text/plain", b"x" * 10)
    assert e2.value.status_code == 413
    assert files.used_bytes(uid()) == 10


def test_empty_file_rejected(api: TestClient) -> None:
    with pytest.raises(HTTPException):
        files.save_file(uid(), "e", "text/plain", b"")


# ---------- provider choice ----------
def test_providers_list_follows_server_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    from dc_platform import llm_providers

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    by = {p["id"]: p for p in llm_providers.providers()}
    assert by["openai"]["available"] and not by["anthropic"]["available"] and by["lmstudio"]["available"] and by["ollama"]["available"]


def test_anthropic_adapter_shapes_the_request(monkeypatch: pytest.MonkeyPatch) -> None:
    from dc_platform import llm_providers

    with pytest.raises(LLMError):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        llm_providers.AnthropicAdapter()
    a = llm_providers.AnthropicAdapter(api_key="k")
    p = a._payload([{"role": "system", "content": "Be brief."}, {"role": "user", "content": "hi"}], True, 0.0, False)
    assert p["system"].startswith("Be brief.") and "JSON" in p["system"] and p["messages"] == [{"role": "user", "content": "hi"}]
    assert a.base.startswith("https://api.anthropic.com")


def test_ollama_is_local_only() -> None:
    from dc_platform import llm_providers

    with pytest.raises(LLMError):
        llm_providers.OllamaAdapter(base_url="http://example.com/v1")
    assert llm_providers.OllamaAdapter(base_url="http://localhost:11434/v1").base == "http://localhost:11434/v1"


def test_user_picks_a_provider_and_can_test_it(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    s = api.get("/api/llm/settings").json()
    assert s["current"] is None and {p["id"] for p in s["providers"]} == {"openai", "anthropic", "lmstudio", "ollama"}
    assert api.put("/api/llm/settings", json={"provider": "nope"}).status_code == 400
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert api.put("/api/llm/settings", json={"provider": "anthropic"}).status_code == 400  # no server key, so it cannot be chosen
    assert api.put("/api/llm/settings", json={"provider": "ollama", "model": "llama3"}).json()["current"] == {"provider": "ollama", "model": "llama3"}
    llm.set_adapter_factory(lambda: FakeAdapter(["ok"]))
    try:
        assert api.post("/api/llm/test").json() == {"ok": True, "reply": "ok"}
    finally:
        llm.set_adapter_factory(None)
    assert api.delete("/api/llm/settings").json()["current"] is None


def test_provider_choice_is_per_user_and_private(api: TestClient) -> None:
    from tests.helpers import register

    api.put("/api/llm/settings", json={"provider": "lmstudio", "model": "m1"})
    other = TestClient(api.app)
    register(other, "bobby")
    assert other.get("/api/llm/settings").json()["current"] is None
    assert TestClient(api.app).get("/api/llm/settings").status_code == 401


def test_chosen_provider_is_used_for_calls(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from dc_platform import llm_providers

    api.put("/api/llm/settings", json={"provider": "lmstudio", "model": "m1"})
    c = llm.client_for(uid())
    assert isinstance(c.adapter, llm_providers.LMStudioAdapter) and c.adapter.model == "m1"
