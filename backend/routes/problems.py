from __future__ import annotations

from fastapi import APIRouter

from catalog import load_problems

router = APIRouter(tags=["problems"])


@router.get("/api/problems")
def list_problems() -> list[dict]:
    good, errors = load_problems()
    if errors:
        print("Invalid problem files:", errors)
    return good
