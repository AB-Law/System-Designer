"""The CV scoring evaluation set: synthetic candidates and job descriptions, and the pairs with the score range each should land in.

Everything here is invented. Dates are fixed (no "present") so the experience maths does not drift with the calendar.
Used by test_cv_eval.py with a recorded fake model, and by eval_cv.py (backend/) with a real model.
When the rubric changes, run both and update the ranges here on purpose, in the same commit as the rubric version bump.
"""
from __future__ import annotations

from typing import Any

Role = tuple[str, str, str, str, list[str]]  # title, employer, start, end, bullets

CANDIDATES: dict[str, dict[str, Any]] = {
    "be_senior": {
        "name": "Sam Backend", "skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "k8s", "AWS", "Redis"],
        "roles": [
            ("Senior Software Engineer", "Northwind", "2018-03", "2025-06", [
                "Led the migration of a monolith to microservices on Kubernetes, cutting deploy time by 70%",
                "Built REST APIs in Python and FastAPI serving 3M requests per day",
                "Designed the PostgreSQL schema and tuned queries, reducing p95 latency by 40%",
                "Mentored five engineers and owned the on-call rotation",
            ]),
            ("Software Engineer", "Contoso", "2014-06", "2018-02", ["Wrote Python services and CI/CD pipelines in Jenkins", "Maintained Redis caches for session data"]),
        ],
    },
    "data_eng": {
        "name": "Dana Data", "skills": ["Python", "SQL", "Spark", "Airflow", "AWS", "PostgreSQL"],
        "roles": [
            ("Data Engineer", "Fabrikam", "2020-01", "2025-06", [
                "Built Airflow pipelines that load 2TB of events per day into the warehouse",
                "Wrote PySpark jobs and optimised SQL, cutting runtimes by 60%",
                "Ran PostgreSQL replicas for analytics",
            ]),
        ],
    },
    "fe_mid": {
        "name": "Fran Frontend", "skills": ["React", "TypeScript", "JavaScript", "CSS", "Jest"],
        "roles": [
            ("Frontend Developer", "Tailspin", "2021-02", "2025-06", [
                "Built a React and TypeScript design system used by 6 product teams",
                "Improved page load time by 35% with code splitting",
                "Wrote unit tests with Jest covering 90% of components",
            ]),
        ],
    },
    "junior": {
        "name": "Jo Junior", "skills": ["Python", "Flask", "Git", "SQL"],
        "roles": [("Junior Developer", "Wingtip", "2024-07", "2025-06", ["Built Flask endpoints for an internal tool", "Wrote SQL reports for the finance team"])],
    },
    "devops": {
        "name": "Dev Ops", "skills": ["Terraform", "Kubernetes", "AWS", "Docker", "Prometheus", "Grafana"],
        "roles": [
            ("Senior DevOps Engineer", "Adventure Works", "2017-01", "2025-06", [
                "Managed 40 Kubernetes clusters across AWS regions with Terraform",
                "Built CI/CD pipelines in GitLab that deploy 200 times a week",
                "Set up Prometheus and Grafana alerting that cut incident response time by 50%",
            ]),
        ],
    },
    "staff": {
        "name": "Sasha Staff", "skills": ["Kafka", "Kubernetes", "Java", "AWS", "Microservices"],
        "roles": [
            ("Staff Engineer", "Litware", "2012-01", "2025-06", [
                "Led a team of 12 engineers building event-driven microservices on Kafka",
                "Designed the system architecture for a platform processing 50M events per day",
                "Mentored senior engineers and set the technical direction for three teams",
                "Ran Kubernetes in production on AWS",
            ]),
        ],
    },
    "empty": {"name": "Pat Blank", "skills": ["Microsoft Office"], "roles": [("Cashier", "Corner Shop", "2023-01", "2025-01", ["Served customers at the till", "Counted the float"])]},
}

JOBS: dict[str, dict[str, Any]] = {
    "be_senior": {
        "title": "Senior Backend Engineer", "level": "senior", "min_years": 5,
        "must": ["Python", "FastAPI", "Kubernetes", "PostgreSQL", "Kafka"], "nice": ["Terraform", "AWS"],
    },
    "data": {"title": "Data Engineer", "level": "mid", "min_years": 3, "must": ["Python", "SQL", "Spark", "Airflow"], "nice": ["Kafka"]},
    "frontend": {"title": "Frontend Developer", "level": "mid", "min_years": 3, "must": ["React", "TypeScript", "GraphQL"], "nice": ["Next.js"]},
    "devops": {"title": "Senior Platform Engineer", "level": "senior", "min_years": 5, "must": ["Terraform", "Kubernetes", "AWS", "CI/CD", "Prometheus"], "nice": ["Grafana"]},
    "junior_be": {"title": "Junior Python Developer", "level": "junior", "min_years": None, "must": ["Python", "SQL", "Git"], "nice": ["Docker"]},
    "staff": {"title": "Staff Engineer", "level": "staff", "min_years": 10, "must": ["System Design", "Microservices", "Kafka", "Kubernetes"], "nice": ["Leadership"]},
}


