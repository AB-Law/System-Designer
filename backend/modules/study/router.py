"""Study module API, mounted at /api/study. Every route is scoped to the signed-in user."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from deps import CurrentUser

from . import cards, content, decks, generate, map_chat, map_generate, maps, portability
from .schemas import (
    CardCreate,
    CardPatch,
    DeckCreate,
    DeckPatch,
    GenerateIn,
    MapCreate,
    NodeChatIn,
    NodePatch,
    ReviewIn,
)

router = APIRouter(tags=["study"])


# ---------------------------------------------------------------- content catalog


@router.get("/content/lessons")
async def list_lessons(user: CurrentUser) -> list[dict[str, Any]]:
    _ = user
    return await run_in_threadpool(content.list_lessons)


@router.get("/content/glossary")
async def get_glossary(user: CurrentUser) -> list[dict[str, str]]:
    _ = user
    return await run_in_threadpool(content.glossary)


# ---------------------------------------------------------------- your data


@router.get("/export")
async def export_data(user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(portability.export_all, user["id"])


@router.delete("/data")
async def delete_data(user: CurrentUser) -> dict[str, bool]:
    await run_in_threadpool(portability.delete_all, user["id"])
    return {"ok": True}


# ---------------------------------------------------------------- decks


@router.get("/decks")
async def list_decks(user: CurrentUser) -> list[dict[str, Any]]:
    return await run_in_threadpool(decks.list_decks, user["id"])


@router.post("/decks")
async def create_deck(body: DeckCreate, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(decks.create, user["id"], body.name, parent_id=body.parentId)


@router.post("/decks/generate")
async def generate_deck(body: GenerateIn, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(
        generate.start,
        user["id"],
        name=body.name.strip() or body.sourceRef.strip()[:80],
        source_kind=body.sourceKind,
        source_ref=body.sourceRef,
        parent_id=body.parentId,
    )


@router.post("/decks/{deck_id}/confirm")
async def confirm_deck(deck_id: int, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(generate.confirm, user["id"], deck_id)


@router.get("/decks/due")
async def due_cards(user: CurrentUser, deckId: int | None = None, limit: int = Query(default=100, ge=1, le=200)) -> list[dict[str, Any]]:
    return await run_in_threadpool(cards.due, user["id"], deck_id=deckId, limit=limit)


@router.get("/decks/stats")
async def study_stats(user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(cards.global_stats, user["id"])


@router.get("/decks/{deck_id}")
async def get_deck(deck_id: int, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(decks.get_deck, user["id"], deck_id)


@router.patch("/decks/{deck_id}")
async def patch_deck(deck_id: int, body: DeckPatch, user: CurrentUser) -> dict[str, Any]:
    clear_parent = "parentId" in body.model_fields_set and body.parentId is None
    parent = None if clear_parent else body.parentId
    return await run_in_threadpool(
        decks.patch,
        user["id"],
        deck_id,
        name=body.name,
        parent_id=parent,
        clear_parent=clear_parent,
    )


@router.delete("/decks/{deck_id}")
async def delete_deck(deck_id: int, user: CurrentUser) -> dict[str, bool]:
    await run_in_threadpool(decks.delete, user["id"], deck_id)
    return {"ok": True}


@router.get("/decks/{deck_id}/cards")
async def list_cards(deck_id: int, user: CurrentUser) -> list[dict[str, Any]]:
    return await run_in_threadpool(cards.list_for_deck, user["id"], deck_id)


@router.post("/decks/{deck_id}/cards")
async def create_card(deck_id: int, body: CardCreate, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(cards.create, user["id"], deck_id, kind=body.kind, front=body.front, back=body.back)


@router.get("/decks/{deck_id}/stats")
async def deck_stats(deck_id: int, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(cards.deck_stats, user["id"], deck_id)


# ---------------------------------------------------------------- cards


@router.patch("/cards/{card_id}")
async def patch_card(card_id: int, body: CardPatch, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(cards.patch, user["id"], card_id, kind=body.kind, front=body.front, back=body.back)


@router.delete("/cards/{card_id}")
async def delete_card(card_id: int, user: CurrentUser) -> dict[str, bool]:
    await run_in_threadpool(cards.delete, user["id"], card_id)
    return {"ok": True}


@router.post("/cards/{card_id}/review")
async def review_card(card_id: int, body: ReviewIn, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(cards.review, user["id"], card_id, body.rating)


# ---------------------------------------------------------------- mind maps (study.maps)


@router.get("/maps")
async def list_maps(user: CurrentUser) -> list[dict[str, Any]]:
    return await run_in_threadpool(maps.list_maps, user["id"])


@router.post("/maps")
async def create_map(body: MapCreate, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(
        map_generate.start,
        user["id"],
        source_kind=body.sourceKind,
        source_ref=body.sourceRef,
    )


@router.get("/maps/{map_id}")
async def get_map(map_id: int, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(maps.get_map, user["id"], map_id)


@router.post("/maps/{map_id}/regenerate")
async def regenerate_map(map_id: int, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(map_generate.regenerate, user["id"], map_id)


@router.patch("/maps/{map_id}/nodes/{node_id}")
async def patch_node(map_id: int, node_id: str, body: NodePatch, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(
        maps.patch_node,
        user["id"],
        map_id,
        node_id,
        label=body.label,
        summary=body.summary,
        delete=body.delete,
        add_child_label=body.addChildLabel,
    )


@router.post("/maps/{map_id}/nodes/{node_id}/deck")
async def node_deck(map_id: int, node_id: str, user: CurrentUser) -> dict[str, Any]:
    return await run_in_threadpool(map_generate.deck_from_node, user["id"], map_id, node_id)


@router.post("/maps/{map_id}/nodes/{node_id}/chat")
def node_chat(map_id: int, node_id: str, body: NodeChatIn, user: CurrentUser) -> StreamingResponse:
    maps.require_maps()
    uid = user["id"]
    return StreamingResponse(
        map_chat.sse_bytes(map_chat.stream(uid, map_id, node_id, body.message)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
