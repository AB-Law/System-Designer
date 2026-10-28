"""HTTP surface for question research, mounted under /api/interview. Every route needs the `interview.research` flag."""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints

from dc_platform import jobs, search
from deps import CurrentUser
from modules import feature_on
from rate_limit import meter

from .. import roles
from ..schemas import Category
from . import banks, config, ledger, store
from .buckets import Bucket

JOB_KIND = "interview.research"
Question = Annotated[str, StringConstraints(strip_whitespace=True, min_length=8, max_length=300)]


def require_flag() -> None:
    if not feature_on(config.FLAG):
        raise HTTPException(404, "Question research is not enabled.")


router = APIRouter(dependencies=[Depends(require_flag)])


class ResearchIn(BaseModel):
    roleId: int


class NewQuestion(BaseModel):
    question: Question
    category: Category


class BankPatch(BaseModel):
    remove: list[str] = Field(default_factory=list, max_length=banks.MAX_ITEMS)
    edit: dict[str, Question] = Field(default_factory=dict)
    add: list[NewQuestion] = Field(default_factory=list, max_length=20)


@router.post("/research")
def start_research(body: ResearchIn, user: CurrentUser) -> dict[str, Any]:
    """Queue a search for the role's questions. A run counts against the user's monthly share only when it will actually search."""
    uid = user["id"]
    meter(f"interview_research|{uid}", limit=20)
    role = roles.get_row(uid, body.roleId)
    chain = search.get_chain(ledger.DbLedger())
    searchable = chain.configured()
    if chain.available() and store.gap(uid, Bucket.of(role)):
        ledger.consume_run(uid)  # reading what is already stored is free; only a run that goes to a provider counts
    bank_id = banks.start(uid, body.roleId)
    job_id = jobs.enqueue(uid, JOB_KIND, {"role_id": body.roleId})
    banks.set_job(uid, bank_id, job_id)
    return {"bankId": bank_id, "jobId": job_id, "searchConfigured": searchable}


@router.get("/banks")
def list_banks(user: CurrentUser, role_id: int | None = None) -> list[dict[str, Any]]:
    return banks.list_banks(user["id"], role_id)


@router.get("/banks/{bank_id:int}")
def get_bank(bank_id: int, user: CurrentUser) -> dict[str, Any]:
    return banks.public(banks.get_row(user["id"], bank_id))


@router.patch("/banks/{bank_id:int}")
def patch_bank(bank_id: int, body: BankPatch, user: CurrentUser) -> dict[str, Any]:
    return banks.patch(
        user["id"], bank_id, remove=body.remove, edit=body.edit, add=[(a.question, a.category) for a in body.add],
    )


@router.post("/research/items/{item_id:int}/flag")
def flag_item(item_id: int, user: CurrentUser) -> dict[str, bool]:
    """Hide a question for everyone until it is reviewed (a wrong, off-topic or unsafe item)."""
    meter(f"interview_flag|{user['id']}", limit=60)
    store.flag(user["id"], item_id)
    return {"ok": True}
