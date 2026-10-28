"""Per-user AI provider choice and a connection test. Mounted at /api/llm. Keys never leave the server."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from dc_platform import llm, llm_providers, usage
from deps import CurrentUser

router = APIRouter(prefix="/api/llm", tags=["llm"])


class SettingsIn(BaseModel):
    provider: str = Field(max_length=20)
    model: str = Field(default="", max_length=100)


def _effective(user_id: int) -> dict[str, str]:
    chosen = llm_providers.get_settings(user_id)
    if chosen:
        return chosen
    try:
        a = llm.default_adapter()
        return {"provider": type(a).__name__.removesuffix("Adapter").lower(), "model": a.model}
    except llm.LLMError:
        return {"provider": "", "model": ""}


def _view(user_id: int) -> dict[str, Any]:
    return {
        "providers": llm_providers.providers(),
        "current": llm_providers.get_settings(user_id),
        "effective": _effective(user_id),
        "usage": usage.summary(user_id),
    }


@router.get("/settings")
def get_settings(user: CurrentUser) -> dict[str, Any]:
    return _view(user["id"])


@router.put("/settings")
def put_settings(body: SettingsIn, user: CurrentUser) -> dict[str, Any]:
    info = next((p for p in llm_providers.providers() if p["id"] == body.provider), None)
    if not info:
        raise HTTPException(400, "Unknown provider.")
    if not info["available"]:
        raise HTTPException(400, f"{info['label']} is not set up on this server.")
    llm_providers.save_settings(user["id"], body.provider, body.model)
    return _view(user["id"])


@router.delete("/settings")
def reset_settings(user: CurrentUser) -> dict[str, Any]:
    llm_providers.clear_settings(user["id"])
    return _view(user["id"])


@router.post("/test")
def test_connection(user: CurrentUser) -> dict[str, Any]:
    """One tiny call with the user's current choice, so the settings screen can say whether it works."""
    try:
        text = llm.client_for(user["id"]).complete(
            [{"role": "user", "content": "Reply with the single word: ok"}], user_id=user["id"], module="settings", temperature=0.0
        )
    except llm.LLMError as e:
        return {"ok": False, "error": str(e)[:200]}
    return {"ok": True, "reply": text.strip()[:40]}
