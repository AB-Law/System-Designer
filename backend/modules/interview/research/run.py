"""The research job: check what the store already has, search only for what is missing, then refresh the role's bank.

Order of work: gap check (no spend) -> tool loop (search, read) -> distill -> store -> bank. Nothing is stored
until the loop is over, and when search is not possible the bank is still refreshed from what the store holds.
"""
from __future__ import annotations

from typing import Any

from dc_platform import jobs, llm, search
from dc_platform.tool_loop import run_loop

from .. import prompts, roles
from . import banks, config, distill, store
from .buckets import FAMILY_LABEL, Bucket, Gap
from .ledger import DbLedger
from .tools import ResearchTools

NO_SEARCH, NO_RESULTS = "no_search", "no_results"


def _goal(bucket: Bucket, need: Gap) -> str:
    lines = [f"Role: {bucket.level} {FAMILY_LABEL[bucket.family]}"]
    if bucket.company:
        lines.append(f"Company: {bucket.company}")
    lines.append(f"Topics to search, once each: {', '.join(need.topics())}")
    return "\n".join(lines)


def _search_and_store(ctx: jobs.JobContext, bucket: Bucket, need: Gap) -> dict[str, Any]:
    uid = ctx.user_id
    chain = search.get_chain(DbLedger())
    if not chain.available():
        return {"skipped": NO_SEARCH, "added": 0, "steps": []}
    tools = ResearchTools(chain, bucket, need)
    loop = run_loop(
        llm.client_for(uid), user_id=uid, module="interview", brief=prompts.render("research_agent"), goal=_goal(bucket, need),
        tools=tools.tools(), limits=config.limits(), check=ctx.check,
    )
    steps = [s.public() for s in loop.steps]
    if any(s.tool == "search" and s.ok for s in loop.steps):
        store.mark_searched(uid, bucket, need)  # a search that failed outright can be tried again; one that ran is not repeated at once
    sources = tools.evidence()
    if not sources:
        return {"skipped": NO_RESULTS, "added": 0, "steps": steps, "stopped": loop.reason}
    ctx.progress(0.7, "Picking out the questions")
    added = store.add(uid, bucket, distill.distill(uid, bucket, sources))
    return {"skipped": None, "added": added, "steps": steps, "stopped": loop.reason}


def run(ctx: jobs.JobContext) -> dict[str, Any]:
    uid, role_id = ctx.user_id, int(ctx.payload["role_id"])
    bucket = Bucket.of(roles.get_row(uid, role_id))
    need = store.gap(uid, bucket)
    outcome: dict[str, Any] = {"skipped": None, "added": 0, "steps": []}
    if need:
        ctx.progress(0.1, "Searching for interview questions")
        outcome = _search_and_store(ctx, bucket, need)
    ctx.progress(0.9, "Building your question bank")
    bank = banks.refresh(uid, role_id, bucket)
    return {"bankId": bank["id"], "items": len(bank["items"]), **outcome}


def job(ctx: jobs.JobContext) -> dict[str, Any]:
    """Job handler: run, and leave the bank marked failed (not stuck on 'running') if anything goes wrong."""
    try:
        return run(ctx)
    except jobs.JobCancelled:
        banks.mark_failed(ctx.user_id, int(ctx.payload["role_id"]), "Cancelled.")
        raise
    except Exception as e:
        banks.mark_failed(ctx.user_id, int(ctx.payload["role_id"]), str(getattr(e, "detail", None) or e))
        raise
