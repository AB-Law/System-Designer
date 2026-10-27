"""Request bodies for the Study API. Responses are plain dicts from views."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .scheduler import Rating

CardKind = Literal["basic", "cloze"]
SourceKind = Literal[
    "manual", "topic", "lesson", "glossary", "jd", "score_run",
    "interview_weakness", "document", "mindmap_node",
]


class DeckCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parentId: int | None = None


class DeckPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    parentId: int | None = None


class CardCreate(BaseModel):
    kind: CardKind = "basic"
    front: str = Field(min_length=1, max_length=2000)
    back: str = Field(min_length=1, max_length=4000)


class CardPatch(BaseModel):
    kind: CardKind | None = None
    front: str | None = Field(default=None, min_length=1, max_length=2000)
    back: str | None = Field(default=None, min_length=1, max_length=4000)


class ReviewIn(BaseModel):
    rating: Rating


class GenerateIn(BaseModel):
    name: str = Field(default="", max_length=120)
    sourceKind: Literal[
        "topic", "glossary", "lesson", "jd", "score_run", "interview_weakness", "document"
    ] = "topic"
    # topic / lesson id / run id, or full JD text when sourceKind is jd (SQLite TEXT).
    sourceRef: str = Field(default="", max_length=60_000)
    parentId: int | None = None


class MapCreate(BaseModel):
    sourceKind: Literal["lesson", "jd", "document"]
    sourceRef: str = Field(default="", max_length=60_000)


class NodePatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    summary: str | None = Field(default=None, max_length=2000)
    delete: bool = False
    addChildLabel: str | None = Field(default=None, min_length=1, max_length=120)


class NodeChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
