"""Prompts live in .md files next to the module and carry a version, which is stored with every feedback report.

A file may hold one prompt, or sections introduced by `## key` lines (the interviewer's per-move instructions).
Placeholders look like {{name}}; text that comes from the user is passed in as data and never edited here.
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

PROMPT_VERSION = "1.0"
DIR = Path(__file__).parent / "prompts"
_SLOT = re.compile(r"\{\{(\w+)\}\}")


@lru_cache(maxsize=None)
def _read(name: str) -> str:
    return (DIR / f"{name}.md").read_text(encoding="utf-8").strip()


@lru_cache(maxsize=None)
def _sections(name: str) -> dict[str, str]:
    parts = re.split(r"^## (\w[\w-]*)\s*$", _read(name), flags=re.MULTILINE)
    return {key: body.strip() for key, body in zip(parts[1::2], parts[2::2], strict=True)}


def fill(template: str, **slots: str) -> str:
    """Fill {{name}} slots in one pass, so a value that itself contains {{x}} is left as it is. An unknown slot is an error."""
    return _SLOT.sub(lambda m: slots[m.group(1)], template)


def render(name: str, **slots: str) -> str:
    return fill(_read(name), **slots)


def section(name: str, key: str, **slots: str) -> str:
    return fill(_sections(name)[key], **slots)