def cv_text(key: str) -> str:
    c = CANDIDATES[key]
    out = [c["name"], "", "Experience"]
    for title, employer, start, end, bullets in c["roles"]:
        out.append(f"{title} | {employer} | {start} - {end}")
        out += [f"- {b}" for b in bullets]
    out += ["", "Skills", ", ".join(c["skills"])]
    return "\n".join(out) + "\n"


def jd_text(key: str) -> str:
    j = JOBS[key]
    years = f"\nWe are looking for {j['min_years']}+ years of experience." if j["min_years"] else ""
    return f"{j['title']}{years}\n\nRequirements\n" + "\n".join(f"- {m}" for m in j["must"]) + "\n\nNice to have\n" + "\n".join(f"- {n}" for n in j["nice"]) + "\n"


def jd_reply(key: str) -> dict[str, Any]:
    """What a good model returns for the JD: the recorded reply used in place of a real model."""
    j = JOBS[key]
    return {
        "title": j["title"], "level": j["level"], "min_years": j["min_years"], "domain": "",
        "requirements": [{"text": t, "kind": "must"} for t in j["must"]] + [{"text": t, "kind": "nice"} for t in j["nice"]],
        "talking_points": ["Recent projects"], "questions_to_ask": ["What does success look like?"],
    }


# (id, candidate, job, fast-score range, must-have requirements that have to be reported missing; nice-to-have gaps are not checked)
Case = tuple[str, str, str, tuple[int, int], list[str]]
CASES: list[Case] = [
    ("be_vs_be", "be_senior", "be_senior", (70, 95), ["Kafka"]),
    ("be_vs_data", "be_senior", "data", (35, 70), ["Spark", "Airflow"]),
    ("be_vs_frontend", "be_senior", "frontend", (0, 40), ["React", "TypeScript", "GraphQL"]),
    ("be_vs_devops", "be_senior", "devops", (30, 65), ["Terraform", "Prometheus"]),
    ("be_vs_junior", "be_senior", "junior_be", (65, 100), ["Git"]),
    ("be_vs_staff", "be_senior", "staff", (50, 74), ["System Design", "Kafka"]),
    ("data_vs_data", "data_eng", "data", (65, 95), []),
    ("data_vs_be", "data_eng", "be_senior", (20, 55), ["FastAPI", "Kubernetes", "Kafka"]),
    ("data_vs_junior", "data_eng", "junior_be", (60, 100), ["Git"]),
    ("fe_vs_fe", "fe_mid", "frontend", (45, 85), ["GraphQL"]),
    ("fe_vs_be", "fe_mid", "be_senior", (0, 35), ["Python", "FastAPI", "Kubernetes", "PostgreSQL", "Kafka"]),
    ("junior_vs_junior", "junior", "junior_be", (60, 100), []),
    ("junior_vs_be", "junior", "be_senior", (0, 40), ["FastAPI", "Kubernetes", "PostgreSQL", "Kafka"]),
    ("junior_vs_data", "junior", "data", (10, 50), ["Spark", "Airflow"]),
    ("devops_vs_devops", "devops", "devops", (70, 100), []),
    ("devops_vs_be", "devops", "be_senior", (10, 49), ["Python", "FastAPI", "PostgreSQL", "Kafka"]),
    ("staff_vs_staff", "staff", "staff", (65, 100), []),
    ("staff_vs_be", "staff", "be_senior", (15, 49), ["Python", "FastAPI", "PostgreSQL"]),
    ("staff_vs_devops", "staff", "devops", (25, 60), ["Terraform", "CI/CD", "Prometheus"]),
    ("empty_vs_be", "empty", "be_senior", (0, 20), ["Python", "FastAPI", "Kubernetes", "PostgreSQL", "Kafka"]),
    ("empty_vs_junior", "empty", "junior_be", (0, 25), ["Python", "SQL", "Git"]),
]

# pairs where a better-matched candidate must score above a worse one for the same job
ORDER: list[tuple[str, str]] = [
    ("be_vs_be", "data_vs_be"), ("be_vs_be", "fe_vs_be"), ("be_vs_be", "junior_vs_be"), ("be_vs_be", "empty_vs_be"),
    ("data_vs_data", "be_vs_data"), ("data_vs_data", "junior_vs_data"), ("devops_vs_devops", "be_vs_devops"),
    ("staff_vs_staff", "be_vs_staff"), ("fe_vs_fe", "be_vs_frontend"),
]
