"""Run the CV scoring evaluation set against a real model and compare with the expected ranges.

    backend/.venv/Scripts/python backend/eval_cv.py            # fast scores (rules + one model call to read each JD)
    backend/.venv/Scripts/python backend/eval_cv.py --deep     # deep scores (adds the model's evidence judgement)

Uses the provider set in backend/.env (LLM_PROVIDER, OPENAI_API_KEY, ANTHROPIC_API_KEY, LMSTUDIO_URL ...) and a throwaway database.
Compare runs before and after a rubric or model change; update tests/cv_eval/specs.py on purpose when a range should move.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
os.environ.setdefault("DB_PATH", str(Path(tempfile.mkdtemp()) / "eval.sqlite3"))
os.environ.setdefault("MONTHLY_TOKEN_QUOTA", "0")
os.environ.setdefault("LLM_CALLS_PER_10MIN", "100000")

from config import load_env  # noqa: E402

load_env()

from db import connect  # noqa: E402
from dc_platform import llm  # noqa: E402
from modules.cv import rubric, rules_parser, scoring  # noqa: E402
from tests.cv_eval import specs  # noqa: E402


def main() -> int:
    mode = "deep" if "--deep" in sys.argv else "fast"
    connect().close()
    model = llm.get_client().adapter.model
    print(f"rubric {rubric.RUBRIC_VERSION}  mode {mode}  model {model or '(default)'}\n")
    bad = 0
    for case_id, cand, job, (lo, hi), missing in specs.CASES:
        text = specs.cv_text(cand)
        r = scoring.score(rules_parser.parse_rules(text), text, specs.jd_text(job), 0, mode=mode)
        got = {e["text"] for e in r["evidence"] if e["status"] == "missing" and e["kind"] == "must"}
        ok = lo <= r["total"] <= hi and got == set(missing)
        bad += not ok
        note = "" if ok else f"   expected {lo}-{hi}, gaps {sorted(missing)}; got gaps {sorted(got)}"
        print(f"{'ok ' if ok else 'BAD'} {case_id:18} {r['total']:3}  {r['band']:6} ({r['mode']}){note}")
    print(f"\n{len(specs.CASES) - bad}/{len(specs.CASES)} within range")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
