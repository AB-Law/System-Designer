from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.helpers import register

DOC = {"nodes": [{"id": "n1", "position": {"x": 0, "y": 0}, "data": {"blockId": "server", "cfg": {}, "responsibilities": []}}], "edges": []}


@pytest.fixture()
def make_client(app_env: Path) -> Generator[object, None, None]:
    from main import create_app

    app = create_app()
    clients: list[TestClient] = []

    def make() -> TestClient:
        c = TestClient(app)
        c.__enter__()
        clients.append(c)
        return c

    yield make
    for c in clients:
        c.__exit__(None, None, None)


def test_list_is_empty_before_anything_is_saved(make_client) -> None:  # type: ignore[no-untyped-def]
    c = make_client()
    register(c, "alice")
    r = c.get("/api/designs")
    assert r.status_code == 200
    assert r.json() == []


def test_list_returns_every_saved_design_newest_first(make_client) -> None:  # type: ignore[no-untyped-def]
    c = make_client()
    register(c, "alice")
    assert c.put("/api/designs/personal_blog", json={"doc": DOC, "updated": 1000}).status_code == 200
    assert c.put("/api/designs/url_shortener", json={"doc": DOC, "updated": 2000}).status_code == 200
    rows = c.get("/api/designs").json()
    assert [r["problemId"] for r in rows] == ["url_shortener", "personal_blog"]
    assert rows[0]["updated"] == 2000
    assert rows[0]["doc"]["nodes"][0]["id"] == "n1"


def test_list_only_shows_your_own_designs_and_needs_sign_in(make_client) -> None:  # type: ignore[no-untyped-def]
    a, b = make_client(), make_client()
    register(a, "alice")
    register(b, "bobby")
    a.put("/api/designs/personal_blog", json={"doc": DOC, "updated": 5})
    assert b.get("/api/designs").json() == []
    assert len(a.get("/api/designs").json()) == 1
    assert TestClient(a.app).get("/api/designs").status_code == 401
