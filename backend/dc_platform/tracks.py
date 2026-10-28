"""Tracks: which topics the Hub grid shows for someone. A track is a view over the shared topic list in `topics`, not a separate list,
so evidence is stored the same way whatever the track and nothing is lost when a user changes it.

The track is guessed from words: the target role first, then the CV, then system design as the default.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from dc_platform import topics

HITS_CAP = 8  # one long text cannot outvote a clear job title


@dataclass(frozen=True)
class Track:
    slug: str
    label: str
    topics: tuple[str, ...]
    words: tuple[str, ...]  # what a role title, skill list or job description says when it belongs to this track


TRACKS: tuple[Track, ...] = (
    Track(
        "backend", "System design",
        ("scalability", "caching", "databases", "queues-streaming", "load-balancing", "consistency", "api-design", "observability", "security", "behavioral"),
        ("backend", "back-end", "back end", "distributed", "microservice", "server-side", "kafka", "postgres", "golang", "java", "software engineer"),
    ),
    Track(
        "devops", "DevOps and SRE",
        ("ci-cd", "containers", "iac", "cloud-networking", "observability", "incident-response", "security", "behavioral"),
        ("devops", "sre", "site reliability", "platform engineer", "infrastructure engineer", "cloud engineer", "kubernetes", "terraform", "docker", "ci/cd", "ansible", "helm", "jenkins", "prometheus"),
    ),
    Track(
        "frontend", "Frontend",
        ("rendering-performance", "state-management", "browser-networking", "accessibility", "frontend-testing", "build-tooling", "caching", "api-design", "security", "behavioral"),
        ("frontend", "front-end", "front end", "react", "vue", "angular", "svelte", "css", "html", "javascript", "typescript", "ui engineer", "web developer", "next.js", "redux"),
    ),
)
DEFAULT = TRACKS[0]
_BY_SLUG = {t.slug: t for t in TRACKS}
_PATTERNS = {t.slug: re.compile(r"\b(?:" + "|".join(re.escape(w) for w in t.words) + r")(?!\w)") for t in TRACKS}

assert all(s in topics.SLUGS for t in TRACKS for s in t.topics), "a track lists a topic that does not exist"


def by_slug(slug: str) -> Track:
    return _BY_SLUG.get(slug, DEFAULT)


def detect(parts: list[tuple[str, int]]) -> Track | None:
    """The track the weighted texts point at, or None when they say nothing about any track. Ties go to the earlier track."""
    scores = {slug: 0 for slug in _BY_SLUG}
    for text, weight in parts:
        lowered = text.lower()
        for slug, pattern in _PATTERNS.items():
            scores[slug] += weight * min(len(pattern.findall(lowered)), HITS_CAP)
    best = max(scores.values())
    return next((t for t in TRACKS if scores[t.slug] == best), None) if best else None
