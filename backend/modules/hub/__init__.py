"""Hub module: where the user stands across every module, for the role they are preparing for.

Enable with ENABLED_MODULES=design,hub (and VITE_ENABLED_MODULES=design,hub). It reads `readiness_events` and the
summaries of whichever other modules are enabled, and works with any of them missing.
"""
from __future__ import annotations

from .router import router

__all__ = ["router"]
