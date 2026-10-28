from __future__ import annotations

import threading
from pathlib import Path

import pytest


def test_many_connections_opening_a_new_database_at_once_do_not_collide(app_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import db

    errors: list[BaseException] = []
    barrier = threading.Barrier(8)

    def open_it() -> None:
        try:
            barrier.wait()
            db.connect().close()
        except BaseException as e:  # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=open_it) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []
