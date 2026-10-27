"""Study module: spaced-repetition flashcards and concept mind maps.

Enable with ENABLED_MODULES=design,study (and VITE_ENABLED_MODULES=design,study).
Mind maps also need the study.maps slice flag.
"""
from __future__ import annotations

from . import tasks
from .router import router

tasks.register()

__all__ = ["router"]
