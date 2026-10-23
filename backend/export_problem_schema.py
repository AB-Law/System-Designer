"""Write problem.schema.json from the Pydantic Problem model (backend + root copy for the FE)."""
from __future__ import annotations

import json
from pathlib import Path

from schema.problems import Problem

BACKEND = Path(__file__).resolve().parent
ROOT = BACKEND.parent
OUTS = [
    BACKEND / "schema" / "problem.schema.json",
    ROOT / "schemas" / "problem.schema.json",
]


def main() -> None:
    text = json.dumps(Problem.model_json_schema(), indent=2) + "\n"
    for out in OUTS:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
