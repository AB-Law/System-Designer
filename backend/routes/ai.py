from __future__ import annotations

import os
import re
from typing import Any, Literal
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from deps import CurrentUser
from rate_limit import meter

router = APIRouter(tags=["ai"])

OPENAI_BASE = "https://api.openai.com/v1"
DEFAULT_OPENAI_MODEL = "gpt-6-luna"
# Reasoning models reject non-default temperature unless reasoning_effort is "none".
_REASONING_MODEL = re.compile(r"^(o[1-9]|gpt-5|gpt-6)([-.]|$)", re.I)
MAX_AI_MESSAGES = 40
MAX_AI_MESSAGE_CHARS = 20_000
MAX_AI_PAYLOAD_CHARS = 200_000


class ReviewRequest(BaseModel):
    provider: Literal["lmstudio", "openai"]
    baseUrl: str | None = None
    apiKey: str | None = None
    model: str | None = None
    messages: list[dict[str, Any]] = Field(max_length=MAX_AI_MESSAGES)
    # Optional: omitted for reasoning models that only accept the default.
    temperature: float | None = None
    # LM Studio only: how long a reasoning model may think before answering ("none" turns thinking off)
    reasoningEffort: Literal["none", "low", "medium", "high"] | None = None


def _is_reasoning_model(model: str | None) -> bool:
    return bool(model and _REASONING_MODEL.match(model.strip()))


def _loopback_base(url: str) -> str:
    """Only http(s) to loopback is allowed for LM Studio, so the proxy cannot be used for SSRF."""
    raw = url.strip().rstrip("/")
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(400, "LM Studio base URL must be a plain http(s) URL with no credentials.")
    host = (parsed.hostname or "").lower()
    if host not in {"localhost", "127.0.0.1", "::1"}:
        raise HTTPException(400, "LM Studio base URL must point at localhost.")
    if parsed.path not in {"", "/v1"}:
        raise HTTPException(400, "LM Studio base URL path must be /v1.")
    netloc = f"[::1]:{parsed.port}" if host == "::1" and parsed.port else "[::1]" if host == "::1" else f"{host}:{parsed.port}" if parsed.port else host
    return f"{parsed.scheme}://{netloc}/v1"


def _check_messages(messages: list[dict[str, Any]]) -> None:
    if not messages:
        raise HTTPException(400, "No messages to send.")
    total = 0
    for m in messages:
        if not isinstance(m, dict):
            raise HTTPException(400, "Each message must be an object.")
        content = m.get("content")
        if not isinstance(content, str):
            raise HTTPException(400, "Each message needs text content.")
        if len(content) > MAX_AI_MESSAGE_CHARS:
            raise HTTPException(413, "A message is too large.")
        total += len(content)
    if total > MAX_AI_PAYLOAD_CHARS:
        raise HTTPException(413, "The chat is too large to send.")


@router.post("/api/ai/review")
async def ai_review(req: ReviewRequest, user: CurrentUser) -> Any:
    # the proxy can reach local services and spend the server's API key, so only signed-in users may use it
    meter(f"ai|{user['id']}", limit=30, window=600.0)
    _check_messages(req.messages)

    if req.provider == "openai":
        # client baseUrl is ignored: always official OpenAI, so a custom URL cannot steal the server key
        base = OPENAI_BASE
        # Prefer server env key. A client-supplied key is accepted only as a fallback for older
        # clients; the browser no longer posts BYOK keys here (see callModel in review.ts).
        key = os.environ.get("OPENAI_API_KEY") or (req.apiKey or "").strip()
        if not key:
            raise HTTPException(400, "No OpenAI key. Paste one in AI settings (stays in the browser) or set OPENAI_API_KEY in backend/.env")
        model = req.model or os.environ.get("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)
        headers = {"Authorization": f"Bearer {key}"}
    else:
        configured = os.environ.get("LMSTUDIO_URL", "http://localhost:1234/v1")
        base = _loopback_base(req.baseUrl or configured)
        model = req.model or os.environ.get("LMSTUDIO_MODEL") or None
        headers = {}

    payload: dict[str, Any] = {"messages": req.messages}
    if model:
        payload["model"] = model
    if req.provider == "lmstudio" and req.reasoningEffort:
        payload["reasoning_effort"] = req.reasoningEffort
    allow_sampling = not _is_reasoning_model(model) or req.reasoningEffort == "none"
    if allow_sampling:
        payload["temperature"] = 0.2 if req.temperature is None else req.temperature
    try:
        async with httpx.AsyncClient(timeout=900, follow_redirects=False) as client:
            r = await client.post(f"{base}/chat/completions", json=payload, headers=headers)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Could not reach the AI endpoint: {e.__class__.__name__}") from e
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text[:500])
    return r.json()
