"""Load and validate problem JSON files from PROBLEMS_DIR."""
from __future__ import annotations

import json

from pydantic import ValidationError

from config import PROBLEMS_DIR
from schema.problems import Problem


def load_problems() -> tuple[list[dict], dict[str, str]]:
    """Read every *.json in the problems folder. Invalid files are reported, not served."""
    good: list[dict] = []
    errors: dict[str, str] = {}
    for f in sorted(PROBLEMS_DIR.glob("*.json")):
        try:
            p = Problem.model_validate(json.loads(f.read_text(encoding="utf-8")))
            if p.id != f.stem:
                raise ValueError(f"id {p.id!r} does not match file name {f.stem!r}")
            good.append(p.model_dump(mode="json", exclude_none=True))
        except (ValidationError, ValueError, json.JSONDecodeError) as e:
            errors[f.name] = str(e)
    return good, errors
