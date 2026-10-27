"""Interview reference documents: upload, embed job, scoped retrieval, delete, isolation."""
from __future__ import annotations

from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from db import open_db
from dc_platform import embeddings, llm
from tests.helpers import assert_isolated, two_users
from tests.interview_fixtures import DIRECTIVE_MARK, fake_interview_llm
from tests.test_cv_api import wait_job
from tests.test_interview_api import make_role, say, start

DOC = (
    "Acme pays for on-call with a 20 percent premium and expects staff engineers to own Postgres "
    "query performance, including EXPLAIN plans and index design for multi-tenant schemas."
)


@pytest.fixture()
def clients(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[tuple[TestClient, TestClient], None, None]:
    monkeypatch.setenv("ENABLED_MODULES", "design,cv,interview")
    from main import create_app

    alice, bobby = two_users(lambda: TestClient(create_app()))
    llm.set_adapter_factory(lambda: fake_interview_llm())
    yield alice, bobby
    llm.set_adapter_factory(None)


def upload_doc(c: TestClient, text: str = DOC, *, scope: str = "global", role_id: int | None = None, name: str = "notes.txt") -> dict[str, Any]:
    params: dict[str, str] = {"name": name, "scope": scope}
    if role_id is not None:
        params["roleId"] = str(role_id)
    r = c.post("/api/interview/docs", params=params, content=text.encode("utf-8"), headers={"Content-Type": "text/plain"})
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["status"] in ("queued", "running", "ready")
    assert wait_job(c, doc["jobId"])["status"] == "done"
    ready = c.get(f"/api/interview/docs/{doc['id']}").json()
    assert ready["status"] == "ready" and ready["chunkCount"] >= 1
    return ready


def test_upload_lists_and_deletes_a_global_doc(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    doc = upload_doc(alice)
    listed = alice.get("/api/interview/docs").json()
    assert listed[0]["id"] == doc["id"] and listed[0]["scope"] == "global" and listed[0]["bytes"] == len(DOC.encode())
    chunks = alice.get(f"/api/interview/docs/{doc['id']}/chunks").json()
    assert chunks and "Postgres" in chunks[0]["text"]
    assert alice.delete(f"/api/interview/docs/{doc['id']}").status_code == 200
    assert alice.get("/api/interview/docs").json() == []
    with open_db() as db:
        assert db.execute("SELECT COUNT(*) AS n FROM embedding_chunks WHERE source_id=?", (doc["id"],)).fetchone()["n"] == 0


def test_role_scoped_docs_are_filtered(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    a = make_role(alice, title="Backend")
    b = make_role(alice, title="Frontend", company="Other")
    global_doc = upload_doc(alice, "Global company handbook about engineering culture and values at length.")
    role_a = upload_doc(alice, "Backend on-call premium and Postgres ownership notes for Acme staff.", scope="role", role_id=a["id"], name="be.txt")
    role_b = upload_doc(alice, "Frontend design system tokens and accessibility checklist for Other.", scope="role", role_id=b["id"], name="fe.txt")
    for_a = {d["id"] for d in alice.get("/api/interview/docs", params={"role_id": a["id"]}).json()}
    assert for_a == {global_doc["id"], role_a["id"]}
    assert role_b["id"] not in for_a


def test_retrieval_merges_global_and_role_into_the_interviewer_prompt(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    role = make_role(alice)
    upload_doc(alice, DOC, scope="role", role_id=role["id"])
    adapter = fake_interview_llm()
    llm.set_adapter_factory(lambda: adapter)
    sid = start(alice, role["id"])
    events = say(alice, sid)
    assert events[-1]["type"] == "done"
    systems = [m[0]["content"] for m in adapter.calls if m and m[0]["role"] == "system" and DIRECTIVE_MARK in m[0]["content"]]
    assert systems, "expected an interviewer turn"
    assert "<reference>" in systems[-1]
    assert "Postgres" in systems[-1] or "on-call" in systems[-1]


def test_other_role_docs_are_not_retrieved(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    target = make_role(alice, title="Target")
    other = make_role(alice, title="Other")
    upload_doc(alice, "Secret zebra constellation ritual for the other role only and nothing else.", scope="role", role_id=other["id"], name="secret.txt")
    adapter = fake_interview_llm()
    llm.set_adapter_factory(lambda: adapter)
    sid = start(alice, target["id"])
    say(alice, sid)
    systems = [m[0]["content"] for m in adapter.calls if m and DIRECTIVE_MARK in m[0]["content"]]
    assert systems and "zebra constellation" not in systems[-1]


def test_docs_are_private_to_their_owner(clients: tuple[TestClient, TestClient]) -> None:
    alice, bobby = clients
    doc = upload_doc(alice)
    assert_isolated(alice, bobby, "GET", f"/api/interview/docs/{doc['id']}")
    assert_isolated(alice, bobby, "GET", f"/api/interview/docs/{doc['id']}/chunks")
    assert bobby.delete(f"/api/interview/docs/{doc['id']}").status_code == 404
    assert bobby.get("/api/interview/docs").json() == []


def test_role_scope_requires_a_role(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    r = alice.post(
        "/api/interview/docs",
        params={"name": "x.txt", "scope": "role"},
        content=DOC.encode(),
        headers={"Content-Type": "text/plain"},
    )
    assert r.status_code == 400


def test_short_files_are_rejected(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    r = alice.post(
        "/api/interview/docs",
        params={"name": "tiny.txt", "scope": "global"},
        content=b"too short",
        headers={"Content-Type": "text/plain"},
    )
    assert r.status_code == 422


def test_embed_and_store_progresses(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    messages: list[str] = []

    def progress(fraction: float, message: str = "") -> None:
        messages.append(message)

    from db import open_db as odb

    with odb() as db:
        uid = int(db.execute("SELECT id FROM users WHERE username=?", ("alice",)).fetchone()["id"])
    result = embeddings.embed_and_store(uid, "interview_doc", 99, DOC, module="interview", progress=progress)
    assert result["chunks"] >= 1 and messages
    assert embeddings.list_chunks(uid, "interview_doc", 99)


def test_a_large_document_embeds_in_batches_without_hitting_the_call_limit(clients: tuple[TestClient, TestClient], monkeypatch: pytest.MonkeyPatch) -> None:
    alice, _ = clients
    monkeypatch.setenv("LLM_CALLS_PER_10MIN", "5")  # far fewer than the chunk count: per-chunk calls would be refused
    big = "\n\n".join(f"Paragraph {i}: " + "word " * 380 for i in range(90))
    doc = upload_doc(alice, big, name="big.txt")
    assert doc["chunkCount"] > 60
    with open_db() as db:
        assert db.execute("SELECT COUNT(*) AS n FROM usage WHERE kind='embed'").fetchone()["n"] <= 5


def test_a_refused_embedding_never_breaks_the_interview_turn(clients: tuple[TestClient, TestClient], monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException

    alice, _ = clients
    role = make_role(alice)
    upload_doc(alice)
    sid = start(alice, role["id"])

    def refuse(*_a: Any, **_k: Any) -> Any:
        raise HTTPException(429, "Monthly AI usage limit reached.")

    monkeypatch.setattr(llm.LLMClient, "embed", refuse)
    events = say(alice, sid)
    assert events[-1]["type"] == "done"
