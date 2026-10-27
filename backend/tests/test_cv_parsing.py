from __future__ import annotations

import pytest
from fastapi import HTTPException

from modules.cv import parsing
from tests.cv_fixtures import CV_TEXT, make_docx, make_pdf

LEFT = (30, 40, 180, 800)
RIGHT = (220, 40, 560, 800)


def test_plain_text_roundtrip_keeps_sections() -> None:
    p = parsing.parse_bytes(CV_TEXT.encode(), "cv.txt")
    assert p.kind == "txt" and "Experience" in p.text and p.quality >= 70


def test_docx_text_is_extracted() -> None:
    p = parsing.parse_bytes(make_docx(["Jane Doe", "Experience", "- Built APIs in Python for payments " * 4]), "cv.docx")
    assert p.kind == "docx" and "Built APIs" in p.text


def test_single_column_pdf() -> None:
    pdf = make_pdf([[((50, 50, 540, 300), "Jane Doe\nExperience\nBuilt APIs in Python for payments and scaled them to millions of users.")]])
    p = parsing.parse_bytes(pdf, "cv.pdf")
    assert p.kind == "pdf" and p.pages == 1
    assert p.text.index("Jane Doe") < p.text.index("Built APIs")


def test_two_column_pdf_reads_each_column_in_turn() -> None:
    """The sidebar must not be interleaved with the experience text."""
    side = ["SKILLS", "Python", "Kubernetes", "PostgreSQL", "Docker", "Terraform"]
    main = ["EXPERIENCE", "Acme Pay 2019 to now", "Led a migration to microservices", "Built REST APIs", "Mentored engineers"]
    boxes = [((30, 40 + i * 40, 180, 70 + i * 40), t) for i, t in enumerate(side)]
    boxes += [((220, 40 + i * 40, 560, 70 + i * 40), t) for i, t in enumerate(main)]
    text = parsing.parse_bytes(make_pdf([boxes]), "cv.pdf").text
    assert text.index("Terraform") < text.index("EXPERIENCE")  # the whole sidebar comes before the main column


def test_page_numbers_for_citations() -> None:
    pdf = make_pdf([[((50, 50, 540, 100), "Page one text about Python development work")], [((50, 50, 540, 100), "Page two text about Kubernetes operations")]])
    p = parsing.parse_bytes(pdf, "cv.pdf")
    lines = parsing.numbered_lines(p.text)
    by_text = {t: n for n, t in lines}
    assert parsing.page_of_line(p.text, by_text["Page one text about Python development work"]) == 1
    assert parsing.page_of_line(p.text, by_text["Page two text about Kubernetes operations"]) == 2


def test_blank_pdf_is_flagged_as_scanned() -> None:
    p = parsing.parse_bytes(make_pdf([[]]), "scan.pdf")
    assert p.quality <= 10 and any("scanned" in w for w in p.warnings)


def test_garbled_text_scores_low() -> None:
    garbage = "\n".join("a b c d e f g h i j k l m n o p q r s" for _ in range(30))
    q, warnings = parsing.score_text(garbage, 1)
    assert q < 60 and warnings


def test_fake_pdf_is_rejected() -> None:
    with pytest.raises(HTTPException) as e:
        parsing.parse_bytes(b"not really a pdf", "cv.pdf")
    assert e.value.status_code == 400


def test_wrapped_lines_are_rejoined() -> None:
    out = parsing.clean("Built a service that handles a very large number of\nrequests per second\n- Next bullet")
    assert "number of requests per second" in out and "- Next bullet" in out
    short = parsing.clean("Senior Backend Engineer\njane@example.com | github.com/jane")
    assert short.count("\n") == 1  # short header lines are not joined


def test_page_of_line_without_breaks_is_none() -> None:
    assert parsing.page_of_line("a\nb", 2) is None
