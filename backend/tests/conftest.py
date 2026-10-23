from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Isolate DB and invite before app modules open connections
ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.setenv("INVITE_CODE", "test-invite")
    monkeypatch.setenv("PROBLEMS_DIR", str(ROOT / "app" / "src" / "problems"))
    # reload is awkward; create_app reads env at request time for DB_PATH via db_path()
    from main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c
