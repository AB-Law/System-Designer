"""More providers (Anthropic, Ollama) and the per-user choice of provider and model.

Keys stay in the server environment: a user picks among providers the server has keys for, never types a key.
"""
from __future__ import annotations

import json
import os
import threading
import time
from collections.abc import Iterator
from typing import Any

import httpx
from fastapi import HTTPException

from dc_platform.llm import (
    DEFAULT_OPENAI_MODEL,
    Adapter,
    Completion,
    LLMClient,
    LLMError,
    LLMTransient,
    LMStudioAdapter,
    Message,
    OpenAIAdapter,
    _HttpAdapter,
    _loopback_base,
)

ANTHROPIC_BASE = "https://api.anthropic.com/v1"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5"


class AnthropicAdapter(_HttpAdapter):
    """Anthropic Messages API. System messages go in `system`; JSON mode is a prompt instruction."""

    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            raise LLMError("No Anthropic key. Set ANTHROPIC_API_KEY in backend/.env.")
        self.base = ANTHROPIC_BASE  # fixed, like OpenAI: a custom URL could redirect the server key elsewhere
        self.model = model or os.environ.get("ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL)
        self.headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}

    def _payload(self, messages: list[Message], json_mode: bool, temperature: float | None, stream: bool) -> dict[str, Any]:
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        if json_mode:
            system += "\n\nReply with a single JSON object and nothing else."
        p: dict[str, Any] = {
            "model": self.model,
            "max_tokens": 4096,
            "temperature": 0.2 if temperature is None else min(temperature, 1.0),
            "messages": [m for m in messages if m["role"] != "system"],
        }
        if system.strip():
            p["system"] = system.strip()
        if stream:
            p["stream"] = True
        return p

    def chat(self, messages: list[Message], *, json_mode: bool, temperature: float | None) -> Completion:
        try:
            r = httpx.post(
                f"{self.base}/messages", json=self._payload(messages, json_mode, temperature, False),
                headers=self.headers, timeout=self.timeout, follow_redirects=False,
            )
        except httpx.HTTPError as e:
            raise LLMTransient(f"could not reach the AI endpoint: {e.__class__.__name__}") from e
        self._raise(r)
        body = r.json()
        u = body.get("usage") or {}
        text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text")
        return Completion(text, int(u.get("input_tokens", 0)), int(u.get("output_tokens", 0)), body.get("model") or self.model)

    def stream(self, messages: list[Message], *, temperature: float | None) -> Iterator[str]:
        try:
            with httpx.stream(
                "POST", f"{self.base}/messages", json=self._payload(messages, False, temperature, True),
                headers=self.headers, timeout=self.timeout, follow_redirects=False,
            ) as r:
                if r.status_code >= 400:
                    r.read()
                    self._raise(r)
                for line in r.iter_lines():
                    if not line.startswith("data:"):
                        continue
                    try:
                        ev = json.loads(line[5:])
                    except ValueError:
                        continue
                    if ev.get("type") == "content_block_delta" and ev.get("delta", {}).get("text"):
                        yield ev["delta"]["text"]
        except httpx.HTTPError as e:
            raise LLMTransient(f"could not reach the AI endpoint: {e.__class__.__name__}") from e


class OllamaAdapter(_HttpAdapter):
    """Ollama's OpenAI-compatible endpoint. Loopback only, like LM Studio."""

    def __init__(self, model: str | None = None, base_url: str | None = None) -> None:
        try:
            self.base = _loopback_base(base_url or os.environ.get("OLLAMA_URL", "http://localhost:11434/v1"))
        except HTTPException as e:
            raise LLMError(str(e.detail)) from e
        self.model = model or os.environ.get("OLLAMA_MODEL") or ""
        self.headers = {}


PROVIDERS: dict[str, dict[str, Any]] = {
    "openai": {"label": "OpenAI", "key_env": "OPENAI_API_KEY", "model": lambda: os.environ.get("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)},
    "anthropic": {"label": "Anthropic", "key_env": "ANTHROPIC_API_KEY", "model": lambda: os.environ.get("ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL)},
    "lmstudio": {"label": "LM Studio (local)", "key_env": None, "model": lambda: os.environ.get("LMSTUDIO_MODEL", "")},
    "ollama": {"label": "Ollama (local)", "key_env": None, "model": lambda: os.environ.get("OLLAMA_MODEL", "")},
}


def providers() -> list[dict[str, Any]]:
    """What the settings screen offers. A hosted provider is available only when the server has its key."""
    return [
        {"id": pid, "label": p["label"], "available": p["key_env"] is None or bool(os.environ.get(p["key_env"], "")), "defaultModel": p["model"]()}
        for pid, p in PROVIDERS.items()
    ]


def build_adapter(provider: str, model: str | None = None) -> Adapter:
    model = model or None
    if provider == "openai":
        return OpenAIAdapter(model)
    if provider == "anthropic":
        return AnthropicAdapter(model)
    if provider == "lmstudio":
        return LMStudioAdapter(model)
    if provider == "ollama":
        return OllamaAdapter(model)
    raise LLMError(f"unknown provider {provider!r}")


def get_settings(user_id: int) -> dict[str, str] | None:
    from db import open_db

    with open_db() as db:
        row = db.execute("SELECT provider, model FROM llm_settings WHERE user_id=?", (user_id,)).fetchone()
    return {"provider": row["provider"], "model": row["model"]} if row else None


def save_settings(user_id: int, provider: str, model: str) -> None:
    from db import open_db

    if provider not in PROVIDERS:
        raise LLMError(f"unknown provider {provider!r}")
    with open_db() as db, db:
        db.execute(
            "INSERT INTO llm_settings(user_id, provider, model, updated) VALUES (?,?,?,?) "
            "ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider, model=excluded.model, updated=excluded.updated",
            (user_id, provider, model.strip()[:100], int(time.time() * 1000)),
        )


def clear_settings(user_id: int) -> None:
    from db import open_db

    with open_db() as db, db:
        db.execute("DELETE FROM llm_settings WHERE user_id=?", (user_id,))


_clients: dict[tuple[str, str], LLMClient] = {}
_lock = threading.Lock()


def chosen_client(user_id: int) -> LLMClient | None:
    """The client for the provider and model this user picked, or None when they never chose."""
    chosen = get_settings(user_id)
    if not chosen:
        return None
    key = (chosen["provider"], chosen["model"])
    with _lock:
        if key not in _clients:
            _clients[key] = LLMClient(build_adapter(*key))
        return _clients[key]
