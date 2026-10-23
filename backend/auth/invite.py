"""Invite-only sign-up codes."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets

from config import BACKEND_DIR


def invite_code() -> str:
    env = os.environ.get("INVITE_CODE", "").strip()
    if env:
        return env
    f = BACKEND_DIR / "invite_code.txt"
    if f.exists():
        return f.read_text(encoding="utf-8").strip()
    code = secrets.token_urlsafe(9)
    f.write_text(code, encoding="utf-8")
    return code


def announce_invite_code() -> None:
    """Print the invite code only the first time it is created; later starts point at the file or env."""
    if os.environ.get("INVITE_CODE", "").strip():
        print("\n  Sign-up uses INVITE_CODE from backend/.env (not printed).\n")
        return
    f = BACKEND_DIR / "invite_code.txt"
    existed = f.exists()
    code = invite_code()
    if existed:
        print("\n  Sign-up invite code is in backend/invite_code.txt (not printed; set INVITE_CODE to override).\n")
    else:
        print(f"\n  Sign-up invite code: {code}\n  (saved to backend/invite_code.txt; share it only with people you want to let in)\n")


def invite_ok(provided: str | None) -> bool:
    got = (provided or "").strip().encode("utf-8")
    want = invite_code().encode("utf-8")
    if len(got) != len(want):
        # still do a compare of equal-length dummy digests so timing does not leak the expected length
        hmac.compare_digest(hashlib.sha256(got).digest(), hashlib.sha256(want).digest())
        return False
    return hmac.compare_digest(got, want)
