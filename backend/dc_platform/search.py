"""Web search providers behind one small interface, with a failover chain that respects a usage ledger.

A provider turns a query into hits and a list of URLs (that earlier hits returned) into page text; it reports
what each call cost in its own unit (Tavily credits, Exa millionths of a dollar). The chain tries providers in
order, skips the ones with no key or no allowance left, and records the cost. The ledger is a Protocol so the
platform does not know where usage is stored.
"""
from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol, TypeVar
from urllib.parse import urlparse

import httpx

log = logging.getLogger("dc.search")

HTTP_TIMEOUT = 30.0
MAX_SNIPPET = 1_200
MAX_PAGE = 6_000


class SearchError(RuntimeError):
    """One provider call failed; the chain tries the next provider."""


class SearchUnavailable(SearchError):
    """No provider is configured, or every one is out of allowance."""


@dataclass(frozen=True)
class Hit:
    url: str
    title: str
    snippet: str


@dataclass(frozen=True)
class Page:
    url: str
    text: str


@dataclass(frozen=True)
class Charged:
    cost: int


@dataclass(frozen=True)
class Searched(Charged):
    hits: list[Hit] = field(default_factory=list)


@dataclass(frozen=True)
class Extracted(Charged):
    pages: list[Page] = field(default_factory=list)


class SearchProvider(Protocol):
    name: str

    @property
    def configured(self) -> bool: ...

    @property
    def monthly_cap(self) -> int:
        """The most this provider may be asked to spend in a month, in its own cost unit (below the free allowance)."""

    def search_estimate(self) -> int: ...

    def extract_estimate(self, urls: int) -> int: ...

    def search(self, query: str, *, limit: int) -> Searched: ...

    def extract(self, urls: Sequence[str], *, query: str) -> Extracted: ...


class Ledger(Protocol):
    def spent(self, provider: str) -> int: ...

    def add(self, provider: str, units: int) -> None: ...


def http_url(raw: Any) -> str | None:
    """The URL if it is plain http(s) with a host; anything else (javascript:, file:, empty) is dropped."""
    url = str(raw or "").strip()
    parsed = urlparse(url)
    return url if parsed.scheme in ("http", "https") and parsed.hostname else None


def host_name(url: str) -> str:
    host = urlparse(url).hostname or ""
    return host.removeprefix("www.")


def post_json(url: str, *, headers: dict[str, str], body: dict[str, Any], who: str) -> dict[str, Any]:
    """POST JSON and return the JSON reply. Every failure becomes a SearchError that never carries the key or the response body."""
    try:
        r = httpx.post(url, headers=headers, json=body, timeout=HTTP_TIMEOUT, follow_redirects=False)
    except httpx.HTTPError as e:
        raise SearchError(f"{who} could not be reached ({e.__class__.__name__}).") from e
    if r.status_code >= 400:
        raise SearchError(f"{who} returned {r.status_code}.")
    try:
        data = r.json()
    except ValueError as e:
        raise SearchError(f"{who} sent a reply that is not JSON.") from e
    if not isinstance(data, dict):
        raise SearchError(f"{who} sent an unexpected reply.")
    return data


def clip(text: Any, limit: int) -> str:
    return " ".join(str(text or "").split())[:limit]


R = TypeVar("R", bound=Charged)


class SearchChain:
    """Providers in order of preference. The one place that decides failover and enforces the allowance."""

    def __init__(self, providers: Sequence[SearchProvider], ledger: Ledger) -> None:
        self.providers = list(providers)
        self.ledger = ledger

    def configured(self) -> bool:
        return any(p.configured for p in self.providers)

    def available(self) -> bool:
        return any(self._has_room(p, p.search_estimate()) for p in self.providers)

    def search(self, query: str, *, limit: int = 5) -> Searched:
        return self._first(lambda p: p.search_estimate(), lambda p: p.search(query, limit=limit))

    def extract(self, urls: Sequence[str], *, query: str = "") -> Extracted:
        return self._first(lambda p: p.extract_estimate(len(urls)), lambda p: p.extract(urls, query=query))

    def _has_room(self, provider: SearchProvider, estimate: int) -> bool:
        return provider.configured and self.ledger.spent(provider.name) + estimate <= provider.monthly_cap

    def _first(self, estimate: Callable[[SearchProvider], int], call: Callable[[SearchProvider], R]) -> R:
        last: SearchError | None = None
        for provider in self.providers:
            if not self._has_room(provider, estimate(provider)):
                continue
            try:
                result = call(provider)
            except SearchError as e:
                log.warning("search provider %s failed: %s", provider.name, e)
                last = e
                continue
            self.ledger.add(provider.name, result.cost)
            return result
        raise last or SearchUnavailable("No search provider is configured or has allowance left.")


_providers: list[SearchProvider] | None = None


def set_providers(providers: Sequence[SearchProvider] | None) -> None:
    """Tests install fakes here; None goes back to the real providers."""
    global _providers
    _providers = list(providers) if providers is not None else None


def default_providers() -> list[SearchProvider]:
    if _providers is not None:
        return list(_providers)
    from dc_platform.search_exa import Exa
    from dc_platform.search_tavily import Tavily

    return [Tavily(), Exa()]


def get_chain(ledger: Ledger) -> SearchChain:
    return SearchChain(default_providers(), ledger)
