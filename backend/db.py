"""SQLite connection and schema for Design Canvas cloud storage."""
from __future__ import annotations

import sqlite3
import time
from collections.abc import Generator
from contextlib import closing

from config import db_path
from dc_platform.migrations import migrate_loaded_modules

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, pw_salt BLOB NOT NULL, pw_hash BLOB NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS submissions(id INTEGER PRIMARY KEY, problem_id TEXT NOT NULL, at INTEGER NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS designs(user_id INTEGER NOT NULL, problem_id TEXT NOT NULL, doc TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(user_id, problem_id));
CREATE TABLE IF NOT EXISTS versions(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, problem_id TEXT NOT NULL, label TEXT NOT NULL, kind TEXT NOT NULL, score INTEGER, passed INTEGER, total INTEGER, doc TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_versions ON versions(user_id, problem_id, created DESC);
CREATE TABLE IF NOT EXISTS shares(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, problem_id TEXT NOT NULL, label TEXT NOT NULL, doc TEXT NOT NULL, score INTEGER, created INTEGER NOT NULL, revoked INTEGER);
CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, token TEXT NOT NULL, user_id INTEGER NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_comments ON comments(token, created);
CREATE TABLE IF NOT EXISTS cohorts(id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, owner_id INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cohort_members(cohort_id INTEGER NOT NULL, user_id INTEGER NOT NULL, joined INTEGER NOT NULL, PRIMARY KEY(cohort_id, user_id));
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT NOT NULL, at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_rate_limits ON rate_limits(key, at);
"""


def _prepare(conn: sqlite3.Connection) -> None:
    """Pragmas and schema. Safe to run again, and by several connections at once."""
    # WAL is required for Litestream; busy_timeout avoids lock errors under concurrent reads (set first, so the WAL switch waits too).
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.executescript(SCHEMA)
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(submissions)")}
    for col, typ in (("user_id", "INTEGER"), ("score", "INTEGER"), ("passed", "INTEGER"), ("total", "INTEGER")):
        if col not in cols:
            try:
                conn.execute(f"ALTER TABLE submissions ADD COLUMN {col} {typ}")
            except sqlite3.OperationalError as e:  # another connection added it between the check and now
                if "duplicate column" not in str(e):
                    raise
    conn.execute("CREATE INDEX IF NOT EXISTS ix_sub_user ON submissions(user_id, problem_id, at DESC)")


def connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # FastAPI runs a sync dependency's setup, the endpoint and its teardown on different threadpool threads.
    # Each connection serves one request at a time, so sharing it across those threads is safe.
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Several connections can open a brand new database at once (a request and a finishing background job). Each runs the same
    # setup, and SQLite answers "locked" to the ones that arrive mid-way, so they retry until the first has finished.
    for attempt in range(50):
        try:
            _prepare(conn)
            break
        except sqlite3.OperationalError as e:
            if "locked" not in str(e) or attempt == 49:
                raise
            time.sleep(0.05)
    migrate_loaded_modules(conn)
    return conn


def get_db() -> Generator[sqlite3.Connection, None, None]:
    """FastAPI dependency: one connection per request; caller commits writes."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def open_db() -> closing[sqlite3.Connection]:
    """Context manager for short scripts and rate-limit helpers."""
    return closing(connect())
