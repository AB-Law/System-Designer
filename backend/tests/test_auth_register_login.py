from __future__ import annotations

from fastapi.testclient import TestClient


def test_register_login_me(client: TestClient) -> None:
    bad = client.post("/api/auth/register", json={"username": "alice", "password": "password1", "inviteCode": "wrong"})
    assert bad.status_code == 403

    reg = client.post("/api/auth/register", json={"username": "alice", "password": "password1", "inviteCode": "test-invite"})
    assert reg.status_code == 200, reg.text
    body = reg.json()
    assert body["user"]["username"] == "alice"
    assert "token" in body

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["username"] == "alice"

    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401

    login = client.post("/api/auth/login", json={"username": "alice", "password": "password1"})
    assert login.status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_duplicate_username(client: TestClient) -> None:
    payload = {"username": "bob", "password": "password1", "inviteCode": "test-invite"}
    assert client.post("/api/auth/register", json=payload).status_code == 200
    assert client.post("/api/auth/register", json=payload).status_code == 409
