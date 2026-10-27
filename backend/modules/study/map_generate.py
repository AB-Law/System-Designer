"""Mind map generation job and 'make deck from node'."""
from __future__ import annotations

import re
import uuid
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field

from dc_platform import jobs, llm

from . import content, decks, generate, maps, prompts, sources

MapSource = Literal["lesson", "jd", "document"]


class MapNodeIn(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=120)
    summary: str = Field(default="", max_length=2000)
    sources: list[str] = Field(default_factory=list)
    children: list[MapNodeIn] = Field(default_factory=list)


class MapDraft(BaseModel):
    root: MapNodeIn


MapNodeIn.model_rebuild()


def start(user_id: int, *, source_kind: MapSource, source_ref: str) -> dict[str, Any]:
    maps.require_maps()
    ref = source_ref.strip()
    corpus = _corpus(user_id, source_kind, ref)
    if len(corpus) < 40:
        raise HTTPException(422, "Not enough text to build a mind map.")
    row = maps.create(user_id, source_kind=source_kind, source_ref=ref)
    map_id = int(row["id"])
    job_id = jobs.enqueue(user_id, "study.map", {"map_id": map_id})
    maps.set_status(user_id, map_id, "generating", job_id=job_id)
    return maps.get_map(user_id, map_id)


def regenerate(user_id: int, map_id: int) -> dict[str, Any]:
    maps.require_maps()
    old = maps.get_row(user_id, map_id)
    new = maps.create(user_id, source_kind=old["source_kind"], source_ref=old["source_ref"], version=int(old["version"]) + 1)
    job_id = jobs.enqueue(user_id, "study.map", {"map_id": new["id"]})
    maps.set_status(user_id, new["id"], "generating", job_id=job_id)
    return maps.get_map(user_id, new["id"])


def run_job(ctx: jobs.JobContext) -> dict[str, Any]:
    uid = ctx.user_id
    map_id = int(ctx.payload["map_id"])
    row = maps.get_row(uid, map_id)
    try:
        ctx.progress(0.15, "Reading the source")
        corpus = _corpus(uid, row["source_kind"], row["source_ref"] or "")
        ctx.check()
        ctx.progress(0.45, "Extracting concepts")
        draft = llm.client_for(uid).complete_json(
            [
                {"role": "system", "content": prompts.load("mindmap.md")},
                {"role": "user", "content": f"<source>\n{corpus[:12000]}\n</source>"},
            ],
            MapDraft,
            user_id=uid,
            module="study",
            temperature=0.3,
        )
        ctx.check()
        ctx.progress(0.85, "Saving the graph")
        nodes, edges = flatten_tree(draft.root)
        maps.replace_graph(uid, map_id, nodes, edges)
        maps.set_status(uid, map_id, "ready", job_id=row["job_id"])
        return {"mapId": map_id, "nodes": len(nodes)}
    except jobs.JobCancelled:
        maps.set_status(uid, map_id, "failed", job_id=row["job_id"])
        raise
    except Exception as e:
        maps.set_status(uid, map_id, "failed", job_id=row["job_id"])
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(502, str(e)) from e


def flatten_tree(root: MapNodeIn) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    seen: set[str] = set()

    def walk(node: MapNodeIn, parent_id: str | None) -> None:
        nid = re.sub(r"[^a-zA-Z0-9_-]", "_", node.id)[:40] or f"n_{uuid.uuid4().hex[:8]}"
        if nid in seen:
            nid = f"{nid}_{uuid.uuid4().hex[:4]}"
        seen.add(nid)
        nodes.append({
            "id": nid,
            "label": node.label.strip()[:120],
            "parentId": parent_id,
            "summary": (node.summary or "").strip()[:2000],
            "sources": [s.strip()[:400] for s in (node.sources or []) if s.strip()][:6],
        })
        if parent_id:
            edges.append({"id": f"e{len(edges) + 1}", "source": parent_id, "target": nid})  # numbered, so long node ids cannot collide
        for child in node.children[:12]:
            walk(child, nid)

    walk(root, None)
    return nodes, edges


def deck_from_node(user_id: int, map_id: int, node_id: str) -> dict[str, Any]:
    """Create a ready deck from a node (summary + source passages) — no generation job."""
    from . import cards

    maps.require_maps()
    node = maps.node_row(user_id, map_id, node_id)
    label = str(node["label"]).strip() or "Concept"
    summary = str(node["summary"] or "").strip()
    passages = json_sources(node["sources_json"])
    deck = decks.create(user_id, label[:120], source_kind="mindmap_node", source_ref=f"{map_id}:{node_id}")
    drafts: list[dict[str, str]] = []
    if summary:
        drafts.append({"kind": "basic", "front": f"What is {label}?", "back": summary})
    for i, p in enumerate(passages[:6], start=1):
        drafts.append({"kind": "basic", "front": f"{label} — source note {i}", "back": p[:800]})
    if not drafts:
        drafts.append({"kind": "basic", "front": f"Recall: {label}", "back": label})
    for d in generate.filter_drafts([generate.DraftCard.model_validate(x) for x in drafts]):
        cards.create(user_id, deck["id"], kind=d.kind, front=d.front, back=d.back)
    return decks.get_deck(user_id, deck["id"])


def json_sources(raw: str) -> list[str]:
    import json

    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    return [str(x) for x in data] if isinstance(data, list) else []


def _corpus(user_id: int, kind: str, ref: str) -> str:
    if kind == "lesson":
        return content.lesson_text(ref)
    if kind == "jd":
        analysis = sources.analyse_jd(ref, user_id)
        parts = [analysis.get("title") or "", *[r.get("text", "") for r in analysis.get("requirements") or []]]
        parts.extend(analysis.get("talking_points") or [])
        return "\n".join(str(p) for p in parts if p) or ref
    if kind == "document":
        if not ref.isdigit():
            raise HTTPException(422, "Document id must be a number.")
        text, _name = sources.document_corpus(user_id, int(ref))
        return text
    raise HTTPException(422, f"Unknown map source: {kind}")
