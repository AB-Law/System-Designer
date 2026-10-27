"""Load Study prompt files next to this package."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_DIR = Path(__file__).resolve().parent / "prompts"


@lru_cache(maxsize=16)
def load(name: str) -> str:
    path = _DIR / name
    return path.read_text(encoding="utf-8").strip()
