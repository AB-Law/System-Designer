from __future__ import annotations

import json
from pathlib import Path

from schema.problems import Problem

ROOT = Path(__file__).resolve().parents[2]
PROBLEMS = ROOT / "app" / "src" / "problems"
SCHEMA_FILE = Path(__file__).resolve().parents[1] / "schema" / "problem.schema.json"


def test_all_shipped_problems_validate() -> None:
    files = sorted(PROBLEMS.glob("*.json"))
    assert files, "no problem files found"
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        p = Problem.model_validate(data)
        assert p.id == f.stem


def test_committed_json_schema_matches_model() -> None:
    expected = Problem.model_json_schema()
    on_disk = json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))
    assert on_disk == expected, "run: python -c \"...\" to refresh schema/problem.schema.json"
