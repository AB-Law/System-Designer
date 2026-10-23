from __future__ import annotations

from fastapi import APIRouter

from catalog import load_problems

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health() -> dict:
    problems, errors = load_problems()
    return {"ok": True, "problems": len(problems), "invalid": errors}
