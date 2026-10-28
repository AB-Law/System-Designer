"""Packaged Design glossary and lesson markdown used as Study deck sources."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import HTTPException

_DIR = Path(__file__).resolve().parent / "content"
_LESSONS = _DIR / "lessons"

FRONT_MATTER = re.compile(r"^---\s*\n.*?\n---\s*\n", re.S)
HEADING = re.compile(r"^##\s+(.+?)(?:\s*\{#[^}]+\})?\s*$", re.M)
QUIZ_BLOCK = re.compile(r"::: quiz.*?:::", re.S)
DEMO_BLOCK = re.compile(r"::: demo.*?:::", re.S)
WIKI = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")


@lru_cache(maxsize=1)
def glossary() -> list[dict[str, str]]:
    path = _DIR / "glossary.json"
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return [{"term": str(e["term"]), "plain": str(e["plain"])} for e in data if e.get("term") and e.get("plain")]


def list_lessons() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not _LESSONS.is_dir():
        return out
    for path in sorted(_LESSONS.glob("module-*.md")):
        raw = path.read_text(encoding="utf-8")
        title = _title(raw) or path.stem.replace("-", " ").title()
        out.append({"id": path.stem, "title": title})
    return out


def lesson_text(lesson_id: str) -> str:
    if not re.fullmatch(r"module-\d+", lesson_id):
        raise HTTPException(422, "Unknown lesson id.")
    path = _LESSONS / f"{lesson_id}.md"
    if not path.is_file():
        raise HTTPException(404, "Lesson not found.")
    return path.read_text(encoding="utf-8")


def glossary_cards() -> list[dict[str, str]]:
    """Definition cards with no model call: cloze + basic for each term."""
    cards: list[dict[str, str]] = []
    for e in glossary():
        term, plain = e["term"], e["plain"]
        cards.append({"kind": "cloze", "front": f"A {{{{c1::{term}}}}} — {plain}", "back": term})
        cards.append({"kind": "basic", "front": f"What is {term}?", "back": plain})
    return cards


def lesson_cards(lesson_id: str) -> list[dict[str, str]]:
    """Heading → first paragraph cards from a lesson; glossary terms found in the text become clozes."""
    raw = lesson_text(lesson_id)
    body = FRONT_MATTER.sub("", raw)
    body = QUIZ_BLOCK.sub("", body)
    body = DEMO_BLOCK.sub("", body)
    cards: list[dict[str, str]] = []
    terms = {e["term"].lower(): e for e in glossary()}

    sections = _sections(body)
    for title, text in sections:
        para = _first_paragraph(text)
        if len(para) < 40:
            continue
        cards.append({"kind": "basic", "front": f"In this lesson: {title} — what is the idea?", "back": para[:800]})
        for match in WIKI.findall(text):
            key = match.strip().lower()
            entry = terms.get(key)
            if not entry:
                continue
            term = entry["term"]
            cards.append({
                "kind": "cloze",
                "front": f"{{{{c1::{term}}}}} — {entry['plain']}",
                "back": term,
            })
    return cards


def _title(raw: str) -> str:
    m = re.search(r"^title:\s*(.+)$", raw, re.M)
    return m.group(1).strip() if m else ""


def _sections(body: str) -> list[tuple[str, str]]:
    parts = HEADING.split(body)
    # split keeps delimiters: [pre, h1, body1, h2, body2, ...]
    if len(parts) < 3:
        return []
    out: list[tuple[str, str]] = []
    for i in range(1, len(parts), 2):
        title = parts[i].strip()
        text = parts[i + 1] if i + 1 < len(parts) else ""
        out.append((title, text))
    return out


def _first_paragraph(text: str) -> str:
    for block in text.strip().split("\n\n"):
        line = WIKI.sub(lambda m: m.group(1).split("|")[0], block)
        line = re.sub(r"[#>*`]+", "", line)
        line = re.sub(r"\s+", " ", line).strip()
        if len(line) >= 40:
            return line
    return ""
