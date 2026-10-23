"""Shared FastAPI dependencies and request validation helpers."""
from __future__ import annotations

import json
import re
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request

from auth.security import user_from

MAX_DOC_BYTES = 300_000
PID_RE = re.compile(r"^[a-z0-9_]{1,64}$")
NAME_RE = re.compile(r"^[a-z0-9_]{3,24}$")


def get_current_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    u = user_from(authorization, request)
    if not u:
        raise HTTPException(401, "Sign in to do that.")
    return u


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


def optional_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any] | None:
    return user_from(authorization, request)


OptionalUser = Annotated[dict[str, Any] | None, Depends(optional_user)]


def pid(problem_id: str) -> str:
    if not PID_RE.match(problem_id):
        raise HTTPException(400, "Bad problem id")
    return problem_id


def check_doc(doc: dict[str, Any]) -> str:
    nodes, edges = doc.get("nodes"), doc.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list) or len(nodes) > 200 or len(edges) > 600:
        raise HTTPException(400, "That design is not valid or is too large.")
    text = json.dumps(doc, separators=(",", ":"))
    if len(text) > MAX_DOC_BYTES:
        raise HTTPException(413, "That design is too large.")
    return text
