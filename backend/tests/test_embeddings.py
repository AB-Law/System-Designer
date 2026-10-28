"""Unit tests for the platform embeddings store: chunking, float32 pack, cosine search."""
from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from dc_platform import embeddings, llm
from dc_platform.embeddings import PAGE_BREAK, Chunk, chunk_text, cosine, pack, unpack
from dc_platform.llm import FakeAdapter
from tests.helpers import register


@pytest.fixture()
def api(app_env: Path) -> Generator[TestClient, None, None]:
    from main import create_app

    with TestClient(create_app()) as c:
        register(c, "alice")
        yield c


def uid() -> int:
    from db import open_db

    with open_db() as db:
        return int(db.execute("SELECT id FROM users WHERE username=?", ("alice",)).fetchone()["id"])


def test_chunk_text_keeps_page_numbers() -> None:
    text = f"page one content that is short{PAGE_BREAK}page two also short"
    chunks = chunk_text(text, size=2000, overlap=0)
    assert [(c.page, c.text) for c in chunks] == [(1, "page one content that is short"), (2, "page two also short")]


def test_chunk_text_splits_long_pages_with_overlap() -> None:
    body = "abcdefghij" * 30  # 300 chars
    chunks = chunk_text(body, size=100, overlap=20)
    assert len(chunks) >= 3
    assert chunks[0].index == 0 and chunks[0].page == 1
    assert "".join(c.text for c in chunks).count("abcdefghij") >= 10


def test_pack_unpack_round_trip() -> None:
    vec = [0.1, -0.5, 0.25, 1.0]
    assert list(unpack(pack(vec))) == pytest.approx(vec)


def test_cosine_orders_similar_vectors() -> None:
    a = [1.0, 0.0, 0.0]
    assert cosine(a, [1.0, 0.0, 0.0]) == pytest.approx(1.0)
    assert cosine(a, [0.0, 1.0, 0.0]) == pytest.approx(0.0)
    assert cosine(a, [0.9, 0.1, 0.0]) > cosine(a, [0.1, 0.9, 0.0])


def test_search_returns_top_hits_for_user_sources(api: TestClient) -> None:
    u = uid()
    llm.set_adapter_factory(lambda: FakeAdapter(embed_dims=8))
    try:
        client = llm.client_for(u)
        texts = ["postgres indexing strategies", "behavioral leadership stories", "postgres query plans"]
        chunks = [Chunk(i, 1, t) for i, t in enumerate(texts)]
        vectors = client.embed(texts, user_id=u, module="test")
        embeddings.replace_source(u, "interview_doc", 1, chunks, vectors, model="fake-embed", dims=8)
        embeddings.replace_source(
            u, "interview_doc", 2,
            [Chunk(0, 1, "unrelated cooking recipes")],
            client.embed(["unrelated cooking recipes"], user_id=u, module="test"),
            model="fake-embed", dims=8,
        )
        q = client.embed(["postgres database performance"], user_id=u, module="test")[0]
        hits = embeddings.search(u, q, source_kind="interview_doc", source_ids=[1], k=2)
        assert len(hits) == 2
        assert all(h.source_id == 1 for h in hits)
        assert "postgres" in hits[0].text.lower()
        # another user sees nothing
        assert embeddings.search(999, q, source_kind="interview_doc", source_ids=[1], k=2) == []
    finally:
        llm.set_adapter_factory(None)


def test_delete_source_removes_vectors(api: TestClient) -> None:
    u = uid()
    llm.set_adapter_factory(lambda: FakeAdapter(embed_dims=4))
    try:
        client = llm.client_for(u)
        vecs = client.embed(["only chunk"], user_id=u, module="test")
        embeddings.replace_source(u, "interview_doc", 7, [Chunk(0, 1, "only chunk")], vecs, model="fake", dims=4)
        assert embeddings.list_chunks(u, "interview_doc", 7)
        embeddings.delete_source(u, "interview_doc", 7)
        assert embeddings.list_chunks(u, "interview_doc", 7) == []
    finally:
        llm.set_adapter_factory(None)
