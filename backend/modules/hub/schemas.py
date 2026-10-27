from __future__ import annotations

from pydantic import BaseModel, Field

DATE = r"^\d{4}-\d{2}-\d{2}$"


class TargetIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    level: str = Field(default="", max_length=40)
    company: str | None = Field(default=None, max_length=120)
    jdText: str | None = Field(default=None, max_length=20000)
    roleId: int | None = None
    scoreRunId: int | None = None
    date: str | None = Field(default=None, pattern=DATE)


class TargetPatch(BaseModel):
    """Only the fields the caller sent change; `null` clears the optional ones."""

    title: str | None = Field(default=None, min_length=1, max_length=120)
    level: str | None = Field(default=None, max_length=40)
    company: str | None = Field(default=None, max_length=120)
    jdText: str | None = Field(default=None, max_length=20000)
    roleId: int | None = None
    scoreRunId: int | None = None
    date: str | None = Field(default=None, pattern=DATE)


class ActiveIn(BaseModel):
    targetId: int
