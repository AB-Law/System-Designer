"""What a good answer looks like for each kind of question. The feedback writer judges against these, and says which it used."""
from __future__ import annotations

from .schemas import Category

RUBRICS: dict[Category, tuple[str, ...]] = {
    "behavioral": (
        "Situation: a specific, real occasion, not a general habit",
        "Task: what the candidate personally had to achieve",
        "Action: what the candidate did themselves, and why (not what 'we' did)",
        "Result: the outcome with a figure or a concrete change, and what they learned",
    ),
    "technical": (
        "Correctness: the facts and reasoning are right",
        "Depth: goes beyond a definition into how and why it works",
        "Trade-offs: names costs, limits and alternatives",
        "Application: ties the idea to real work or a concrete example",
    ),
    "system_design": (
        "Requirements: clarifies scope, scale and constraints before designing",
        "Structure: a clear set of components and how data flows between them",
        "Trade-offs: explains why each choice over the alternatives",
        "Failure and scale: bottlenecks, failure modes and how the design copes",
    ),
    "company": (
        "Knowledge: shows real understanding of the company's product and problems",
        "Fit: links their own experience to what the company needs",
        "Motivation: a specific, credible reason for wanting this role",
    ),
}


def rubric_text(category: Category) -> str:
    return "\n".join(f"- {line}" for line in RUBRICS[category])
