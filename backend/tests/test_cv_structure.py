from __future__ import annotations

from datetime import date

from modules.cv import dates, experience, rules_parser, skills, structure
from modules.cv.structure import CVStructure, Role
from tests.cv_fixtures import CV_TEXT

TODAY = date(2026, 1, 1)


def test_rules_parser_recovers_sections() -> None:
    cv = rules_parser.parse_rules(CV_TEXT)
    assert cv.name == "Jane Doe" and cv.email == "jane@example.com"
    assert [r.employer for r in cv.experience] == ["Acme Pay", "Beta Data"]
    assert cv.experience[0].start == "2019-01" and cv.experience[0].end == "present"
    assert len(cv.experience[0].bullets) == 3
    assert "Python" in cv.skills and "k8s" in cv.skills
    assert cv.education and "State University" in cv.education[0].school + cv.education[0].degree


def test_normalise_dates() -> None:
    assert dates.norm_date("Jan 2021") == "2021-01"
    assert dates.norm_date("2019") == "2019"
    assert dates.norm_date("Current") == "present"


def test_total_years_do_not_double_count_overlap() -> None:
    cv = CVStructure(experience=[
        Role(title="A", start="2020-01", end="2022-01"),
        Role(title="B", start="2021-01", end="2023-01"),  # overlaps A by a year
    ])
    assert experience.total_years(cv, TODAY) == 3.0


def test_present_uses_today() -> None:
    cv = CVStructure(experience=[Role(start="2024-01", end="present")])
    assert experience.total_years(cv, TODAY) == 2.0


def test_years_per_skill_from_role_dates() -> None:
    cv = CVStructure(experience=[
        Role(title="Dev", start="2018-01", end="2020-01", bullets=["Built services in k8s and Postgres"]),
        Role(title="Dev", start="2020-01", end="2023-01", bullets=["Ran Kubernetes clusters"]),
    ])
    y = experience.years_per_skill(cv, TODAY)
    assert y["Kubernetes"] == 5.0 and y["PostgreSQL"] == 2.0


def test_bad_dates_are_ignored_not_fatal() -> None:
    cv = CVStructure(experience=[Role(start="sometime", end="later"), Role(start="2022", end="2023")])
    assert experience.total_years(cv, TODAY) == 1.9  # year-only dates run from January to December


def test_level_from_title_and_years() -> None:
    senior = CVStructure(experience=[Role(title="Senior Engineer", start="2023", end="2024")])
    assert experience.cv_level(senior, TODAY) == 3
    veteran = CVStructure(experience=[Role(title="Developer", start="2010", end="present")])
    assert experience.cv_level(veteran, TODAY) >= 4


def test_bullet_refs_roundtrip() -> None:
    cv = rules_parser.parse_rules(CV_TEXT)
    ref = structure.bullet_refs(cv)[1][0]
    assert structure.get_bullet(cv, ref)
    assert structure.set_bullet(cv, ref, "New text") and structure.get_bullet(cv, ref) == "New text"
    assert structure.get_bullet(cv, "exp.99.0") is None and structure.get_bullet(cv, "../../etc") is None


def test_render_text_contains_every_bullet() -> None:
    cv = rules_parser.parse_rules(CV_TEXT)
    out = structure.render_text(cv)
    assert all(b in out for _, b in structure.bullet_refs(cv))


def test_aliases_normalise_spelling() -> None:
    assert skills.mentions("JS and TS") == {"JavaScript", "TypeScript"}
    assert skills.mentions("Ran k8s and postgres in prod") == {"Kubernetes", "PostgreSQL"}
    assert skills.mentions("We go to market fast") == set()  # 'go' the verb is not the language
    assert skills.mentions("C++ and .NET and CI/CD") == {"C++", ".NET", "CI/CD"}


def test_clamp_bounds_sizes() -> None:
    cv = CVStructure(skills=["x"] * 500, experience=[Role(bullets=["y" * 9999] * 99)] * 99)
    structure.clamp(cv)
    assert len(cv.skills) <= structure.MAX_ITEMS and len(cv.experience) <= structure.MAX_ITEMS
    assert len(cv.experience[0].bullets) <= structure.MAX_BULLETS and len(cv.experience[0].bullets[0]) <= structure.MAX_TEXT


def test_numeric_date_formats() -> None:
    assert dates.norm_date("03/2018") == "2018-03" and dates.norm_date("2018-03") == "2018-03"
    cv = rules_parser.parse_rules("Experience\nEngineer | Acme | 03/2018 - 2020-06\n- Built things\nDeveloper, Beta, 2015-2017\n- Wrote code\n")
    assert [(r.start, r.end) for r in cv.experience] == [("2018-03", "2020-06"), ("2015", "2017")]


MESSY_CV = """Jane Doe
Senior Backend Engineer
London, UK | +44 7700 900123
jane@example.com

PROFESSIONAL SUMMARY
Backend engineer who builds payment systems.

WORK HISTORY
Staff Engineer | Acme Pay | 2019 - Present
- Led a migration to microservices

TECHNICAL EXPERIENCE
Engineer, Beta Data, 2016 - 2019
- Built ingestion pipelines

PERSONAL PROJECTS
Ledger tool
- Open source double-entry ledger

EDUCATION & TRAINING
BSc Computer Science - State University, 2012 - 2016

CORE COMPETENCIES
Python, Go, PostgreSQL

CERTIFICATIONS
AWS Solutions Architect
"""


def test_rules_parser_reads_common_heading_variants() -> None:
    cv = rules_parser.parse_rules(MESSY_CV)
    assert cv.headline == "Senior Backend Engineer"  # not the phone line or the location
    assert cv.summary.startswith("Backend engineer")
    assert [r.employer for r in cv.experience] == ["Acme Pay", "Beta Data"]
    assert cv.projects and cv.projects[0].name == "Ledger tool"
    assert cv.skills == ["Python", "Go", "PostgreSQL"]
    assert not any("AWS" in s for s in cv.skills + [p.name for p in cv.projects])  # certifications are ignored


def test_rules_parser_splits_degree_from_school() -> None:
    edu = rules_parser.parse_rules(MESSY_CV).education
    assert len(edu) == 1 and edu[0].degree == "BSc Computer Science" and edu[0].school == "State University"
    assert edu[0].start == "2012" and edu[0].end == "2016"
