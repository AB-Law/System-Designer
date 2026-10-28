"""Tavily. Free plan: 1,000 credits a month. A basic search costs 1 credit; basic extraction costs 1 credit per 5 pages."""
from __future__ import annotations

import math
import os
from collections.abc import Sequence

from dc_platform.search import MAX_PAGE, MAX_SNIPPET, Extracted, Hit, Page, Searched, clip, http_url, post_json

BASE = "https://api.tavily.com"
FREE_CREDITS = 1_000
DEFAULT_CAP_SHARE = 0.9
URLS_PER_CREDIT = 5


class Tavily:
    name = "tavily"

    @property
    def _key(self) -> str:
        return os.environ.get("TAVILY_API_KEY", "").strip()

    @property
    def configured(self) -> bool:
        return bool(self._key)

    @property
    def monthly_cap(self) -> int:
        return int(os.environ.get("TAVILY_MONTHLY_CAP", str(int(FREE_CREDITS * DEFAULT_CAP_SHARE))))

    def search_estimate(self) -> int:
        return 1

    def extract_estimate(self, urls: int) -> int:
        return math.ceil(urls / URLS_PER_CREDIT)

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._key}"}

    def search(self, query: str, *, limit: int) -> Searched:
        data = post_json(
            f"{BASE}/search", headers=self._headers(), who="Tavily",
            body={"query": query, "search_depth": "basic", "max_results": limit},
        )
        hits = [
            Hit(url, clip(r.get("title"), 200), clip(r.get("content"), MAX_SNIPPET))
            for r in data.get("results") or []
            if (url := http_url(r.get("url")))
        ]
        return Searched(cost=self.search_estimate(), hits=hits)

    def extract(self, urls: Sequence[str], *, query: str) -> Extracted:
        body: dict[str, object] = {"urls": list(urls), "extract_depth": "basic", "format": "text"}
        if query:
            body["query"] = query
        data = post_json(f"{BASE}/extract", headers=self._headers(), body=body, who="Tavily")
        pages = [
            Page(url, clip(r.get("raw_content"), MAX_PAGE))
            for r in data.get("results") or []
            if (url := http_url(r.get("url")))
        ]
        # failed URLs are not charged, so the cost follows the pages that came back
        return Extracted(cost=self.extract_estimate(len(pages)), pages=[p for p in pages if p.text])
