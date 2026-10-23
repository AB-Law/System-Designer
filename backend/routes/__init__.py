"""Aggregate API routers."""
from __future__ import annotations

from fastapi import APIRouter

from routes import ai, auth, cohorts, designs, health, problems, shares, submissions, versions

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(problems.router)
api_router.include_router(auth.router)
api_router.include_router(submissions.router)
api_router.include_router(designs.router)
api_router.include_router(versions.router)
api_router.include_router(shares.router)
api_router.include_router(cohorts.router)
api_router.include_router(ai.router)
