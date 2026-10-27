from __future__ import annotations

import sqlite3
import sys
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import modules
from dc_platform.migrations import run_migrations
from tests.helpers import assert_isolated, two_users

ROOT = Path(__file__).resolve().parents[2]

OK_MODULE = """
from fastapi import APIRouter, HTTPException
from deps import CurrentUser
from db import open_db

router = APIRouter()


@router.get("/ping")
def ping():
    return {"pong": True}


@router.get("/mine/{item_id}")
def mine(item_id: int, user: CurrentUser):
    with open_db() as db:
        row = db.execute("SELECT body FROM okmod_items WHERE id=? AND user_id=?", (item_id, user["id"])).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return {"body": row["body"]}
"""
OK_MIGRATION = (
    "CREATE TABLE IF NOT EXISTS okmod_items(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, body TEXT NOT NULL);\n"
    "CREATE INDEX IF NOT EXISTS ix_okmod_user ON okmod_items(user_id);\n"
)
BROKEN_MODULE = "import this_package_does_not_exist\nrouter = None\n"


@pytest.fixture()
def scratch(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Path, None, None]:
    """A scratch package of modules: okmod works, brokenmod fails to import."""
    pkg = tmp_path / "scratchmods"
    (pkg / "okmod" / "migrations").mkdir(parents=True)
    (pkg / "brokenmod").mkdir()
    (pkg / "__init__.py").write_text("")
    (pkg / "okmod" / "__init__.py").write_text(OK_MODULE)
    (pkg / "okmod" / "migrations" / "001_items.sql").write_text(OK_MIGRATION)
    (pkg / "brokenmod" / "__init__.py").write_text(BROKEN_MODULE)
    monkeypatch.syspath_prepend(str(tmp_path))
    monkeypatch.setattr(modules, "PACKAGE", "scratchmods")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.sqlite3"))
    monkeypatch.setenv("INVITE_CODE", "test-invite")
    monkeypatch.setenv("PROBLEMS_DIR", str(ROOT / "app" / "src" / "problems"))
    yield pkg
    for name in [n for n in sys.modules if n.startswith("scratchmods")]:
        del sys.modules[name]


def make_client() -> TestClient:
    from main import create_app

    return TestClient(create_app())


def has_route(c: TestClient, prefix: str) -> bool:
    # the SPA catch-all answers unknown paths with index.html, so check the route table, not the status
    return any(getattr(r, "path", "").startswith(prefix) for r in c.app.routes)


def tables(db_file: Path) -> set[str]:
    conn = sqlite3.connect(db_file)
    try:
        return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    finally:
        conn.close()


def test_module_off_mounts_nothing(scratch: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODULES", "design")
    with make_client() as c:
        assert c.get("/api/health").json()["ok"] is True
        assert not has_route(c, "/api/okmod")
    assert modules.migration_dirs() == {}
    assert "okmod_items" not in tables(scratch.parent / "t.sqlite3")


def test_default_is_design_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ENABLED_MODULES", raising=False)
    assert modules.enabled_modules() == ["design"]


def test_broken_module_is_skipped(scratch: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODULES", "design,brokenmod,okmod")
    with make_client() as c:
        assert c.get("/api/health").json()["ok"] is True
        assert c.get("/api/problems").status_code == 200
        assert c.get("/api/okmod/ping").json() == {"pong": True}
        assert not has_route(c, "/api/brokenmod")
    assert set(modules.migration_dirs()) == {"okmod"}
    assert "okmod_items" in tables(scratch.parent / "t.sqlite3")


def test_bad_module_name_is_skipped(scratch: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODULES", "design,../evil")
    with make_client() as c:
        assert c.get("/api/health").json()["ok"] is True
    assert modules.migration_dirs() == {}


def test_module_data_is_isolated_per_user(scratch: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_MODULES", "design,okmod")
    alice, bobby = two_users(make_client)
    from db import open_db

    with open_db() as db:
        uid = db.execute("SELECT id FROM users WHERE username='alice'").fetchone()["id"]
        db.execute("INSERT INTO okmod_items(id, user_id, body) VALUES(1, ?, 'secret')", (uid,))
        db.commit()
    assert_isolated(alice, bobby, "GET", "/api/okmod/mine/1")


def test_migrations_idempotent_on_existing_db(tmp_path: Path) -> None:
    d = tmp_path / "m"
    d.mkdir()
    (d / "001_a.sql").write_text("CREATE TABLE a(id INTEGER);")
    (d / "002_b.sql").write_text("CREATE TABLE b(id INTEGER);")
    conn = sqlite3.connect(tmp_path / "x.sqlite3")
    conn.execute("CREATE TABLE users(id INTEGER PRIMARY KEY)")  # pre-existing Design Canvas data
    conn.execute("INSERT INTO users(id) VALUES(7)")
    conn.commit()
    assert run_migrations(conn, "m", d) == [1, 2]
    assert run_migrations(conn, "m", d) == []
    assert conn.execute("SELECT id FROM users").fetchall() == [(7,)]
    assert conn.execute("SELECT count(*) FROM schema_migrations").fetchone()[0] == 2
    conn.close()


def test_failed_migration_rolls_back(tmp_path: Path) -> None:
    d = tmp_path / "m"
    d.mkdir()
    (d / "001_bad.sql").write_text("CREATE TABLE t(id INTEGER);\nTHIS IS NOT SQL;")
    conn = sqlite3.connect(tmp_path / "x.sqlite3")
    with pytest.raises(sqlite3.Error):
        run_migrations(conn, "m", d)
    assert conn.execute("SELECT name FROM sqlite_master WHERE name='t'").fetchone() is None
    assert conn.execute("SELECT count(*) FROM schema_migrations").fetchone()[0] == 0
    conn.close()
