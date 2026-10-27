"""Shared test helpers for module tests: two users and a cross-user isolation check."""
from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient

INVITE = "test-invite"


def register(client: TestClient, username: str) -> None:
    r = client.post("/api/auth/register", json={"username": username, "password": "password1", "inviteCode": INVITE})
    assert r.status_code == 200, r.text


def two_users(app_factory: Callable[[], TestClient]) -> tuple[TestClient, TestClient]:
    """Two independent clients (separate cookie jars) signed in as alice and bobby on the same app."""
    a, b = app_factory(), app_factory()
    register(a, "alice")
    register(b, "bobby")
    return a, b


def assert_isolated(owner: TestClient, other: TestClient, method: str, path: str, **kw: object) -> None:
    """The owner can reach `path`; another signed-in user gets 404, and anonymous gets 401."""
    ok = owner.request(method, path, **kw)  # type: ignore[arg-type]
    assert ok.status_code < 400, f"owner could not reach {path}: {ok.status_code} {ok.text}"
    assert other.request(method, path, **kw).status_code == 404, f"{path} leaked to another user"  # type: ignore[arg-type]
    anon = TestClient(owner.app)
    assert anon.request(method, path, **kw).status_code == 401  # type: ignore[arg-type]
