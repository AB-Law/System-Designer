"""The store of distilled questions. Shared across users by default (public web data only), or per user by config.

A row is one short question with where it came from. Rows are never deleted when they age: an expired row
stops counting as fresh (so the next search refills it) but is still served as an older fallback.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException

from db import open_db
from dc_platform import embeddings, llm
from dc_platform.rows import now

from . import config
from .buckets import Bucket, Gap

COLUMNS = "id, bucket_key, kind, category, question, source_url, source_name, fetched"
VISIBLE = "flagged=0 AND user_id IS ?"


@dataclass(frozen=True)
class Candidate:
    """A question a distill pass found, before it is stored."""

    question: str
    category: str
    kind: str
    source_url: str
    source_name: str


@dataclass
class _Known:
    id: int
    bucket_key: str
    text: str
    flagged: bool
    vector: Any | None


def _rows(user_id: int, keys: list[str]) -> list[Any]:
    marks = ",".join("?" * len(keys))
    with open_db() as db:
        return db.execute(
            f"SELECT {COLUMNS} FROM research_questions WHERE bucket_key IN ({marks}) AND {VISIBLE} ORDER BY fetched DESC, id DESC",
            (*keys, config.owner(user_id)),
        ).fetchall()


def is_fresh(row: Any, at: int | None = None) -> bool:
    return ((at or now()) - row["fetched"]) <= config.fresh_days(row["kind"]) * config.DAY_MS


def _fresh_count(rows: list[Any], key: str | None, kinds: set[str] | None = None) -> int:
    return sum(1 for r in rows if r["bucket_key"] == key and is_fresh(r) and (kinds is None or r["kind"] in kinds))


def _cooling(user_id: int, keys: list[str]) -> set[str]:
    """Buckets searched within the cooldown. They are not searched again yet, whatever the search found."""
    since = now() - config.cooldown_hours() * 3_600_000
    marks = ",".join("?" * len(keys))
    with open_db() as db:
        rows = db.execute(
            f"SELECT bucket_key FROM research_searched WHERE bucket_key IN ({marks}) AND owner=? AND at>?",
            (*keys, config.owner(user_id) or 0, since),
        ).fetchall()
    return {r["bucket_key"] for r in rows}


def gap(user_id: int, bucket: Bucket) -> Gap:
    """What a search still has to find: general questions for the family and level, and items about the company."""
    rows = _rows(user_id, bucket.keys)
    cooling = _cooling(user_id, bucket.keys)
    return Gap(
        generic=bucket.generic_key not in cooling and _fresh_count(rows, bucket.generic_key, {"question"}) < config.min_items(),
        company=bool(bucket.company_key) and bucket.company_key not in cooling
        and _fresh_count(rows, bucket.company_key) < config.min_company_items(),
    )


def mark_searched(user_id: int, bucket: Bucket, need: Gap) -> None:
    """Record that the buckets in `need` have just been searched."""
    keys = [k for k, wanted in ((bucket.generic_key, need.generic), (bucket.company_key, need.company)) if wanted and k]
    with open_db() as db, db:
        db.executemany(
            "INSERT INTO research_searched(bucket_key, owner, at) VALUES (?,?,?) "
            "ON CONFLICT(bucket_key, owner) DO UPDATE SET at=excluded.at",
            [(k, config.owner(user_id) or 0, now()) for k in keys],
        )


def public(row: Any) -> dict[str, Any]:
    return {
        "ref": f"s{row['id']}", "storeId": row["id"], "question": row["question"], "category": row["category"], "kind": row["kind"],
        "sourceUrl": row["source_url"], "sourceName": row["source_name"], "fetched": row["fetched"],
    }


def usable(user_id: int, bucket: Bucket) -> list[dict[str, Any]]:
    """Everything a role can draw on, fresh items first (newest first within each), then older ones."""
    rows = _rows(user_id, bucket.keys)
    ordered = sorted(rows, key=lambda r: not is_fresh(r))  # stable: the query already put newest first
    return [public(r) for r in ordered[: config.bank_size()]]


def _normal(text: str) -> str:
    return " ".join(text.lower().split()).rstrip("?. ")


def _embed(user_id: int, texts: list[str]) -> tuple[list[list[float]] | None, str]:
    """Vectors for near-duplicate checks. Without an embeddings provider this returns None and only exact repeats merge."""
    client = llm.client_for(user_id)
    try:
        return client.embed(texts, user_id=user_id, module="interview"), getattr(client, "embedding_model", "") or embeddings.embedding_model()
    except (llm.LLMError, HTTPException):  # no embeddings provider, or the allowance is used up: store without vectors
        return None, ""


def _known(user_id: int, keys: list[str]) -> list[_Known]:
    marks = ",".join("?" * len(keys))
    with open_db() as db:
        rows = db.execute(
            f"SELECT id, bucket_key, question, flagged, embedding FROM research_questions WHERE bucket_key IN ({marks}) AND user_id IS ?",
            (*keys, config.owner(user_id)),
        ).fetchall()
    return [_Known(r["id"], r["bucket_key"], _normal(r["question"]), bool(r["flagged"]), embeddings.unpack(r["embedding"]) if r["embedding"] else None) for r in rows]


def _find(known: list[_Known], key: str, text: str, vector: list[float] | None) -> _Known | None:
    threshold = config.merge_threshold()
    for k in known:
        if k.bucket_key != key:
            continue
        if k.text == text or (vector is not None and k.vector is not None and embeddings.cosine(vector, k.vector) >= threshold):
            return k
    return None


def add(user_id: int, bucket: Bucket, candidates: list[Candidate]) -> int:
    """Store the new questions. One that matches a stored one (same words, or a near paraphrase) only renews it. Returns how many were new."""
    if not candidates:
        return 0
    vectors, model = _embed(user_id, [c.question for c in candidates])
    known = _known(user_id, bucket.keys)
    added = 0
    for i, c in enumerate(candidates):
        key, vector, text = bucket.key_for(c.category, c.kind), (vectors[i] if vectors else None), _normal(c.question)
        match = _find(known, key, text, vector)
        if match:
            _renew(match)
            continue
        row_id = _insert(user_id, key, c, vector, model)
        known.append(_Known(row_id, key, text, False, vector))
        added += 1
    return added


def _renew(match: _Known) -> None:
    if match.flagged:
        return  # a hidden item stays hidden
    with open_db() as db, db:
        db.execute("UPDATE research_questions SET fetched=? WHERE id=?", (now(), match.id))


def _insert(user_id: int, key: str, c: Candidate, vector: list[float] | None, model: str) -> int:
    with open_db() as db, db:
        cur = db.execute(
            "INSERT INTO research_questions(user_id, bucket_key, kind, category, question, source_url, source_name, fetched, embedding, model, dims) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                config.owner(user_id), key, c.kind, c.category, c.question, c.source_url, c.source_name, now(),
                embeddings.pack(vector) if vector else None, model if vector else "", len(vector) if vector else 0,
            ),
        )
        return int(cur.lastrowid or 0)


def flag(user_id: int, item_id: int) -> None:
    """Hide an item for everyone who shares the store, until someone reviews it."""
    with open_db() as db, db:
        hidden = db.execute(
            "UPDATE research_questions SET flagged=1 WHERE id=? AND (user_id IS NULL OR user_id=?)", (item_id, user_id),
        ).rowcount
    if not hidden:
        raise HTTPException(404, "Question not found.")


def visible_ids(ids: list[int]) -> set[int]:
    """Which of these store rows are still unflagged (a bank drops the ones that are not)."""
    if not ids:
        return set()
    with open_db() as db:
        rows = db.execute(f"SELECT id FROM research_questions WHERE flagged=0 AND id IN ({','.join('?' * len(ids))})", ids).fetchall()
    return {r["id"] for r in rows}


def delete_user_data(user_id: int) -> None:
    """Rows a user owns (only when the store is per user) and their run counts. Shared rows are public data and stay."""
    with open_db() as db, db:
        db.execute("DELETE FROM research_questions WHERE user_id=?", (user_id,))
        db.execute("DELETE FROM research_user_quota WHERE user_id=?", (user_id,))
        db.execute("DELETE FROM research_searched WHERE owner=? AND owner<>0", (user_id,))
