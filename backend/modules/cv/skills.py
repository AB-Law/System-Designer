"""Skill normalisation: one canonical name per skill, so matching does not depend on spelling."""
from __future__ import annotations

import re

# canonical -> aliases (all lower case). Extend freely; canonical names are shown to the user.
ALIASES: dict[str, list[str]] = {
    "Kubernetes": ["k8s", "kube"],
    "JavaScript": ["js", "ecmascript", "es6"],
    "TypeScript": ["ts"],
    "PostgreSQL": ["postgres", "psql", "postgresql"],
    "MongoDB": ["mongo"],
    "MySQL": ["my sql"],
    "Node.js": ["node", "nodejs", "node js"],
    "React": ["reactjs", "react.js"],
    "Vue": ["vuejs", "vue.js"],
    "Angular": ["angularjs"],
    "Next.js": ["nextjs", "next js"],
    "Amazon Web Services": ["aws"],
    "Google Cloud Platform": ["gcp", "google cloud"],
    "Microsoft Azure": ["azure"],
    "Docker": ["containers", "containerization", "containerisation"],
    "CI/CD": ["ci cd", "cicd", "continuous integration", "continuous delivery", "continuous deployment"],
    "Terraform": ["iac", "infrastructure as code"],
    "Machine Learning": ["ml"],
    "Natural Language Processing": ["nlp"],
    "REST": ["restful", "rest api", "rest apis"],
    "GraphQL": ["graph ql"],
    "Python": ["python3"],
    "C#": ["csharp", "c sharp"],
    "C++": ["cpp", "c plus plus"],
    "Golang": ["go lang"],
    "Java": [],
    "Kotlin": [],
    "Swift": [],
    "Rust": [],
    "Ruby": [],
    "PHP": [],
    "SQL": ["structured query language"],
    "Redis": [],
    "Kafka": ["apache kafka"],
    "RabbitMQ": ["rabbit mq"],
    "Elasticsearch": ["elastic search", "elk"],
    "Git": ["github", "gitlab"],
    "Linux": ["unix"],
    "Agile": ["scrum", "kanban"],
    "Microservices": ["micro services", "micro-services"],
    "System Design": ["distributed systems", "systems design", "system architecture"],
    "Unit Testing": ["unit tests", "tdd", "test driven development"],
    "Leadership": ["tech lead", "team lead", "led a team", "mentoring", "mentored"],
    "Prometheus": [],
    "Grafana": [],
    "Spark": ["apache spark", "pyspark"],
    "Airflow": ["apache airflow"],
    "TensorFlow": [],
    "PyTorch": [],
    "FastAPI": ["fast api"],
    "Django": [],
    "Flask": [],
    "Spring Boot": ["springboot"],
    ".NET": ["dotnet", "dot net", "asp.net"],
}

_TO_CANON: dict[str, str] = {}
for _canon, _alts in ALIASES.items():
    _TO_CANON[_canon.lower()] = _canon
    for _a in _alts:
        _TO_CANON[_a] = _canon


def _word_pattern(term: str) -> re.Pattern[str]:
    # \b fails around symbols such as c++ and .net, so use explicit non-word look-arounds
    return re.compile(r"(?<![A-Za-z0-9+#.])" + re.escape(term) + r"(?![A-Za-z0-9+#]|\.[A-Za-z0-9])", re.I)


_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (_word_pattern(t), c) for t, c in sorted(_TO_CANON.items(), key=lambda kv: -len(kv[0]))
]


# Knowing the specific tool shows the general skill. Applied to CV text only, never to what a JD asks for.
IMPLIES: dict[str, list[str]] = {
    "PostgreSQL": ["SQL"], "MySQL": ["SQL"],
    "FastAPI": ["Python"], "Django": ["Python"], "Flask": ["Python"],
    "TypeScript": ["JavaScript"], "React": ["JavaScript"], "Vue": ["JavaScript"], "Angular": ["JavaScript"], "Node.js": ["JavaScript"],
    "Next.js": ["React"], "Spring Boot": ["Java"],
}


def mentions(text: str, implied: bool = False) -> set[str]:
    """Canonical skills mentioned anywhere in `text`. With implied=True, a tool also counts as the skill it belongs to."""
    found: set[str] = set()
    for pat, canon in _PATTERNS:
        if canon not in found and pat.search(text):
            found.add(canon)
    if implied:
        for s in list(found):
            found.update(IMPLIES.get(s, []))
        if "React" in found:
            found.add("JavaScript")
    return found


_STOP = set(
    "a an and are as at be by for from has have in is it of on or the to with using use used experience experienced strong "
    "good solid proven working knowledge understanding ability skills skill years year plus etc including such as well".split()
)


def tokens(text: str) -> set[str]:
    """Lower-case content words with light stemming, used for free-text requirement matching."""
    out: set[str] = set()
    for w in re.findall(r"[a-z0-9+#.]+", text.lower()):
        w = w.strip(".")
        if not w or w in _STOP or len(w) < 2:
            continue
        for suf in ("ing", "ed", "es", "s"):
            if len(w) > len(suf) + 3 and w.endswith(suf):
                w = w[: -len(suf)]
                break
        out.add(w)
    return out
