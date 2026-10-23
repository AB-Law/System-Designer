"""Problem file schema — authoritative validator for app/src/problems/*.json."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class Traffic(BaseModel):
    users: float = Field(gt=0)
    reqPerUser: float = Field(gt=0)
    writeShare: float = Field(ge=0, le=1)


class DataColumn(BaseModel):
    name: str = Field(pattern=r"^[A-Za-z0-9_]+$")
    label: str | None = None
    distinct: float = Field(gt=0)
    pk: bool = False
    monotonic: bool = False


class DataTable(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_\-]+$")
    label: str
    rows: float = Field(gt=0)
    columns: list[DataColumn] = Field(min_length=1)


class DataQuery(BaseModel):
    id: str
    label: str
    capability: str
    table: str
    op: Literal["read", "write"]
    where: list[str] = Field(default_factory=list)
    orderBy: list[str] = Field(default_factory=list)
    page: float | None = Field(default=None, gt=0)
    depth: float | None = Field(default=None, ge=0)
    joins: int | None = Field(default=None, ge=0, le=4)
    matches: float | None = Field(default=None, gt=0)
    perRequest: float | None = Field(default=None, gt=0)


class DataModel(BaseModel):
    tables: list[DataTable] = Field(min_length=1)
    queries: list[DataQuery] = Field(min_length=1)

    @model_validator(mode="after")
    def consistent(self) -> DataModel:
        tables = {t.id: {c.name for c in t.columns} for t in self.tables}
        for q in self.queries:
            if q.table not in tables:
                raise ValueError(f"query {q.id} uses unknown table {q.table!r}")
            for col in [*q.where, *q.orderBy]:
                if col not in tables[q.table]:
                    raise ValueError(f"query {q.id} uses unknown column {q.table}.{col}")
        return self


class Capability(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_\-]+$")
    label: str
    hint: str | None = None
    mode: Literal["request", "background"] = "request"
    share: float = Field(ge=0, le=1)
    work: float = Field(gt=0)
    critical: bool
    jobsPerSec: float | None = Field(default=None, gt=0)
    needs: list[str] = Field(default_factory=list)
    uses: list[str] = Field(default_factory=list)
    writes: float | None = Field(default=None, ge=0, le=1)
    requires: list[Literal["exclusive_access", "idempotent", "ordered_delivery", "replay", "transactions", "unique_ids"]] = Field(default_factory=list)

    @model_validator(mode="after")
    def background_needs_rate(self) -> Capability:
        if self.mode == "background" and not self.jobsPerSec:
            raise ValueError("a background capability needs jobsPerSec")
        if self.mode == "request" and self.share <= 0:
            raise ValueError("a request capability needs a share above 0")
        return self


class Failure(BaseModel):
    target: dict[str, Any]
    mode: Literal["down", "slow"]
    factor: float | None = None


class Reference(BaseModel):
    summary: str
    design: list[str]
    tradeoffs: list[str]


class Scenario(BaseModel):
    id: str
    title: str
    description: str
    trafficMultiplier: float = Field(gt=0)
    failure: Failure | None = None
    capabilityLoad: dict[str, float] | None = None
    regionMix: dict[str, float] | None = None
    debrief: str | None = None
    interviewQuestion: str

    @model_validator(mode="after")
    def mix_is_sane(self) -> Scenario:
        if self.regionMix is not None:
            if not set(self.regionMix) <= {"us", "eu", "ap"}:
                raise ValueError("regionMix may only use us, eu and ap")
            if any(v < 0 for v in self.regionMix.values()) or abs(sum(self.regionMix.values()) - 1) > 0.01:
                raise ValueError("regionMix shares must be positive and add up to 1")
        return self


class Requirement(BaseModel):
    id: str
    text: str
    check: dict[str, Any]

    @model_validator(mode="after")
    def known_check(self) -> Requirement:
        t = self.check.get("type")
        if t not in {"scenario", "has", "asyncEdge", "noSaturation", "budget", "hosted", "isolated", "scenarioPass", "queryPlans", "ai"}:
            raise ValueError(f"unknown check type {t!r}")
        return self


class Problem(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_\-]+$")
    title: str
    difficulty: Literal["easy", "medium", "hard"]
    brief: str
    constraints: list[str]
    traffic: Traffic
    latencyTargetMs: float = Field(gt=0)
    budget: float | None = Field(default=None, gt=0)
    cacheHitCap: float | None = Field(default=None, gt=0, le=1)
    reference: Reference | None = None
    capabilities: list[Capability] = Field(default_factory=list)
    dataModel: DataModel | None = None
    regions: dict[str, str] | None = None
    scenarios: list[Scenario] = Field(min_length=1)
    requirements: list[Requirement]
    rubric: list[str]

    @model_validator(mode="after")
    def refs(self) -> Problem:
        ids = [s.id for s in self.scenarios]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate scenario ids")
        cap_ids = {c.id for c in self.capabilities}
        if len(cap_ids) != len(self.capabilities):
            raise ValueError("duplicate capability ids")
        for s in self.scenarios:
            for cid in s.capabilityLoad or {}:
                if cid not in cap_ids:
                    raise ValueError(f"scenario {s.id} scales unknown capability {cid!r}")
            cap = s.failure.target.get("capability") if s.failure else None
            if cap and cap not in cap_ids:
                raise ValueError(f"scenario {s.id} targets unknown capability {cap!r}")
        for r in self.requirements:
            c = r.check
            if c.get("type") in {"hosted", "isolated"} and c.get("capability") not in cap_ids:
                raise ValueError(f"requirement {r.id} references unknown capability {c.get('capability')!r}")
            if c.get("type") in {"scenario", "noSaturation", "scenarioPass"} and c.get("scenario") not in ids:
                raise ValueError(f"requirement {r.id} references unknown scenario {c.get('scenario')!r}")
        return self
