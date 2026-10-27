"""Module registry: feature modules mounted under /api/<name>, switched by ENABLED_MODULES.

A module is a package `modules/<name>/` exposing `router` (a FastAPI APIRouter) and optionally a
`migrations/` folder. `design` is the built-in Design Canvas and needs no package.
A module that fails to import is skipped with a log line; it never stops the API.
"""
from __future__ import annotations

import importlib
import logging
import os
import re
from pathlib import Path

from fastapi import FastAPI

log = logging.getLogger("dc.modules")

PACKAGE = "modules"  # tests point this at a scratch package
BUILTIN = {"design"}

_loaded: dict[str, Path] = {}  # module name -> migrations directory


def enabled_modules() -> list[str]:
    raw = os.environ.get("ENABLED_MODULES", "design")
    return [n for n in dict.fromkeys(p.strip() for p in raw.split(",")) if n]


def migration_dirs() -> dict[str, Path]:
    return dict(_loaded)


def register(app: FastAPI) -> list[str]:
    """Mount every enabled module that imports cleanly. Returns the names mounted."""
    _loaded.clear()
    from dc_platform import jobs

    app.include_router(jobs.router)
    mounted: list[str] = []
    for name in enabled_modules():
        if name in BUILTIN:
            continue
        try:
            if not re.match(r"^[a-z][a-z0-9_]*$", name):
                raise ValueError(f"bad module name {name!r}")
            mod = importlib.import_module(f"{PACKAGE}.{name}")
            app.include_router(mod.router, prefix=f"/api/{name}")
            _loaded[name] = Path(mod.__file__).parent / "migrations"
            mounted.append(name)
        except Exception:
            log.exception("module %r failed to load and was skipped", name)
    return mounted


def on_startup() -> None:
    """Called from the app lifespan: resume background jobs that a restart interrupted."""
    from dc_platform import jobs

    jobs.recover()
