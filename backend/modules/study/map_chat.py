"""Short SSE chat grounded on a mind-map node's stored passages."""
from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from dc_platform import llm

from . import map_generate, maps, prompts


def stream(user_id: int, map_id: int, node_id: str, message: str) -> Iterator[dict[str, Any]]:
    maps.require_maps()
    node = maps.node_row(user_id, map_id, node_id)
    passages = map_generate.json_sources(node["sources_json"])
    block = "\n---\n".join(passages) if passages else "(no passages stored)"
    system = prompts.load("node_chat.md")
    user = (
        f"<node>\nlabel: {node['label']}\nsummary: {node['summary']}\n</node>\n"
        f"<passages>\n{block[:6000]}\n</passages>\n"
        f"<question>\n{message.strip()[:1000]}\n</question>"
    )
    yield {"event": "start", "data": {"nodeId": node_id}}
    text_parts: list[str] = []
    try:
        for chunk in llm.client_for(user_id).stream(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            user_id=user_id,
            module="study",
            temperature=0.3,
        ):
            text_parts.append(chunk)
            yield {"event": "token", "data": {"text": chunk}}
    except Exception as e:
        yield {"event": "error", "data": {"message": str(getattr(e, "detail", None) or e)}}
        return
    yield {"event": "done", "data": {"text": "".join(text_parts)}}


def sse_bytes(events: Iterator[dict[str, Any]]) -> Iterator[bytes]:
    for ev in events:
        payload = json.dumps(ev.get("data") or {}, ensure_ascii=False)
        yield f"event: {ev['event']}\ndata: {payload}\n\n".encode("utf-8")
