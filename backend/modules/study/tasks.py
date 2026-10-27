"""Background jobs for the Study module."""
from __future__ import annotations

from typing import Any

from dc_platform import jobs

from . import generate, map_generate


def generate_job(ctx: jobs.JobContext) -> dict[str, Any]:
    return generate.run_job(ctx)


def map_job(ctx: jobs.JobContext) -> dict[str, Any]:
    return map_generate.run_job(ctx)


def register() -> None:
    jobs.register_handler("study.generate", generate_job)
    jobs.register_handler("study.map", map_job)
