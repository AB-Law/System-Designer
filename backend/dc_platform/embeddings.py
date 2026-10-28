"""Chunk text, store float32 embeddings, and brute-force cosine search filtered by user and source.

Platform service used by interview docs (and later research, flashcards, mind maps). Modules own their
source rows; this module only stores and searches vectors keyed by (source_kind, source_id).
"""
from __future__ import annotations

import array
import math
import os
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from db import open_db
from dc_platform import llm
from dc_platform.rows import now

PAGE_BREAK = "\f"
SOURCE_DOC = "interview_doc"

# ~500 tokens at 4 chars/token, with overlap so a sentence split across a boundary is still findable
CHUNK_CHARS = int(os.environ.get("EMBED_CHUNK_CHARS", "2000"))
CHUNK_OVERLAP = int(os.environ.get("EMBED_CHUNK_OVERLAP", "200"))
DEFAULT_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
DEFAULT_DIMS = int(os.environ.get("EMBEDDING_DIMS", "1536"))
EMBED_BATCH = int(os.environ.get("EMBED_BATCH", "32"))  # chunks per embedding request


@dataclass(frozen=True)
class Chunk:
    index: int
    page: int
    text: str


@dataclass(frozen=True)
class Hit:
    source_kind: str
    source_id: int
    chunk_index: int
    page: int
    text: str
    score: float


def embedding_model() -> str:
    return os.environ.get("EMBEDDING_MODEL", DEFAULT_MODEL)


def embedding_dims() -> int:
    return int(os.environ.get("EMBEDDING_DIMS", str(DEFAULT_DIMS)))


def pack(vec: Sequence[float]) -> bytes:
    return array.array("f", vec).tobytes()


def unpack(blob: bytes) -> array.array:
    a = array.array("f")
    a.frombytes(blob)
    return a


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def chunk_text(text: str, *, size: int = CHUNK_CHARS, overlap: int = CHUNK_OVERLAP) -> list[Chunk]:
    """Split on form feeds (pages), then into overlapping character windows. Empty pages are skipped."""
    size = max(64, size)
    overlap = max(0, min(overlap, size // 2))
    out: list[Chunk] = []
    pages = text.split(PAGE_BREAK) if PAGE_BREAK in text else [text]
    for page_i, page in enumerate(pages, start=1):
        body = page.strip()
        if not body:
            continue
        if len(body) <= size:
            out.append(Chunk(len(out), page_i, body))
            continue
        start = 0
        while start < len(body):
            end = min(len(body), start + size)
            piece = body[start:end].strip()
            if piece:
                out.append(Chunk(len(out), page_i, piece))
            if end >= len(body):
                break
            start = max(start + 1, end - overlap)
    return out


def delete_source(user_id: int, source_kind: str, source_id: int) -> None:
    with open_db() as db, db:
        db.execute(
            "DELETE FROM embedding_chunks WHERE user_id=? AND source_kind=? AND source_id=?",
            (user_id, source_kind, source_id),
        )


def replace_source(
    user_id: int,
    source_kind: str,
    source_id: int,
    chunks: Sequence[Chunk],
    vectors: Sequence[Sequence[float]],
    *,
    model: str,
    dims: int,
) -> int:
    """Replace every vector for a source in one transaction. `chunks` and `vectors` must match 1:1."""
    if len(chunks) != len(vectors):
        raise ValueError("chunks and vectors length mismatch")
    t = now()
    with open_db() as db, db:
        db.execute(
            "DELETE FROM embedding_chunks WHERE user_id=? AND source_kind=? AND source_id=?",
            (user_id, source_kind, source_id),
        )
        db.executemany(
            "INSERT INTO embedding_chunks(user_id, source_kind, source_id, chunk_index, page, text, embedding, model, dims, created) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            [
                (user_id, source_kind, source_id, c.index, c.page, c.text, pack(v), model, dims, t)
                for c, v in zip(chunks, vectors, strict=True)
            ],
        )
    return len(chunks)


def list_chunks(user_id: int, source_kind: str, source_id: int) -> list[dict[str, Any]]:
    with open_db() as db:
        rows = db.execute(
            "SELECT chunk_index, page, text FROM embedding_chunks WHERE user_id=? AND source_kind=? AND source_id=? "
            "ORDER BY chunk_index",
            (user_id, source_kind, source_id),
        ).fetchall()
    return [{"index": r["chunk_index"], "page": r["page"], "text": r["text"]} for r in rows]


def search(
    user_id: int,
    query_vec: Sequence[float],
    *,
    source_kind: str,
    source_ids: Sequence[int],
    k: int = 6,
) -> list[Hit]:
    if not source_ids or k <= 0:
        return []
    placeholders = ",".join("?" * len(source_ids))
    with open_db() as db:
        rows = db.execute(
            f"SELECT source_kind, source_id, chunk_index, page, text, embedding FROM embedding_chunks "
            f"WHERE user_id=? AND source_kind=? AND source_id IN ({placeholders})",
            (user_id, source_kind, *source_ids),
        ).fetchall()
    scored = [
        Hit(r["source_kind"], r["source_id"], r["chunk_index"], r["page"], r["text"], cosine(query_vec, unpack(r["embedding"])))
        for r in rows
    ]
    scored.sort(key=lambda h: h.score, reverse=True)
    return scored[:k]


Progress = Callable[[float, str], None]


def embed_and_store(
    user_id: int,
    source_kind: str,
    source_id: int,
    text: str,
    *,
    module: str,
    progress: Progress | None = None,
    check: Callable[[], None] | None = None,
) -> dict[str, Any]:
    """Chunk, embed each piece (retrying transient failures), and replace the source's vectors."""
    chunks = chunk_text(text)
    if not chunks:
        delete_source(user_id, source_kind, source_id)
        return {"chunks": 0, "model": embedding_model(), "dims": 0}

    client = llm.client_for(user_id)
    model = getattr(client, "embedding_model", None) or embedding_model()
    vectors: list[list[float]] = []
    total = len(chunks)
    for start in range(0, total, EMBED_BATCH):
        if check:
            check()
        batch = chunks[start : start + EMBED_BATCH]
        if progress:
            progress(start / total, f"Embedding chunks {start + 1} to {start + len(batch)} of {total}")
        vectors.extend(client.embed([c.text for c in batch], user_id=user_id, module=module))
    if progress:
        progress(1.0, f"Embedded {total} chunks")

    dims = len(vectors[0]) if vectors else embedding_dims()
    replace_source(user_id, source_kind, source_id, chunks, vectors, model=model, dims=dims)
    return {"chunks": len(chunks), "model": model, "dims": dims}
