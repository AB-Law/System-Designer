"""The only things the research model may do: search the web, and read pages that a search returned.

Neither tool takes free text that reaches a provider: a search names a *topic* and the query is built from the
role's family, level and company (see Bucket.query), so nothing from a CV or job description can leave the app.
A page can be read only if an earlier search returned its address. Tools collect evidence; they store nothing.
"""
from __future__ import annotations

from typing import Any

from dc_platform.search import Hit, SearchChain, SearchError, SearchUnavailable
from dc_platform.tool_loop import StopLoop, Tool, ToolError

from . import config
from .buckets import Bucket, Gap
from .distill import Source

PREVIEW = 300


class ResearchTools:
    def __init__(self, chain: SearchChain, bucket: Bucket, gap: Gap) -> None:
        self.chain, self.bucket, self.topics = chain, bucket, gap.topics()
        self.hits: dict[str, Hit] = {}
        self.pages: dict[str, str] = {}

    def tools(self) -> list[Tool]:
        return [
            Tool("search", f'{{"topic": one of {list(self.topics)}}}: look up interview questions or notes. The query is built for you.', self._search),
            Tool("read", '{"urls": [up to 3 addresses from earlier search results]}: read those pages in full.', self._read),
        ]

    def _search(self, args: dict[str, Any]) -> str:
        topic = str(args.get("topic", ""))
        if topic not in self.topics:
            raise ToolError(f"topic must be one of {list(self.topics)}.")
        try:
            found = self.chain.search(self.bucket.query(topic))
        except SearchUnavailable as e:
            raise StopLoop(str(e)) from e
        except SearchError as e:
            raise ToolError(f"The search failed: {e}") from e
        for hit in found.hits:
            self.hits.setdefault(hit.url, hit)
        if not found.hits:
            return "No results."
        return "\n".join(f"{i}. {h.title}\n   {h.url}\n   {h.snippet[:PREVIEW]}" for i, h in enumerate(found.hits, 1))

    def _read(self, args: dict[str, Any]) -> str:
        asked = args.get("urls")
        wanted = [u for u in (asked if isinstance(asked, list) else []) if isinstance(u, str) and u in self.hits and u not in self.pages]
        room = config.max_extract_urls() - len(self.pages)
        if not wanted:
            raise ToolError("urls must be addresses from search results that have not been read yet.")
        if room <= 0:
            raise ToolError("The page limit is reached. Finish.")
        try:
            got = self.chain.extract(wanted[: min(3, room)], query=self.bucket.query(self.topics[0]))
        except SearchUnavailable as e:
            raise StopLoop(str(e)) from e
        except SearchError as e:
            raise ToolError(f"Reading the pages failed: {e}") from e
        for page in got.pages:
            self.pages[page.url] = page.text
        if not got.pages:
            return "None of those pages could be read."
        return "\n".join(f"{p.url}: {p.text[:PREVIEW]}" for p in got.pages)

    def evidence(self) -> list[Source]:
        """Page text where a page was read, the search snippet for the rest."""
        return [Source(url, h.title, self.pages.get(url) or h.snippet) for url, h in self.hits.items() if self.pages.get(url) or h.snippet]
