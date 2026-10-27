"""The one list of topics that lessons, flashcards and interview feedback are matched against.

Producers write whatever label they have ("Caching and CDNs", "rate limiting"); `resolve` maps it to a slug here.
Anything that matches nothing is `OTHER` and stays out of the Hub's grid. One file, so the modules cannot drift apart.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

OTHER = "other"


@dataclass(frozen=True)
class Topic:
    slug: str
    label: str
    keywords: tuple[str, ...]  # matched at the start of a word, so "scal" covers scale, scaling, scalable


TOPICS: tuple[Topic, ...] = (
    Topic("scalability", "Scalability", ("scal", "capacity", "throughput", "back-of-envelope")),
    Topic("caching", "Caching", ("cach", "cdn", "redis", "memcache", "eviction")),
    Topic("databases", "Databases and indexing", ("database", "sql", "nosql", "index", "postgres", "mysql", "dynamo", "shard", "transaction", "storage")),
    Topic("queues-streaming", "Queues and streaming", ("queue", "kafka", "stream", "pub/sub", "pubsub", "message", "event-driven", "rabbit")),
    Topic("load-balancing", "Load balancing", ("load balanc", "reverse proxy", "nginx", "haproxy")),
    Topic("consistency", "Consistency and replication", ("consisten", "replicat", "quorum", "consensus", "raft", "paxos", "cap theorem")),
    Topic("api-design", "API design", ("api", "restful", "rest api", "grpc", "graphql", "rate limit", "pagination", "idempoten")),
    Topic("observability", "Observability", ("observab", "monitor", "logging", "metrics", "tracing", "alerting", "on-call", "slo")),
    Topic("security", "Security", ("security", "authn", "authz", "authenticat", "authoriz", "oauth", "encrypt", "tls")),
    Topic("behavioral", "Behavioral stories", ("behavio", "leadership", "conflict", "teamwork", "stories", "story")),
)

SLUGS = tuple(t.slug for t in TOPICS)
_BY_SLUG = {t.slug: t for t in TOPICS}
_PATTERNS = {t.slug: re.compile(r"\b(?:" + "|".join(re.escape(k) for k in t.keywords) + ")") for t in TOPICS}


def label_of(slug: str) -> str:
    return _BY_SLUG[slug].label


def resolve(raw: str) -> str:
    """The slug whose keywords the label hits most often; a slug resolves to itself; no hit means `OTHER`."""
    text = raw.strip().lower()
    if text in _BY_SLUG:
        return text
    hits = {slug: len(p.findall(text)) for slug, p in _PATTERNS.items()}
    best = max(hits.values(), default=0)
    return next((slug for slug in SLUGS if hits[slug] == best), OTHER) if best else OTHER


def mentioned_in(text: str) -> set[str]:
    """Slugs a longer text (a job description) touches at all."""
    lowered = text.lower()
    return {slug for slug, p in _PATTERNS.items() if p.search(lowered)}
