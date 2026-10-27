"""Per-module schema migrations: numbered .sql files, applied once, additive only."""
from __future__ import annotations

import logging
import re
import sqlite3
import time
from pathlib import Path

log = logging.getLogger("dc.migrations")

_MODULE = re.compile(r"^[a-z][a-z0-9_]*$")
_NAME = re.compile(r"^(\d+)_[A-Za-z0-9_]+\.sql$")
_DONE: set[tuple[str, str]] = set()  # (db file, module) already migrated by this process

TABLE = "CREATE TABLE IF NOT EXISTS schema_migrations(module TEXT NOT NULL, version INTEGER NOT NULL, applied INTEGER NOT NULL, PRIMARY KEY(module, version))"


def migration_files(directory: Path) -> list[tuple[int, Path]]:
    found: list[tuple[int, Path]] = []
    if not directory.is_dir():
        return found
    for f in directory.iterdir():
        m = _NAME.match(f.name)
        if m:
            found.append((int(m.group(1)), f))
    found.sort()
    versions = [v for v, _ in found]
    if len(versions) != len(set(versions)):
        raise ValueError(f"duplicate migration version in {directory}")
    return found


def run_migrations(conn: sqlite3.Connection, module: str, directory: Path) -> list[int]:
    """Apply every unapplied migration for `module`, in order. Returns the versions applied."""
    if not _MODULE.match(module):
        raise ValueError(f"bad module name {module!r}")
    conn.execute(TABLE)
    done = {r[0] for r in conn.execute("SELECT version FROM schema_migrations WHERE module=?", (module,))}
    applied: list[int] = []
    for version, path in migration_files(directory):
        if version in done:
            continue
        sql = path.read_text(encoding="utf-8")
        try:
            # one transaction per file: either the whole migration and its record land, or neither
            conn.executescript(f"BEGIN;\n{sql}\nINSERT INTO schema_migrations(module, version, applied) VALUES('{module}', {version}, {int(time.time())});\nCOMMIT;")
        except sqlite3.Error:
            if conn.in_transaction:
                conn.rollback()
            raise
        applied.append(version)
        log.info("applied %s migration %s", module, path.name)
    return applied


def migrate_loaded_modules(conn: sqlite3.Connection) -> None:
    """Run migrations for every module that loaded. A failing module is logged, never fatal."""
    import modules  # lazy: modules imports nothing from db at import time

    db_file = str(conn.execute("PRAGMA database_list").fetchone()[2])
    for name, directory in modules.migration_dirs().items():
        key = (db_file, name)
        if key in _DONE:
            continue
        try:
            run_migrations(conn, name, directory)
            _DONE.add(key)
        except Exception:
            log.exception("migration for module %r failed; module routes may not work", name)
