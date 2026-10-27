"""Search providers (HTTP mocked) and the failover chain with its allowance ledger. No database or network."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

import httpx
import pytest

from dc_platform import search
from dc_platform.search import Hit, Page, SearchChain, SearchError, SearchUnavailable
from dc_platform.search_exa import Exa
from dc_platform.search_tavily import Tavily


class MemoryLedger:
    def __init__(self) -> None:
        self.used: dict[str, int] = defaultdict(int)

    def spent(self, provider: str) -> int:
        return self.used[provider]

    def add(self, provider: str, units: int) -> None:
        self.used[provider] += units


class FakeProvider:
    def __init__(self, name: str, *, configured: bool = True, cap: int = 10, fail: bool = False, cost: int = 1) -> None:
        self.name, self._configured, self._cap, self.fail, self.cost = name, configured, cap, fail, cost
        self.calls = 0

    configured = property(lambda self: self._configured)  # type: ignore[assignment]
    monthly_cap = property(lambda self: self._cap)  # type: ignore[assignment]

    def search_estimate(self) -> int:
        return self.cost

    def extract_estimate(self, urls: int) -> int:
        return urls * self.cost

    def search(self, query: str, *, limit: int) -> search.Searched:
        self.calls += 1
        if self.fail:
            raise SearchError("down")
        return search.Searched(cost=self.cost, hits=[Hit(f"https://{self.name}.example/q", self.name, query)])

    def extract(self, urls: Any, *, query: str) -> search.Extracted:
        self.calls += 1
        if self.fail:
            raise SearchError("down")
        return search.Extracted(cost=len(urls) * self.cost, pages=[Page(u, "text") for u in urls])


def chain(*providers: FakeProvider, ledger: MemoryLedger | None = None) -> SearchChain:
    return SearchChain(providers, ledger or MemoryLedger())


# ---------------------------------------------------------------- chain

def test_the_first_provider_answers_and_is_charged() -> None:
    a, b, ledger = FakeProvider("a"), FakeProvider("b"), MemoryLedger()
    found = chain(a, b, ledger=ledger).search("q")
    assert found.hits[0].title == "a" and b.calls == 0
    assert ledger.used == {"a": 1}


def test_a_failing_provider_falls_over_to_the_next() -> None:
    a, b, ledger = FakeProvider("a", fail=True), FakeProvider("b"), MemoryLedger()
    assert chain(a, b, ledger=ledger).search("q").hits[0].title == "b"
    assert ledger.used["a"] == 0 and ledger.used["b"] == 1  # nothing is charged for the failed call


def test_a_provider_at_its_cap_is_skipped_without_a_call() -> None:
    ledger = MemoryLedger()
    ledger.used["a"] = 10
    a, b = FakeProvider("a", cap=10), FakeProvider("b")
    assert chain(a, b, ledger=ledger).search("q").hits[0].title == "b"
    assert a.calls == 0


def test_an_unconfigured_provider_is_skipped() -> None:
    a, b = FakeProvider("a", configured=False), FakeProvider("b")
    c = chain(a, b)
    assert c.configured() and c.search("q").hits[0].title == "b" and a.calls == 0


def test_nothing_available_raises_unavailable() -> None:
    c = chain(FakeProvider("a", configured=False))
    assert not c.configured() and not c.available()
    with pytest.raises(SearchUnavailable):
        c.search("q")


def test_all_failing_raises_the_last_error() -> None:
    with pytest.raises(SearchError, match="down"):
        chain(FakeProvider("a", fail=True), FakeProvider("b", fail=True)).search("q")


def test_extract_checks_room_for_every_page() -> None:
    ledger = MemoryLedger()
    ledger.used["a"] = 8
    a, b = FakeProvider("a", cap=10), FakeProvider("b")
    got = chain(a, b, ledger=ledger).extract(["https://x.example/1", "https://x.example/2", "https://x.example/3"])
    assert [p.url for p in got.pages][0] == "https://x.example/1" and a.calls == 0 and ledger.used["b"] == 3


# ---------------------------------------------------------------- real providers, HTTP mocked

def reply(monkeypatch: pytest.MonkeyPatch, payload: Any, status: int = 200) -> list[dict[str, Any]]:
    seen: list[dict[str, Any]] = []

    def post(url: str, **kw: Any) -> httpx.Response:
        seen.append({"url": url, **kw})
        return httpx.Response(status, json=payload, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", post)
    return seen


def test_tavily_search_maps_hits_and_costs_one_credit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-secret")
    seen = reply(monkeypatch, {"results": [
        {"url": "https://a.example/x", "title": "A", "content": "one two"},
        {"url": "javascript:alert(1)", "title": "bad", "content": "x"},
    ]})
    got = Tavily().search("backend interview questions", limit=5)
    assert got.cost == 1 and [h.url for h in got.hits] == ["https://a.example/x"]
    assert seen[0]["headers"]["Authorization"] == "Bearer tvly-secret"
    assert seen[0]["json"] == {"query": "backend interview questions", "search_depth": "basic", "max_results": 5}


def test_tavily_extract_charges_per_five_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", "k")
    pages = [{"url": f"https://a.example/{i}", "raw_content": f"page {i}"} for i in range(6)]
    reply(monkeypatch, {"results": pages, "failed_results": []})
    got = Tavily().extract([p["url"] for p in pages], query="q")
    assert got.cost == 2 and len(got.pages) == 6


def test_tavily_cap_defaults_to_ninety_percent_of_the_free_plan(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TAVILY_MONTHLY_CAP", raising=False)
    assert Tavily().monthly_cap == 900
    monkeypatch.setenv("TAVILY_MONTHLY_CAP", "50")
    assert Tavily().monthly_cap == 50


def test_exa_search_and_contents_are_costed_in_micro_dollars(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EXA_API_KEY", "exa-secret")
    monkeypatch.delenv("EXA_SEARCH_TYPE", raising=False)
    seen = reply(monkeypatch, {"results": [{"url": "https://b.example/y", "title": "B", "text": "body"}]})
    searched = Exa().search("q", limit=5)
    assert searched.cost == 7_000 and searched.hits[0].snippet == "body"
    assert seen[0]["headers"] == {"x-api-key": "exa-secret"} and seen[0]["json"]["type"] == "auto"
    extracted = Exa().extract(["https://b.example/y"], query="q")
    assert extracted.cost == 1_000 and seen[1]["url"].endswith("/contents")


def test_exa_search_type_and_cap_come_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EXA_SEARCH_TYPE", "lite")
    assert Exa().search_estimate() == 4_000
    monkeypatch.setenv("EXA_SEARCH_TYPE", "nonsense")
    assert Exa().search_estimate() == 7_000
    monkeypatch.delenv("EXA_MONTHLY_CAP_USD", raising=False)
    assert Exa().monthly_cap == 9_000_000


def test_http_errors_never_leak_the_key_or_the_body(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-secret")
    reply(monkeypatch, {"detail": "tvly-secret is over its plan"}, status=432)
    with pytest.raises(SearchError) as e:
        Tavily().search("q", limit=3)
    assert "tvly-secret" not in str(e.value) and "432" in str(e.value)


def test_a_network_failure_is_a_search_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*a: Any, **k: Any) -> httpx.Response:
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(httpx, "post", boom)
    monkeypatch.setenv("EXA_API_KEY", "k")
    with pytest.raises(SearchError, match="could not be reached"):
        Exa().search("q", limit=3)


def test_set_providers_swaps_the_defaults() -> None:
    fake = FakeProvider("f")
    search.set_providers([fake])
    try:
        assert search.default_providers() == [fake]
    finally:
        search.set_providers(None)
    assert [p.name for p in search.default_providers()] == ["tavily", "exa"]
