from __future__ import annotations

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["problems"] >= 1
    assert body["invalid"] == {}


def test_problems_list(client: TestClient) -> None:
    r = client.get("/api/problems")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 1
    assert "id" in data[0]
