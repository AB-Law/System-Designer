"""CV dates: 'Jan 2021', '03/2018' and '2019' all become YYYY-MM or YYYY; 'present' stays 'present'."""
from __future__ import annotations

import re
from datetime import date

MONTH_PATTERN = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec"
MONTHS = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


def norm_date(raw: str) -> str:
    """'Jan 2021' -> '2021-01', '2019' -> '2019', 'Present' -> 'present'. Unknown stays as given."""
    r = raw.strip().lower().rstrip(".")
    if r in {"present", "current", "now", "today"}:
        return "present"
    m = re.match(r"^([a-z]+)\.?\s+((?:19|20)\d{2})$", r)
    if m and m.group(1)[:3] in MONTHS:
        return f"{m.group(2)}-{MONTHS[m.group(1)[:3]]:02d}"
    m = re.match(r"^(\d{1,2})/((?:19|20)\d{2})$", r)
    if m:
        return f"{m.group(2)}-{int(m.group(1)):02d}"
    m = re.match(r"^((?:19|20)\d{2})(?:-(\d{1,2}))?$", r)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}" if m.group(2) else m.group(1)
    return raw.strip()


def ym(value: str, *, end: bool, today: date) -> tuple[int, int] | None:
    v = value.strip().lower()
    if v in {"present", "current", "now", "today"}:
        return today.year, today.month
    m = re.match(r"^((?:19|20)\d{2})(?:-(\d{1,2}))?$", v)
    if not m:
        return None
    y = int(m.group(1))
    return (y, int(m.group(2))) if m.group(2) else (y, 12 if end else 1)
