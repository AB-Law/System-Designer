"""Text extraction for CV and JD files (PDF, DOCX, TXT) with a quality score.

PyMuPDF is the primary PDF parser; pdfplumber is the fallback when PyMuPDF is missing or its text scores badly.
Pages are separated by a form feed so later stages can cite page numbers.
"""
from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass, field

from fastapi import HTTPException

PAGE_BREAK = "\f"
HEADINGS = (
    "summary|profile|objective|experience|work experience|professional experience|employment|education|skills|technical skills|"
    "projects|certifications|publications|awards|languages|interests|references"
)
_HEADING_RE = re.compile(rf"^\s*({HEADINGS})\s*:?\s*$", re.I)
_BULLET_RE = re.compile(r"^\s*([-*•▪●◦‣·]|\d+[.)])\s+")


@dataclass
class Parsed:
    text: str
    quality: int
    warnings: list[str] = field(default_factory=list)
    pages: int = 1
    kind: str = "txt"


def detect_kind(data: bytes, name: str) -> str:
    if data[:5] == b"%PDF-":
        return "pdf"
    if data[:2] == b"PK" and zipfile.is_zipfile(io.BytesIO(data)):
        return "docx"
    if name.lower().endswith((".pdf", ".docx")):
        raise HTTPException(400, "That file looks damaged or is not a real PDF or DOCX.")
    return "txt"


Block = tuple[float, float, float, float, str]  # x0, y0, x1, y1, text


def _gutter(narrow: list[Block], width: float) -> float | None:
    """The x of a vertical gutter that no narrow block crosses, with at least two blocks on each side."""
    if len(narrow) < 4:
        return None
    free = [
        x
        for x in range(int(0.2 * width), int(0.8 * width), 4)
        if not any(b[0] < x < b[2] for b in narrow)
        and sum(b[2] <= x for b in narrow) >= 2
        and sum(b[0] >= x for b in narrow) >= 2
    ]
    if not free:
        return None
    # the middle of the longest unbroken run of free x positions
    runs: list[list[int]] = [[free[0]]]
    for x in free[1:]:
        runs[-1].append(x) if x - runs[-1][-1] <= 4 else runs.append([x])
    longest = max(runs, key=len)
    return (longest[0] + longest[-1]) / 2


def _order_blocks(blocks: list[Block], width: float) -> str:
    """Reading order for one page: full-width blocks in place, and between them the left column, then the right."""
    blocks = [b for b in blocks if b[4].strip()]
    wide = sorted((b for b in blocks if (b[2] - b[0]) > 0.62 * width), key=lambda b: b[1])
    narrow = [b for b in blocks if b not in wide]
    split = _gutter(narrow, width)
    if split is None:
        return "\n".join(b[4].strip() for b in sorted(blocks, key=lambda b: (round(b[1]), b[0])))
    bounds = [-1.0, *(b[1] for b in wide), 1e9]
    parts: list[str] = []
    for i, (lo, hi) in enumerate(zip(bounds, bounds[1:])):
        band = [b for b in narrow if lo <= b[1] < hi]
        for column in ([b for b in band if b[2] <= split], [b for b in band if b[2] > split]):
            parts += [b[4].strip() for b in sorted(column, key=lambda b: b[1])]
        if i < len(wide):
            parts.append(wide[i][4].strip())
    return "\n".join(parts)


def _pdf_pymupdf(data: bytes) -> tuple[str, int]:
    import pymupdf

    pages: list[str] = []
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        if doc.needs_pass:
            raise HTTPException(400, "That PDF is password protected.")
        for page in doc:
            raw = page.get_text("blocks")
            blocks = [(b[0], b[1], b[2], b[3], b[4]) for b in raw if len(b) > 6 and b[6] == 0]
            pages.append(_order_blocks(blocks, page.rect.width))
        return PAGE_BREAK.join(pages), len(pages)


def _pdf_pdfplumber(data: bytes) -> tuple[str, int]:
    import pdfplumber

    with pdfplumber.open(io.BytesIO(data)) as pdf:
        pages = [(p.extract_text(layout=False) or "") for p in pdf.pages]
    return PAGE_BREAK.join(pages), len(pages)


def _docx(data: bytes) -> str:
    import docx

    try:
        d = docx.Document(io.BytesIO(data))
    except Exception as e:
        raise HTTPException(400, "That DOCX file could not be read.") from e
    lines = [p.text for p in d.paragraphs]
    for t in d.tables:
        for row in t.rows:
            cells = []
            for c in row.cells:
                if c.text.strip() and c.text.strip() not in cells:
                    cells.append(c.text.strip())
            if cells:
                lines.append("  ".join(cells))
    return "\n".join(lines)


