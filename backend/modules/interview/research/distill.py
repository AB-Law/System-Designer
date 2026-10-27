"""Turn what the tools gathered (untrusted web text) into short question rows.

The model only picks out questions the text gives; every row must name a source that was actually gathered,
the source name comes from the address and not from the model, and no answers are written or kept.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

from dc_platform import llm
from dc_platform.search import host_name

from .. import prompts
from ..schemas import Category
from .buckets import FAMILY_LABEL, Bucket
from .store import Candidate

MAX_EVIDENCE = 30_000
MAX_ITEMS = 30
Kind = Literal["question", "culture", "engineering"]


@dataclass(frozen=True)
class Source:
    url: str
    title: str
    text: str


class Found(BaseModel):
    question: str = Field(min_length=8, max_length=300)
    category: Category
    kind: Kind = "question"
    source_url: str = Field(max_length=2000)


class Distilled(BaseModel):
    items: list[Found] = Field(default_factory=list)


def _attr(text: str) -> str:
    return text.replace('"', "'").replace("<", "").replace(">", "")[:200]


def evidence_block(sources: list[Source]) -> str:
    """The sources as a marked data block, trimmed to a fixed size. A source cannot close its own tag."""
    parts: list[str] = []
    room = MAX_EVIDENCE
    for s in sources:
        body = s.text[: max(0, room)].replace("</source", "<\\/source")
        if not body:
            break
        parts.append(f'<source url="{_attr(s.url)}" title="{_attr(s.title)}">\n{body}\n</source>')
        room -= len(body)
    return "\n".join(parts)


def _ground(items: list[Found], sources: list[Source], bucket: Bucket, limit: int) -> list[Candidate]:
    known = {s.url for s in sources}
    seen: set[str] = set()
    out: list[Candidate] = []
    for item in items:
        question = " ".join(item.question.split())
        usable = item.source_url in known and (item.category != "company" or bucket.company) and question.lower() not in seen
        if not usable:
            continue
        seen.add(question.lower())
        out.append(Candidate(question, item.category, item.kind, item.source_url, host_name(item.source_url)))
    return out[:limit]


def distill(user_id: int, bucket: Bucket, sources: list[Source], *, limit: int = MAX_ITEMS) -> list[Candidate]:
    if not sources:
        return []
    system = prompts.render(
        "research_distill",
        role=f"{bucket.level} {FAMILY_LABEL[bucket.family]}", company=f" at {bucket.company}" if bucket.company else "", limit=str(limit),
    )
    got = llm.client_for(user_id).complete_json(
        [{"role": "system", "content": system}, {"role": "user", "content": evidence_block(sources)}],
        Distilled, user_id=user_id, module="interview", temperature=0.1,
    )
    return _ground(got.items, sources, bucket, limit)
