"""Exa. Free credit: $10 a month, so cost is tracked in millionths of a dollar.

Prices (per request, up to 10 results): search `lite` $0.004, `auto` $0.007; contents $0.001 per page.
`auto` is the default because it is the long-standing search type; set EXA_SEARCH_TYPE=lite for the cheaper one.
"""
from __future__ import annotations

import os
from collections.abc import Sequence

from dc_platform.search import MAX_PAGE, MAX_SNIPPET, Extracted, Hit, Page, Searched, clip, http_url, post_json

BASE = "https://api.exa.ai"
FREE_MICRO_USD = 10_000_000
DEFAULT_CAP_SHARE = 0.9
SEARCH_MICRO_USD = {"lite": 4_000, "instant": 4_000, "auto": 7_000, "fast": 7_000}
DEFAULT_TYPE = "auto"
PAGE_MICRO_USD = 1_000


class Exa:
    name = "exa"

    @property
    def _key(self) -> str:
        return os.environ.get("EXA_API_KEY", "").strip()

    @property
    def configured(self) -> bool:
        return bool(self._key)

    @property
    def monthly_cap(self) -> int:
        dollars = os.environ.get("EXA_MONTHLY_CAP_USD")
        return int(float(dollars) * 1_000_000) if dollars else int(FREE_MICRO_USD * DEFAULT_CAP_SHARE)

    @property
    def _type(self) -> str:
        chosen = os.environ.get("EXA_SEARCH_TYPE", DEFAULT_TYPE).strip().lower()
        return chosen if chosen in SEARCH_MICRO_USD else DEFAULT_TYPE

    def search_estimate(self) -> int:
        return SEARCH_MICRO_USD[self._type]

    def extract_estimate(self, urls: int) -> int:
        return urls * PAGE_MICRO_USD

    def _headers(self) -> dict[str, str]:
        return {"x-api-key": self._key}

    def search(self, query: str, *, limit: int) -> Searched:
        data = post_json(
            f"{BASE}/search", headers=self._headers(), who="Exa",
            body={"query": query, "type": self._type, "numResults": limit, "contents": {"text": {"maxCharacters": MAX_SNIPPET}}},
        )
        hits = [
            Hit(url, clip(r.get("title"), 200), clip(r.get("text"), MAX_SNIPPET))
            for r in data.get("results") or []
            if (url := http_url(r.get("url")))
        ]
        return Searched(cost=self.search_estimate(), hits=hits)

    def extract(self, urls: Sequence[str], *, query: str) -> Extracted:
        data = post_json(
            f"{BASE}/contents", headers=self._headers(), who="Exa",
            body={"urls": list(urls), "text": {"maxCharacters": MAX_PAGE}},
        )
        pages = [
            Page(url, clip(r.get("text"), MAX_PAGE))
            for r in data.get("results") or []
            if (url := http_url(r.get("url")))
        ]
        return Extracted(cost=self.extract_estimate(len(pages)), pages=[p for p in pages if p.text])
