from __future__ import annotations

import time
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from dc_platform import llm
from tests.cv_fixtures import CV_TEXT, JD_TEXT, fake_llm, judge_reply, make_pdf
from tests.helpers import assert_isolated, two_users

REWRITE = {
    "proposals": [
        {"bullet_ref": "exp.0.1", "proposed": "Built and scaled REST APIs in Python and FastAPI, serving 2M requests per day", "reason": "Shows scale for the FastAPI requirement"},
        {"bullet_ref": "exp.9.9", "proposed": "A bullet that does not exist", "reason": "invented reference"},
        {"bullet_ref": "exp.0.0", "proposed": "Led the Kubernetes migration, cutting deploy time by 85%", "reason": "Kubernetes gap"},
    ]
}


@pytest.fixture()
def clients(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[tuple[TestClient, TestClient], None, None]:
    monkeypatch.setenv("ENABLED_MODULES", "design,cv")
    from main import create_app

    alice, bobby = two_users(lambda: TestClient(create_app()))
    llm.set_adapter_factory(lambda: fake_llm(judge=judge_reply(), rewrite=REWRITE))
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


def upload(c: TestClient, name: str = "jane.txt", data: bytes | None = None, **params: str) -> dict[str, Any]:
    r = c.post("/api/cv/upload", params={"name": name, **params}, content=data if data is not None else CV_TEXT.encode(), headers={"content-type": "text/plain"})
    assert r.status_code == 200, r.text
    body = r.json()
    wait_job(c, body["jobId"])
    return c.get(f"/api/cv/{body['id']}").json()


def score(c: TestClient, cv_id: int | None = None, mode: str = "fast", jd: str = JD_TEXT) -> dict[str, Any]:
    r = c.post("/api/cv/score", json={"cvId": cv_id, "mode": mode, "jds": [{"text": jd, "title": "Backend"}]})
    assert r.status_code == 200, r.text
    run = r.json()["runs"][0]
    if not run["cached"]:
        assert wait_job(c, run["jobId"])["status"] == "done"
    return c.get(f"/api/cv/score/{run['id']}").json() | {"_cached": run["cached"]}


# ---------------------------------------------------------------- upload and library

def test_upload_parses_then_model_structure_arrives(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    cv = upload(alice)
    assert cv["active"] is True and cv["name"] == "jane"
    v = cv["latest"]
    assert v["structureSource"] == "model" and v["parseQuality"] > 50 and "Kubernetes" in v["rawText"]
    assert v["structure"]["experience"][0]["employer"] == "Acme Pay" and v["totalYears"] > 5


def test_structure_falls_back_to_rules_when_the_model_fails(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODULES", "design,cv")
    from main import create_app

    llm.set_adapter_factory(lambda: fake_llm(structure=None))
    try:
        alice, _ = two_users(lambda: TestClient(create_app()))
        cv = upload(alice)
    finally:
        llm.set_adapter_factory(None)
    assert cv["latest"]["structureSource"] == "rules" and len(cv["latest"]["structure"]["experience"]) == 2


def test_upload_rejections(clients: tuple[TestClient, TestClient], monkeypatch: pytest.MonkeyPatch) -> None:
    alice, _ = clients
    h = {"content-type": "application/pdf"}
    assert alice.post("/api/cv/upload", params={"name": "scan.pdf"}, content=make_pdf([[]]), headers=h).status_code == 422
    assert alice.post("/api/cv/upload", params={"name": "x.pdf"}, content=b"junk", headers=h).status_code == 400
    assert alice.post("/api/cv/upload", params={"name": "x.txt"}, content=b"", headers=h).status_code in {400, 422}
    monkeypatch.setenv("MAX_FILE_BYTES", "100")
    assert alice.post("/api/cv/upload", params={"name": "big.txt"}, content=CV_TEXT.encode(), headers=h).status_code == 413
    assert alice.get("/api/cv").json() == []  # nothing half-saved


def test_library_activate_rename_delete(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    a = upload(alice, "a.txt", cvName="backend")
    b = upload(alice, "b.txt", cvName="platform")
    assert a["active"] and not b["active"]
    assert alice.post(f"/api/cv/{b['id']}/activate").json()["active"] is True
    assert [c["active"] for c in alice.get("/api/cv").json()] == [True, False]
    assert alice.patch(f"/api/cv/{a['id']}", json={"name": "renamed"}).json()["name"] == "renamed"
    assert alice.get("/api/cv/active").json()["id"] == b["id"]
    alice.delete(f"/api/cv/{b['id']}")
    assert alice.get("/api/cv").json()[0]["active"] is True  # another CV takes over as active
    alice.delete(f"/api/cv/{a['id']}")
    assert alice.get("/api/cv/active").status_code == 404


def test_editing_structure_makes_a_new_version_and_keeps_the_old(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    cv = upload(alice)
    edited = cv["latest"]["structure"] | {"skills": ["Python", "Kafka"]}
    out = alice.patch(f"/api/cv/{cv['id']}/structure", json=edited).json()
    assert out["latest"]["edited"] is True and out["latest"]["structure"]["skills"] == ["Python", "Kafka"]
    assert len(out["versions"]) == 2 and out["latest"]["rawText"] == cv["latest"]["rawText"]
    assert alice.post(f"/api/cv/{cv['id']}/extract").status_code == 409  # would overwrite the edit


def test_jd_upload_returns_text_and_stores_nothing(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    r = alice.post("/api/cv/jd/upload", params={"name": "jd.txt"}, content=JD_TEXT.encode())
    assert r.status_code == 200 and "Kafka" in r.json()["text"]
    assert alice.get("/api/cv").json() == []


# ---------------------------------------------------------------- scoring

def test_score_flow_and_cache(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    cv = upload(alice)
    s = score(alice, cv["id"], "deep")
    assert s["status"] == "done" and s["mode"] == "deep" and 0 < s["total"] <= 100 and s["rubricVersion"] == "1.0" and s["model"] == "fake"
    assert {c["key"] for c in s["breakdown"]["components"]} == {"must", "nice", "experience", "evidence", "domain"}
    assert s["analysis"]["talking_points"] and s["analysis"]["questions_to_ask"]
    again = score(alice, cv["id"], "deep")
    assert again["_cached"] is True and again["id"] == s["id"]
    assert score(alice, cv["id"], "fast")["id"] != s["id"]  # a different mode is a different run


def test_score_without_a_cv_is_a_clear_error(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    r = alice.post("/api/cv/score", json={"mode": "fast", "jds": [{"text": JD_TEXT}]})
    assert r.status_code == 400 and "Upload a CV" in r.json()["detail"]


def test_score_rejects_tiny_or_too_many_jds(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    upload(alice)
    assert alice.post("/api/cv/score", json={"jds": [{"text": "hi"}]}).status_code == 422
    assert alice.post("/api/cv/score", json={"jds": [{"text": JD_TEXT + str(i)} for i in range(6)]}).status_code == 422


def test_several_jds_queue_together(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    upload(alice)
    r = alice.post("/api/cv/score", json={"mode": "fast", "jds": [{"text": JD_TEXT + f"\nTeam {i}"} for i in range(3)]})
    runs = r.json()["runs"]
    assert len({x["id"] for x in runs}) == 3
    assert all(wait_job(alice, x["jobId"])["status"] == "done" for x in runs)


def test_failed_score_is_reported_not_lost(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODULES", "design,cv")
    monkeypatch.setenv("MONTHLY_TOKEN_QUOTA", "1")
    from main import create_app

    llm.set_adapter_factory(lambda: fake_llm())
    try:
        alice, _ = two_users(lambda: TestClient(create_app()))
        from db import open_db

        with open_db() as db:
            uid = db.execute("SELECT id FROM users WHERE username='alice'").fetchone()["id"]
        cv = upload(alice)
        from dc_platform import usage

        usage.record(uid, "cv", "fake", "x", 10, 10)  # the monthly quota is now used up
        r = alice.post("/api/cv/score", json={"cvId": cv["id"], "jds": [{"text": JD_TEXT}]}).json()["runs"][0]
        assert wait_job(alice, r["jobId"])["status"] == "failed"
    finally:
        llm.set_adapter_factory(None)
    run = alice.get(f"/api/cv/score/{r['id']}").json()
    assert run["status"] == "failed" and "usage limit" in run["error"]  # the user is told why, and the run stays in history
    assert alice.get("/api/cv/score/history").json()[0]["status"] == "failed"


# ---------------------------------------------------------------- rewrites and re-score

def test_rewrite_approve_rescore(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    cv = upload(alice)
    s = score(alice, cv["id"], "fast")
    items = alice.post(f"/api/cv/score/{s['id']}/rewrites").json()
    assert [i["bulletRef"] for i in items] == ["exp.0.1", "exp.0.0"]  # the invented reference was dropped
    assert items[0]["original"] == cv["latest"]["structure"]["experience"][0]["bullets"][1]  # original text comes from the CV
    assert items[1]["reason"].startswith("Check the figure")  # 85% is not in the original bullet
    assert alice.post(f"/api/cv/score/{s['id']}/rescore").status_code == 400  # nothing approved yet

    assert alice.patch(f"/api/cv/rewrites/{items[0]['id']}", json={"status": "approved"}).json()["status"] == "approved"
    alice.patch(f"/api/cv/rewrites/{items[1]['id']}", json={"status": "rejected"})
    r = alice.post(f"/api/cv/score/{s['id']}/rescore").json()
    assert wait_job(alice, r["jobId"])["status"] == "done"
    new = alice.get(f"/api/cv/score/{r['id']}").json()
    assert new["rescoredFrom"] == s["id"] and new["cvVersionId"] == r["cvVersionId"] != s["cvVersionId"]
    after = alice.get(f"/api/cv/{cv['id']}").json()
    bullets = after["latest"]["structure"]["experience"][0]["bullets"]
    assert bullets[1].startswith("Built and scaled") and bullets[0].startswith("Led the migration")  # rejected one untouched
    assert len(after["versions"]) == 2  # the original version is kept
    assert [x["status"] for x in alice.get(f"/api/cv/score/{s['id']}/rewrites").json()] == ["applied", "rejected"]
    assert alice.patch(f"/api/cv/rewrites/{items[0]['id']}", json={"status": "rejected"}).status_code == 409


def test_rewrites_wait_for_a_finished_score(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    cv = upload(alice)
    from db import open_db
    from modules.cv import service

    with open_db() as db:
        uid = db.execute("SELECT id FROM users WHERE username='alice'").fetchone()["id"]
    run_id, _ = service.create_run(uid, cv["latest"]["id"], jd_text=JD_TEXT, jd_title="", mode="fast", rubric_version="1.0", model="fake")
    assert alice.post(f"/api/cv/score/{run_id}/rewrites").status_code == 409


# ---------------------------------------------------------------- history, export, delete

def test_history_filter_delete_export(clients: tuple[TestClient, TestClient]) -> None:
    alice, _ = clients
    cv = upload(alice)
    s1 = score(alice, cv["id"], "fast")
    score(alice, cv["id"], "deep", jd=JD_TEXT + "\nExtra line about teams")
    h = alice.get("/api/cv/score/history").json()
    assert len(h) == 2 and h[0]["cvName"] == "jane" and "jdText" not in h[0]
    assert alice.get("/api/cv/score/history", params={"band": s1["band"]}).json()
    assert alice.get("/api/cv/score/history", params={"cvId": 9999}).json() == []
    assert alice.delete(f"/api/cv/score/{s1['id']}").status_code == 200
    assert len(alice.get("/api/cv/score/history").json()) == 1
    exp = alice.get("/api/cv/export").json()
    assert len(exp["cvs"]) == 1 and len(exp["scores"]) == 1 and "Kubernetes" in exp["cvs"][0]["latest"]["rawText"]
    alice.delete(f"/api/cv/{cv['id']}")
    assert alice.get("/api/cv/score/history").json() == []  # scores go with their CV


def test_delete_my_data_removes_everything_including_files(clients: tuple[TestClient, TestClient]) -> None:
    alice, bobby = clients
    cv = upload(alice)
    score(alice, cv["id"])
    upload(bobby)
    assert alice.delete("/api/cv/data").status_code == 200
    assert alice.get("/api/cv").json() == [] and alice.get("/api/cv/score/history").json() == []
    from db import open_db

    with open_db() as db:
        assert db.execute("SELECT COUNT(*) FROM files f JOIN users u ON u.id=f.user_id WHERE u.username='alice'").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM files f JOIN users u ON u.id=f.user_id WHERE u.username='bobby'").fetchone()[0] == 1
    assert len(bobby.get("/api/cv").json()) == 1  # other users are untouched


# ---------------------------------------------------------------- isolation

def test_every_route_is_private_to_its_owner(clients: tuple[TestClient, TestClient]) -> None:
    alice, bobby = clients
    cv = upload(alice)
    s = score(alice, cv["id"])
    rewrites = alice.post(f"/api/cv/score/{s['id']}/rewrites").json()
    cid, rid, wid = cv["id"], s["id"], rewrites[0]["id"]

    for path in (f"/api/cv/{cid}", f"/api/cv/score/{rid}", f"/api/cv/score/{rid}/rewrites"):
        assert_isolated(alice, bobby, "GET", path)
    assert bobby.get("/api/cv").json() == [] and bobby.get("/api/cv/score/history").json() == []
    assert bobby.get("/api/cv/active").status_code == 404
    assert bobby.get("/api/cv/export").json() == {"cvs": [], "scores": [], "rewrites": []}

    jd = {"jds": [{"text": JD_TEXT}]}
    attacks = [
        ("PATCH", f"/api/cv/{cid}", {"json": {"name": "x"}}),
        ("PATCH", f"/api/cv/{cid}/structure", {"json": {}}),
        ("POST", f"/api/cv/{cid}/activate", {}),
        ("POST", f"/api/cv/{cid}/extract", {}),
        ("DELETE", f"/api/cv/{cid}", {}),
        ("POST", "/api/cv/score", {"json": {"cvId": cid, **jd}}),
        ("DELETE", f"/api/cv/score/{rid}", {}),
        ("POST", f"/api/cv/score/{rid}/rewrites", {}),
        ("POST", f"/api/cv/score/{rid}/rescore", {}),
        ("PATCH", f"/api/cv/rewrites/{wid}", {"json": {"status": "approved"}}),
    ]
    for method, path, kw in attacks:
        assert bobby.request(method, path, **kw).status_code == 404, f"{method} {path} leaked"
        anon = TestClient(alice.app).request(method, path, **kw)
        assert anon.status_code == 401, f"{method} {path} open to anonymous"
    # nothing was changed by the attempts
    assert alice.get(f"/api/cv/{cid}").status_code == 200 and alice.get(f"/api/cv/score/{rid}").json()["status"] == "done"
    assert alice.get(f"/api/cv/score/{rid}/rewrites").json()[0]["status"] == "pending"


def test_anonymous_cannot_use_the_upload_routes(clients: tuple[TestClient, TestClient]) -> None:
    anon = TestClient(clients[0].app)
    assert anon.post("/api/cv/upload", params={"name": "a.txt"}, content=b"x").status_code == 401
    assert anon.post("/api/cv/jd/upload", params={"name": "a.txt"}, content=b"x").status_code == 401
    assert anon.get("/api/cv").status_code == 401


def test_cv_is_off_by_default(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ENABLED_MODULES", raising=False)
    from main import create_app

    app = create_app()
    assert not any(getattr(r, "path", "").startswith("/api/cv") for r in app.routes)
