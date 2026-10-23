"""
Flags problem text that shares long word sequences with a reference file.

    python tools/copycheck.py <reference.json> [problems_dir] [--n 6]

Reference is any JSON; every string in it is read. Each problem file in the folder is
checked: any run of N consecutive words (default 6) that also appears in the reference
is reported. Exit code 1 if anything is found, so it can gate a commit or CI.
"""
import json
import re
import sys
from pathlib import Path


def strings(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, dict):
        for v in x.values():
            yield from strings(v)
    elif isinstance(x, list):
        for v in x:
            yield from strings(v)


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def grams(text: str, n: int):
    w = words(text)
    return {" ".join(w[i : i + n]) for i in range(len(w) - n + 1)}


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    n = int(sys.argv[sys.argv.index("--n") + 1]) if "--n" in sys.argv else 6
    if "--n" in sys.argv:
        args.remove(sys.argv[sys.argv.index("--n") + 1])
    if not args:
        print(__doc__)
        return 2
    ref = json.loads(Path(args[0]).read_text(encoding="utf-8"))
    ref_grams: set[str] = set()
    for s in strings(ref):
        ref_grams |= grams(s, n)
    folder = Path(args[1]) if len(args) > 1 else Path(__file__).resolve().parent.parent / "app" / "src" / "problems"

    bad = 0
    for f in sorted(folder.glob("*.json")):
        hits = []
        for s in strings(json.loads(f.read_text(encoding="utf-8"))):
            for g in grams(s, n) & ref_grams:
                hits.append(g)
        if hits:
            bad += 1
            print(f"{f.name}: {len(hits)} shared {n}-word runs, e.g.")
            for g in sorted(hits)[:5]:
                print(f"   '{g}'")
        else:
            print(f"{f.name}: ok")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
