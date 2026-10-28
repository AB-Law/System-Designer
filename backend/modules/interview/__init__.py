"""Interview module: mock interviews for a role, run in character, with feedback on every answer.

Enable with ENABLED_MODULES=design,interview (and VITE_ENABLED_MODULES=design,interview for the frontend build).
It uses the CV module's CV and job-description reading when that module is enabled, and works without them.
"""
from __future__ import annotations

from . import tasks
from .router import router

tasks.register()

__all__ = ["router"]