def clean(text: str) -> str:
    """Normalise whitespace, rejoin wrapped lines, and put a blank line before each section heading."""
    out: list[str] = []
    for page in text.replace("\r\n", "\n").replace("\r", "\n").split(PAGE_BREAK):
        lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in page.split("\n")]
        merged: list[str] = []
        for ln in lines:
            if (
                merged
                and ln
                and len(merged[-1]) >= 45  # wrapped lines run to the edge of the column; short lines are headers or contact details
                and not _HEADING_RE.match(ln)
                and not _HEADING_RE.match(merged[-1])
                and not _BULLET_RE.match(ln)
                and ln[0].islower()
                and merged[-1][-1] not in ".:;!?"
            ):
                merged[-1] += " " + ln
            else:
                merged.append(ln)
        spaced: list[str] = []
        for ln in merged:
            if _HEADING_RE.match(ln) and spaced and spaced[-1]:
                spaced.append("")
            spaced.append(ln)
        out.append(re.sub(r"\n{3,}", "\n\n", "\n".join(spaced)).strip("\n"))
    return ("\n" + PAGE_BREAK + "\n").join(out)


def score_text(text: str, pages: int) -> tuple[int, list[str]]:
    """0-100 parse quality, plus plain-language warnings."""
    body = text.replace(PAGE_BREAK, "\n")
    chars = len(body.strip())
    if chars < 40 * max(pages, 1):
        return min(10, chars // 5), ["Almost no text was found. This looks like a scanned or image-only file; upload a text-based PDF or DOCX."]
    words = re.findall(r"[A-Za-z][A-Za-z'-]*", body)
    letters = sum(c.isalpha() for c in body)
    odd = sum(c == "�" or (ord(c) < 32 and c not in "\n\t") for c in body)
    split_words = bool(words) and (
        sum(map(len, words)) / len(words) < 3.0 or sum(len(w) == 1 and w.lower() not in "ai" for w in words) / len(words) > 0.25
    )
    lines = sum(bool(ln.strip()) for ln in body.split("\n"))
    problems = [  # (what is wrong, points off, what to tell the user)
        (chars < 600, 25, "Very little text was extracted; check that nothing is missing."),
        (letters / chars < 0.55, 25, "Much of the text is symbols or digits, which can mean the layout was garbled."),
        (odd / chars > 0.01, 25, "Unreadable characters were found."),
        (split_words, 30, "Words look split into single letters, so columns or fonts may have been read badly."),
        (lines < 8 and chars > 1500, 15, "Line breaks were lost; the structure may be hard to recover."),
    ]
    found = [(points, message) for wrong, points, message in problems if wrong]
    return max(0, 100 - sum(p for p, _ in found)), [m for _, m in found]


def _read_pdf(data: bytes) -> tuple[str, int, int, list[str]]:
    """(text, pages, quality, warnings) from PyMuPDF, or from pdfplumber when PyMuPDF fails or reads it badly."""
    best: tuple[str, int, int, list[str]] | None = None
    for extract in (_pdf_pymupdf, _pdf_pdfplumber):
        try:
            text, pages = extract(data)
        except HTTPException:
            raise
        except Exception:  # a missing library or a file this parser cannot open: try the next one
            continue
        text = clean(text)
        quality, warnings = score_text(text, pages)
        if best is None or quality > best[2]:
            best = (text, pages, quality, warnings)
        if quality >= 40:
            break
    if best is None:
        raise HTTPException(400, "That PDF could not be read.")
    return best


def _decode(data: bytes) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("latin-1")


def parse_bytes(data: bytes, name: str) -> Parsed:
    kind = detect_kind(data, name)
    if kind == "pdf":
        text, pages, quality, warnings = _read_pdf(data)
        return Parsed(text, quality, warnings, pages, kind)
    text = clean(_docx(data) if kind == "docx" else _decode(data))
    quality, warnings = score_text(text, 1)
    return Parsed(text, quality, warnings, 1, kind)


def page_of_line(text: str, line_no: int) -> int | None:
    """1-based page of a 1-based line number, or None when the text has no page breaks."""
    if PAGE_BREAK not in text:
        return None
    lines = text.split("\n")
    return 1 + sum(ln.count(PAGE_BREAK) for ln in lines[: max(0, line_no - 1)])


def numbered_lines(text: str) -> list[tuple[int, str]]:
    """(1-based line number, text) for non-empty lines; the page break character is stripped."""
    return [(i + 1, ln.replace(PAGE_BREAK, "").strip()) for i, ln in enumerate(text.split("\n")) if ln.replace(PAGE_BREAK, "").strip()]
