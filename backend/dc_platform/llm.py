"""One LLM client for every module: JSON mode with validation, streaming, retries, a concurrency limit and usage.

Adapters speak to a provider (OpenAI, LM Studio) or are faked in tests. Modules only call LLMClient.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import threading
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any, Protocol, TypeVar

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError

from dc_platform import usage
from routes.ai import DEFAULT_OPENAI_MODEL, OPENAI_BASE, _is_reasoning_model, _loopback_base

Message = dict[str, str]
M = TypeVar("M", bound=BaseModel)

DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
DEFAULT_EMBEDDING_DIMS = 1536


class LLMError(Exception):
    """The call failed for good (bad request, bad key, invalid output after repair)."""


class LLMTransient(LLMError):
    """Worth retrying: timeout, connection error, 429 or 5xx."""


@dataclass
class Completion:
    text: str
    tokens_in: int = 0
    tokens_out: int = 0
    model: str = ""


@dataclass
class EmbeddingBatch:
    vectors: list[list[float]]
    tokens_in: int = 0
    model: str = ""


class Adapter(Protocol):
    model: str

    def chat(self, messages: list[Message], *, json_mode: bool, temperature: float | None) -> Completion: ...

    def stream(self, messages: list[Message], *, temperature: float | None) -> Iterator[str]: ...


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


class _HttpAdapter:
    """OpenAI-compatible chat/completions over httpx."""

    base: str
    model: str
    headers: dict[str, str]
    timeout: float = 120.0
    supports_json_mode = True

    def _payload(self, messages: list[Message], json_mode: bool, temperature: float | None, stream: bool) -> dict[str, Any]:
        p: dict[str, Any] = {"messages": messages}
        if self.model:
            p["model"] = self.model
        if not _is_reasoning_model(self.model):
            p["temperature"] = 0.2 if temperature is None else temperature
        if json_mode and self.supports_json_mode:
            p["response_format"] = {"type": "json_object"}
        if stream:
            p["stream"] = True
            p["stream_options"] = {"include_usage": True}
        return p

    @staticmethod
    def _raise(r: httpx.Response) -> None:
        if r.status_code == 429 or r.status_code >= 500:
            raise LLMTransient(f"provider returned {r.status_code}")
        if r.status_code >= 400:
            raise LLMError(f"provider returned {r.status_code}: {r.text[:300]}")

    def chat(self, messages: list[Message], *, json_mode: bool, temperature: float | None) -> Completion:
        try:
            r = httpx.post(f"{self.base}/chat/completions", json=self._payload(messages, json_mode, temperature, False), headers=self.headers, timeout=self.timeout, follow_redirects=False)
        except httpx.HTTPError as e:
            raise LLMTransient(f"could not reach the AI endpoint: {e.__class__.__name__}") from e
        self._raise(r)
        body = r.json()
        u = body.get("usage") or {}
        text = (body.get("choices") or [{}])[0].get("message", {}).get("content") or ""
        return Completion(text, int(u.get("prompt_tokens", 0)), int(u.get("completion_tokens", 0)), body.get("model") or self.model)

    def stream(self, messages: list[Message], *, temperature: float | None) -> Iterator[str]:
        try:
            with httpx.stream("POST", f"{self.base}/chat/completions", json=self._payload(messages, False, temperature, True), headers=self.headers, timeout=self.timeout, follow_redirects=False) as r:
                if r.status_code >= 400:
                    r.read()
                    self._raise(r)
                for line in r.iter_lines():
                    if not line.startswith("data:") or line.strip() == "data: [DONE]":
                        continue
                    try:
                        delta = json.loads(line[5:])["choices"][0]["delta"].get("content")
                    except (ValueError, KeyError, IndexError):
                        continue
                    if delta:
                        yield delta
        except httpx.HTTPError as e:
            raise LLMTransient(f"could not reach the AI endpoint: {e.__class__.__name__}") from e

    def embed(self, texts: list[str], *, model: str, dims: int | None) -> EmbeddingBatch:
        raise LLMError(
            "This AI provider does not support embeddings. Set OPENAI_API_KEY (and EMBEDDING_MODEL) to embed documents."
        )


def _embedding_model() -> str:
    return os.environ.get("EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL)


def _embedding_dims() -> int | None:
    raw = os.environ.get("EMBEDDING_DIMS")
    return int(raw) if raw else None


class OpenAIAdapter(_HttpAdapter):
    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        key = api_key or os.environ.get("OPENAI_API_KEY", "")
        if not key:
            raise LLMError("No OpenAI key. Set OPENAI_API_KEY in backend/.env.")
        self.base = OPENAI_BASE  # fixed: a custom URL could redirect the server key elsewhere
        self.model = model or os.environ.get("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)
        self.headers = {"Authorization": f"Bearer {key}"}

    def embed(self, texts: list[str], *, model: str, dims: int | None) -> EmbeddingBatch:
        body: dict[str, Any] = {"input": texts, "model": model, "encoding_format": "float"}
        if dims:
            body["dimensions"] = dims
        try:
            r = httpx.post(f"{self.base}/embeddings", json=body, headers=self.headers, timeout=self.timeout, follow_redirects=False)
        except httpx.HTTPError as e:
            raise LLMTransient(f"could not reach the AI endpoint: {e.__class__.__name__}") from e
        self._raise(r)
        payload = r.json()
        rows = sorted(payload.get("data") or [], key=lambda row: row.get("index", 0))
        vectors = [list(row["embedding"]) for row in rows]
        if len(vectors) != len(texts):
            raise LLMError("provider returned the wrong number of embeddings")
        u = payload.get("usage") or {}
        return EmbeddingBatch(vectors, int(u.get("prompt_tokens", 0) or u.get("total_tokens", 0)), payload.get("model") or model)


class LMStudioAdapter(_HttpAdapter):
    supports_json_mode = False  # LM Studio rejects response_format json_object for many models; the prompt asks for JSON

    def __init__(self, model: str | None = None, base_url: str | None = None) -> None:
        try:
            self.base = _loopback_base(base_url or os.environ.get("LMSTUDIO_URL", "http://localhost:1234/v1"))
        except HTTPException as e:  # localhost-only rule shared with routes/ai.py
            raise LLMError(str(e.detail)) from e
        self.model = model or os.environ.get("LMSTUDIO_MODEL") or ""
        self.headers = {}


class FakeAdapter:
    """Scripted adapter for tests: no network, no key. `replies` are returned in order (last one repeats)."""

    def __init__(
        self,
        replies: list[str | Exception] | Callable[[list[Message]], str] | None = None,
        model: str = "fake",
        *,
        embed_dims: int = 8,
    ) -> None:
        self.model = model
        self.replies = replies if replies is not None else ["ok"]
        self.calls: list[list[Message]] = []
        self.embed_dims = embed_dims
        self.embed_calls: list[list[str]] = []

    def _next(self, messages: list[Message]) -> str:
        self.calls.append(messages)
        if callable(self.replies):
            return self.replies(messages)
        r = self.replies[min(len(self.calls) - 1, len(self.replies) - 1)]
        if isinstance(r, Exception):
            raise r
        return r

    def chat(self, messages: list[Message], *, json_mode: bool, temperature: float | None) -> Completion:
        text = self._next(messages)
        return Completion(text, sum(estimate_tokens(m["content"]) for m in messages), estimate_tokens(text), self.model)

    def stream(self, messages: list[Message], *, temperature: float | None) -> Iterator[str]:
        text = self._next(messages)
        for i in range(0, len(text), 4):
            yield text[i : i + 4]

    def embed(self, texts: list[str], *, model: str, dims: int | None) -> EmbeddingBatch:
        self.embed_calls.append(list(texts))
        size = dims or self.embed_dims
        vectors = [_fake_vector(t, size) for t in texts]
        return EmbeddingBatch(vectors, sum(estimate_tokens(t) for t in texts), model or "fake-embed")


def _fake_vector(text: str, dims: int) -> list[float]:
    """Deterministic bag-of-tokens unit vector so overlapping words score higher in tests (no network)."""
    vals = [0.0] * dims
    for token in re.findall(r"[a-z0-9]+", text.lower()):
        h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
        vals[h % dims] += 1.0
    norm = math.sqrt(sum(v * v for v in vals)) or 1.0
    return [v / norm for v in vals]


def _loads(text: str) -> Any:
    t = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", t, re.S)
    if fence:
        t = fence.group(1)
    try:
        return json.loads(t)
    except ValueError:
        start, end = t.find("{"), t.rfind("}")
        if start >= 0 and end > start:
            return json.loads(t[start : end + 1])
        raise


class LLMClient:
    def __init__(
        self,
        adapter: Adapter,
        *,
        concurrency: int | None = None,
        retries: int = 2,
        backoff: float = 1.0,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.adapter = adapter
        self.retries = retries
        self.backoff = backoff
        self._sleep = sleep
        self._slots = threading.BoundedSemaphore(concurrency or int(os.environ.get("LLM_CONCURRENCY", "4")))

    def _call(self, fn: Callable[[], Completion]) -> Completion:
        for attempt in range(self.retries + 1):
            try:
                with self._slots:
                    return fn()
            except LLMTransient:
                if attempt == self.retries:
                    raise
                self._sleep(self.backoff * 2**attempt)
        raise AssertionError("unreachable")

    def complete(
        self,
        messages: list[Message],
        *,
        user_id: int,
        module: str,
        temperature: float | None = None,
    ) -> str:
        usage.check_quota(user_id)
        c = self._call(lambda: self.adapter.chat(messages, json_mode=False, temperature=temperature))
        usage.record(user_id, module, c.model or self.adapter.model, "complete", c.tokens_in, c.tokens_out)
        return c.text

    def complete_json(
        self,
        messages: list[Message],
        schema: type[M],
        *,
        user_id: int,
        module: str,
        temperature: float | None = None,
    ) -> M:
        """JSON mode: parse, validate against a pydantic model, and ask once for a repair if it does not fit."""
        usage.check_quota(user_id)
        convo = list(messages)
        last_err = ""
        for _ in range(2):
            c = self._call(lambda: self.adapter.chat(convo, json_mode=True, temperature=temperature))
            usage.record(user_id, module, c.model or self.adapter.model, "json", c.tokens_in, c.tokens_out)
            try:
                return schema.model_validate(_loads(c.text))
            except (ValueError, ValidationError) as e:
                last_err = str(e)[:300]
                convo = [
                    *messages,
                    {"role": "assistant", "content": c.text},
                    {"role": "user", "content": f"That was not valid for the required JSON shape ({last_err}). Reply with only the corrected JSON."},
                ]
        raise LLMError(f"model did not return valid JSON: {last_err}")

    def stream(self, messages: list[Message], *, user_id: int, module: str, temperature: float | None = None) -> Iterator[str]:
        usage.check_quota(user_id)
        out: list[str] = []
        with self._slots:
            try:
                for piece in self.adapter.stream(messages, temperature=temperature):
                    out.append(piece)
                    yield piece
            finally:
                # providers rarely report usage mid-stream, so estimate; recorded even if the consumer stops early
                usage.record(
                    user_id, module, self.adapter.model, "stream",
                    sum(estimate_tokens(m["content"]) for m in messages), estimate_tokens("".join(out)),
                )

    @property
    def embedding_model(self) -> str:
        return _embedding_model()

    def embed(self, texts: list[str], *, user_id: int, module: str) -> list[list[float]]:
        if not texts:
            return []
        usage.check_quota(user_id, rate_limited=False)
        model = _embedding_model()
        dims = _embedding_dims()
        embed_fn = getattr(self.adapter, "embed", None)
        if embed_fn is None:
            raise LLMError(
                "This AI provider does not support embeddings. Set OPENAI_API_KEY (and EMBEDDING_MODEL) to embed documents."
            )

        def once() -> EmbeddingBatch:
            return embed_fn(texts, model=model, dims=dims)

        for attempt in range(self.retries + 1):
            try:
                with self._slots:
                    batch = once()
                usage.record(user_id, module, batch.model or model, "embed", batch.tokens_in, 0)
                return batch.vectors
            except LLMTransient:
                if attempt == self.retries:
                    raise
                self._sleep(self.backoff * 2**attempt)
        raise AssertionError("unreachable")


_factory: Callable[[], Adapter] | None = None
_client: LLMClient | None = None


def set_adapter_factory(factory: Callable[[], Adapter] | None) -> None:
    """Tests (and later per-user settings) swap the provider here."""
    global _factory, _client
    _factory, _client = factory, None


def default_adapter() -> Adapter:
    provider = os.environ.get("LLM_PROVIDER") or ("openai" if os.environ.get("OPENAI_API_KEY") else "lmstudio")
    if provider == "openai":
        return OpenAIAdapter()
    if provider == "lmstudio":
        return LMStudioAdapter()
    raise LLMError(f"unknown LLM_PROVIDER {provider!r}")


def get_client() -> LLMClient:
    global _client
    if _client is None:
        _client = LLMClient((_factory or default_adapter)())
    return _client


def client_for(user_id: int) -> LLMClient:
    """The client for this user: the provider and model they chose, else the server default.

    A test that installed a fake adapter factory always gets the fake, whatever the user picked.
    """
    if _factory is None:
        from dc_platform import llm_providers

        chosen = llm_providers.chosen_client(user_id)
        if chosen:
            return chosen
    return get_client()
