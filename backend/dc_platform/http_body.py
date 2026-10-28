"""Read a request body with a byte cap. Shared by CV uploads and interview transcription."""
from __future__ import annotations

from fastapi import HTTPException, Request

from dc_platform import files


async def read_capped(request: Request, cap: int | None = None) -> bytes:
    """Stream the body into memory; 413 once it exceeds `cap` (default: MAX_FILE_BYTES)."""
    limit = cap if cap is not None else files.max_file_bytes()
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise HTTPException(413, f"File is larger than {limit // (1024 * 1024)} MB.")
    buf = bytearray()
    async for chunk in request.stream():
        buf += chunk
        if len(buf) > limit:
            raise HTTPException(413, f"File is larger than {limit // (1024 * 1024)} MB.")
    return bytes(buf)
