"""Hub API, mounted at /api/hub. Every route is scoped to the signed-in user."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from deps import CurrentUser

from . import portability, summary, targets
from .schemas import ActiveIn, TargetIn, TargetPatch

router = APIRouter(tags=["hub"])


@router.get("/summary")
async def get_summary(user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(summary.build, user["id"])


@router.get("/targets")
async def list_targets(user: CurrentUser) -> list[dict[str, Any]]:
    return await run_in_threadpool(targets.list_targets, user["id"])


@router.post("/targets")
async def create_target(body: TargetIn, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(targets.create, user["id"], body.model_dump())


@router.put("/targets/active")
async def set_active(body: ActiveIn, user: CurrentUser) -> dict[str, bool]:
    await run_in_threadpool(targets.activate, user["id"], body.targetId)
    return {"ok": True}


@router.get("/targets/{target_id:int}")
async def get_target(target_id: int, user: CurrentUser) -> dict[str, Any]:
    row = await run_in_threadpool(targets.get_row, user["id"], target_id)
    return targets.public(row, full=True)


@router.patch("/targets/{target_id:int}")
async def patch_target(target_id: int, body: TargetPatch, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(targets.update, user["id"], target_id, body.model_dump(exclude_unset=True))


@router.delete("/targets/{target_id:int}")
async def delete_target(target_id: int, user: CurrentUser) -> dict[str, bool]:
    await run_in_threadpool(targets.delete, user["id"], target_id)
    return {"ok": True}


@router.get("/export")
async def export_data(user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(portability.export_all, user["id"])


@router.delete("/data")
async def delete_data(user: CurrentUser) -> dict[str, bool]:
    await run_in_threadpool(portability.delete_all, user["id"])
    return {"ok": True}
