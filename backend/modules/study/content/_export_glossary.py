"""One-shot helper: export app/src/roadmap/glossary.ts → glossary.json next to this file."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SRC = ROOT / "app" / "src" / "roadmap" / "glossary.ts"
OUT = Path(__file__).with_name("glossary.json")

# Matches term + plain when plain is a normal or escaped double-quoted string on following lines.
BLOCK = re.compile(
    r'term:\s*"(?P<term>[^"]+)"\s*,\s*plain:\s*"(?P<plain>(?:[^"\\]|\\.)*)"',
    re.S,
)


def main() -> None:
    text = SRC.read_text(encoding="utf-8")
    entries = []
    for m in BLOCK.finditer(text):
        plain = m.group("plain").replace("\\n", " ").replace('\\"', '"')
        plain = re.sub(r"\s+", " ", plain).strip()
        entries.append({"term": m.group("term"), "plain": plain})
    if len(entries) < 10:
        raise SystemExit(f"expected many glossary entries, got {len(entries)}")
    OUT.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(entries)} entries to {OUT}")


if __name__ == "__main__":
    main()
