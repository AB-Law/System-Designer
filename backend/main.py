"""
Optional backend for Design Canvas.

The React app works on its own. When this service is running it additionally:
  * serves problems from a folder (drop a JSON file in, it appears, no rebuild)
  * validates every problem file against the schema and reports errors
  * accounts (invite-only sign-up), per-user designs, versions, submissions, revocable share links, cohorts
  * proxies AI review calls to LM Studio or OpenAI (no browser CORS, keys stay in .env)
  * serves the built frontend, so one process is the whole app

Run:  backend/.venv/Scripts/python -m uvicorn main:app --app-dir backend --port 8000
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import modules
from auth.invite import announce_invite_code
from auth.security import SESSION_COOKIE
from config import DIST_DIR, load_env
from db import connect
from routes import api_router

load_env()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    connect().close()
    modules.on_startup()
    announce_invite_code()
    yield


def create_app() -> FastAPI:
    application = FastAPI(title="Design Canvas API", lifespan=lifespan)
    application.include_router(api_router)
    modules.register(application)

    @application.middleware("http")
    async def session_cookie_as_bearer(request: Request, call_next):  # type: ignore[no-untyped-def]
        """Prefer an explicit Bearer token; otherwise promote the HttpOnly session cookie."""
        if request.url.path.startswith("/api") and not request.headers.get("authorization"):
            cookie = request.cookies.get(SESSION_COOKIE)
            if cookie:
                headers = [(k, v) for k, v in request.scope["headers"] if k.lower() != b"authorization"]
                headers.append((b"authorization", f"Bearer {cookie}".encode("latin-1")))
                request.scope["headers"] = headers
        return await call_next(request)

    if DIST_DIR.exists():
        application.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

        @application.get("/{path:path}", include_in_schema=False)
        def spa(path: str) -> FileResponse:
            f = (DIST_DIR / path).resolve()
            if path and DIST_DIR in f.parents and f.is_dir() and (f / "index.html").is_file():
                f = f / "index.html"  # prerendered pages such as /learn/ and /problems/<id>/
            if path and DIST_DIR in f.parents and f.is_file():
                return FileResponse(f)
            return FileResponse(DIST_DIR / "index.html")

    return application


app = create_app()
