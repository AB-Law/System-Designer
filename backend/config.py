"""Shared paths and environment loading for the Design Canvas API."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
PROBLEMS_DIR = Path(os.environ.get("PROBLEMS_DIR", ROOT / "app" / "src" / "problems"))
DIST_DIR = ROOT / "app" / "dist"


def load_env() -> None:
    load_dotenv(BACKEND_DIR / ".env", override=False)


def db_path() -> Path:
    return Path(os.environ.get("DB_PATH", BACKEND_DIR / "data.sqlite3"))
