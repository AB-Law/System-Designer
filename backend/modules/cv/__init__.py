"""CV module: upload and parse CVs, structure them, score against a pasted JD, suggest rewrites, keep history.

Enable with ENABLED_MODULES=design,cv (and VITE_ENABLED_MODULES=design,cv for the frontend build).
"""
from __future__ import annotations

from . import tasks
from .router import router

tasks.register()

__all__ = ["router"]
