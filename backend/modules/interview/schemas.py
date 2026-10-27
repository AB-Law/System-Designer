"""Shapes shared by the planner, the interviewer, the feedback writer and the API."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Category = Literal["behavioral", "technical", "system_design", "company"]
CATEGORIES: tuple[Category, ...] = ("behavioral", "technical", "system_design", "company")
CATEGORY_LABELS: dict[str, str] = {
    "behavioral": "Behavioral",
    "technical": "Technical",
    "system_design": "System design",
    "company": "Company",
}
Tone = Literal["friendly", "tough"]

MAX_QUESTIONS = 12


class Style(BaseModel):
    """How the interviewer behaves. `categories` and `counts` left empty mean: choose from the role's level and the duration."""

    tone: Tone = "friendly"
    durationMin: int = Field(default=30, ge=10, le=90)
    categories: list[Category] = Field(default_factory=list, max_length=4)
    counts: dict[Category, int] = Field(default_factory=dict)
    showPlan: bool = False

    @model_validator(mode="after")
    def _check_counts(self) -> Style:
        if any(not 0 <= n <= 6 for n in self.counts.values()) or sum(self.counts.values()) > MAX_QUESTIONS:
            raise ValueError(f"Ask for at most {MAX_QUESTIONS} questions, and at most 6 of one kind.")
        return self


class PlanItem(BaseModel):
    category: Category
    question: str = Field(min_length=5, max_length=500)
    focus: str = Field(default="", max_length=80)
    jd_link: str = Field(default="", max_length=200)  # the requirement in the job description this question probes


class Plan(BaseModel):
    items: list[PlanItem] = Field(default_factory=list)
