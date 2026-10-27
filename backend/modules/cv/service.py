"""Database access for the CV module. Every query is filtered by user_id; a row that is not yours is a 404."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from db import open_db
from dc_platform import files
from dc_platform.rows import now
from dc_platform.rows import owned as _owned

from .experience import total_years
from .structure import CVStructure, render_text


def sha(*parts: str) -> str:
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def _version(row: Any, *, full: bool = True) -> dict[str, Any]:
    v: dict[str, Any] = {
        "id": row["id"], "cvId": row["cv_id"], "fileId": row["file_id"], "parseQuality": row["parse_quality"],
        "warnings": json.loads(row["warnings_json"]), "structureSource": row["structure_source"],
        "edited": bool(row["edited"]), "created": row["created"],
    }
    if full:
        structure = structure_of(row)
        v["rawText"] = row["raw_text"]
        v["structure"] = structure.model_dump()
        v["totalYears"] = total_years(structure)
    return v


# ---------------------------------------------------------------- CVs and versions

def list_cvs(user_id: int) -> list[dict[str, Any]]:
    with open_db() as db:
        cvs = db.execute("SELECT * FROM cv_cvs WHERE user_id=? ORDER BY active DESC, created DESC", (user_id,)).fetchall()
        out = []
        for c in cvs:
            n = db.execute("SELECT COUNT(*) FROM cv_versions WHERE cv_id=? AND user_id=?", (c["id"], user_id)).fetchone()[0]
            latest = db.execute("SELECT * FROM cv_versions WHERE cv_id=? AND user_id=? ORDER BY id DESC LIMIT 1", (c["id"], user_id)).fetchone()
            out.append({"id": c["id"], "name": c["name"], "active": bool(c["active"]), "created": c["created"], "versionCount": n, "latest": _version(latest, full=False) if latest else None})
    return out


def structure_of(version: Any) -> CVStructure:
    return CVStructure.model_validate_json(version["structured_json"] or "{}")


def corpus_of(version: Any) -> str:
    """The text citations point into: the original text, or a re-render once the structure has been edited."""
    return render_text(structure_of(version)) if version["edited"] else version["raw_text"]


def get_cv_row(user_id: int, cv_id: int) -> Any:
    return _owned("SELECT * FROM cv_cvs WHERE id=? AND user_id=?", (cv_id, user_id), "CV")


def latest_version_row(user_id: int, cv_id: int) -> Any:
    get_cv_row(user_id, cv_id)
    return _owned("SELECT * FROM cv_versions WHERE cv_id=? AND user_id=? ORDER BY id DESC LIMIT 1", (cv_id, user_id), "CV")


def version_row(user_id: int, version_id: int) -> Any:
    return _owned("SELECT * FROM cv_versions WHERE id=? AND user_id=?", (version_id, user_id), "CV version")


def get_cv(user_id: int, cv_id: int) -> dict[str, Any]:
    c = get_cv_row(user_id, cv_id)
    with open_db() as db:
        versions = db.execute("SELECT * FROM cv_versions WHERE cv_id=? AND user_id=? ORDER BY id DESC", (cv_id, user_id)).fetchall()
    return {
        "id": c["id"], "name": c["name"], "active": bool(c["active"]), "created": c["created"],
        "latest": _version(versions[0]) if versions else None,
        "versions": [_version(v, full=False) for v in versions],
    }


def active_cv(user_id: int) -> dict[str, Any] | None:
    """The active CV with its latest version. Other modules call this, not the route."""
    with open_db() as db:
        row = db.execute("SELECT id FROM cv_cvs WHERE user_id=? AND active=1 ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
    return get_cv(user_id, row["id"]) if row else None


def create_cv(
    user_id: int, name: str, *, file_id: int | None, raw_text: str, quality: int, warnings: list[str], structure: CVStructure, source: str,
) -> tuple[int, int]:
    with open_db() as db, db:
        first = db.execute("SELECT COUNT(*) FROM cv_cvs WHERE user_id=?", (user_id,)).fetchone()[0] == 0
        cur = db.execute("INSERT INTO cv_cvs(user_id, name, active, created) VALUES (?,?,?,?)", (user_id, name[:120], int(first), now()))
        cv_id = int(cur.lastrowid or 0)
    return cv_id, add_version(user_id, cv_id, file_id=file_id, raw_text=raw_text, quality=quality, warnings=warnings, structure=structure, source=source, edited=False)


def add_version(
    user_id: int, cv_id: int, *, file_id: int | None, raw_text: str, quality: int, warnings: list[str], structure: CVStructure, source: str, edited: bool,
) -> int:
    get_cv_row(user_id, cv_id)
    with open_db() as db, db:
        cur = db.execute(
            "INSERT INTO cv_versions(cv_id, user_id, file_id, raw_text, parse_quality, warnings_json, structured_json, structure_source, edited, created) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (cv_id, user_id, file_id, raw_text, quality, json.dumps(warnings), structure.model_dump_json(), source, int(edited), now()),
        )
        return int(cur.lastrowid or 0)


def rename_cv(user_id: int, cv_id: int, name: str) -> None:
    get_cv_row(user_id, cv_id)
    with open_db() as db, db:
        db.execute("UPDATE cv_cvs SET name=? WHERE id=? AND user_id=?", (name.strip()[:120] or "CV", cv_id, user_id))


def activate(user_id: int, cv_id: int) -> None:
    get_cv_row(user_id, cv_id)
    with open_db() as db, db:
        db.execute("UPDATE cv_cvs SET active=0 WHERE user_id=?", (user_id,))
        db.execute("UPDATE cv_cvs SET active=1 WHERE id=? AND user_id=?", (cv_id, user_id))


def update_extracted(user_id: int, version_id: int, structure: CVStructure, source: str) -> bool:
    """Store a model extraction, unless the user has edited the structure in the meantime."""
    with open_db() as db, db:
        cur = db.execute(
            "UPDATE cv_versions SET structured_json=?, structure_source=? WHERE id=? AND user_id=? AND edited=0",
            (structure.model_dump_json(), source, version_id, user_id),
        )
        return cur.rowcount > 0


def delete_cv(user_id: int, cv_id: int) -> None:
    get_cv_row(user_id, cv_id)
    with open_db() as db, db:
        vids = [r["id"] for r in db.execute("SELECT id FROM cv_versions WHERE cv_id=? AND user_id=?", (cv_id, user_id))]
        fids = [r["file_id"] for r in db.execute("SELECT file_id FROM cv_versions WHERE cv_id=? AND user_id=? AND file_id IS NOT NULL", (cv_id, user_id))]
        for vid in vids:
            _delete_runs_where(db, user_id, "cv_version_id=?", (vid,))
        db.execute("DELETE FROM cv_versions WHERE cv_id=? AND user_id=?", (cv_id, user_id))
        db.execute("DELETE FROM cv_cvs WHERE id=? AND user_id=?", (cv_id, user_id))
        had_active = db.execute("SELECT COUNT(*) FROM cv_cvs WHERE user_id=? AND active=1", (user_id,)).fetchone()[0]
        if not had_active:
            db.execute("UPDATE cv_cvs SET active=1 WHERE id=(SELECT id FROM cv_cvs WHERE user_id=? ORDER BY created DESC LIMIT 1)", (user_id,))
    for fid in set(fids):
        files.delete_file(user_id, fid)


# ---------------------------------------------------------------- score runs

def _delete_runs_where(db: Any, user_id: int, clause: str, params: tuple[Any, ...]) -> None:
    db.execute(f"DELETE FROM cv_rewrite_proposals WHERE user_id=? AND run_id IN (SELECT id FROM cv_score_runs WHERE user_id=? AND {clause})", (user_id, user_id, *params))
    db.execute(f"DELETE FROM cv_score_runs WHERE user_id=? AND {clause}", (user_id, *params))


def create_run(
    user_id: int, version_id: int, *, jd_text: str, jd_title: str, mode: str, rubric_version: str, model: str, rescored_from: int | None = None,
) -> tuple[int, bool]:
    """(run_id, cached). An identical finished run is returned instead of making a new one."""
    jd_hash = sha(jd_text)
    key = sha(str(version_id), jd_hash, rubric_version, model, mode)
    with open_db() as db, db:
        hit = db.execute(
            "SELECT id FROM cv_score_runs WHERE user_id=? AND cache_key=? AND status IN ('done','queued','running') ORDER BY id DESC LIMIT 1", (user_id, key)
        ).fetchone()
        if hit:
            return int(hit["id"]), True
        cur = db.execute(
            "INSERT INTO cv_score_runs(user_id, cv_version_id, jd_title, jd_text, jd_hash, mode, rubric_version, model, cache_key, status, rescored_from, created) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (user_id, version_id, jd_title[:200], jd_text, jd_hash, mode, rubric_version, model, key, "queued", rescored_from, now()),
        )
        return int(cur.lastrowid or 0), False


def set_run_job(user_id: int, run_id: int, job_id: str) -> None:
    with open_db() as db, db:
        db.execute("UPDATE cv_score_runs SET job_id=? WHERE id=? AND user_id=?", (job_id, run_id, user_id))


def set_run_status(user_id: int, run_id: int, status: str, error: str | None = None) -> None:
    with open_db() as db, db:
        db.execute("UPDATE cv_score_runs SET status=?, error=? WHERE id=? AND user_id=?", (status, error, run_id, user_id))


def save_run_result(user_id: int, run_id: int, result: dict[str, Any], model: str) -> None:
    with open_db() as db, db:
        db.execute(
            "UPDATE cv_score_runs SET status='done', error=NULL, jd_title=COALESCE(NULLIF(jd_title, ''), ?), total=?, band=?, mode=?, model=?, breakdown_json=?, evidence_json=?, analysis_json=?, "
            "stages_json=?, truncated=? WHERE id=? AND user_id=?",
            (
                str(result["analysis"].get("title", ""))[:200], result["total"], result["band"], result["mode"], model, json.dumps(result["breakdown"]), json.dumps(result["evidence"]),
                json.dumps(result["analysis"]), json.dumps(result["stages"]), int(result["truncated"]), run_id, user_id,
            ),
        )


def get_run_row(user_id: int, run_id: int) -> Any:
    return _owned("SELECT * FROM cv_score_runs WHERE id=? AND user_id=?", (run_id, user_id), "Score")


def _run(row: Any, *, full: bool) -> dict[str, Any]:
    r: dict[str, Any] = {
        "id": row["id"], "cvVersionId": row["cv_version_id"], "jdTitle": row["jd_title"], "mode": row["mode"], "rubricVersion": row["rubric_version"],
        "model": row["model"], "status": row["status"], "jobId": row["job_id"], "total": row["total"], "band": row["band"],
        "error": row["error"], "rescoredFrom": row["rescored_from"], "created": row["created"], "truncated": bool(row["truncated"]),
    }
    if full:
        r |= {
            "jdText": row["jd_text"], "breakdown": json.loads(row["breakdown_json"]), "evidence": json.loads(row["evidence_json"]),
            "analysis": json.loads(row["analysis_json"]), "stages": json.loads(row["stages_json"]),
        }
    return r


def get_run(user_id: int, run_id: int) -> dict[str, Any]:
    row = get_run_row(user_id, run_id)
    r = _run(row, full=True)
    with open_db() as db:
        v = db.execute("SELECT cv_id FROM cv_versions WHERE id=? AND user_id=?", (row["cv_version_id"], user_id)).fetchone()
    r["cvId"] = v["cv_id"] if v else None
    r["rewrites"] = list_rewrites(user_id, run_id)
    return r


def list_runs(user_id: int, *, band: str | None = None, cv_id: int | None = None, limit: int = 100) -> list[dict[str, Any]]:
    sql = (
        "SELECT r.*, v.cv_id AS cv_id, c.name AS cv_name FROM cv_score_runs r JOIN cv_versions v ON v.id=r.cv_version_id "
        "JOIN cv_cvs c ON c.id=v.cv_id WHERE r.user_id=?"
    )
    args: list[Any] = [user_id]
    if band:
        sql += " AND r.band=?"
        args.append(band)
    if cv_id:
        sql += " AND v.cv_id=?"
        args.append(cv_id)
    sql += " ORDER BY r.created DESC, r.id DESC LIMIT ?"
    args.append(max(1, min(limit, 200)))
    with open_db() as db:
        rows = db.execute(sql, args).fetchall()
    return [_run(r, full=False) | {"cvId": r["cv_id"], "cvName": r["cv_name"]} for r in rows]


def delete_run(user_id: int, run_id: int) -> None:
    get_run_row(user_id, run_id)
    with open_db() as db, db:
        _delete_runs_where(db, user_id, "id=?", (run_id,))


def prior_analysis(user_id: int, jd_text: str, rubric_version: str) -> dict[str, Any] | None:
    """Requirements already extracted for this exact JD, so the same JD is read the same way against every CV version."""
    with open_db() as db:
        row = db.execute(
            "SELECT analysis_json, stages_json FROM cv_score_runs WHERE user_id=? AND jd_hash=? AND rubric_version=? AND status='done' ORDER BY id DESC LIMIT 1",
            (user_id, sha(jd_text), rubric_version),
        ).fetchone()
    if not row:
        return None
    a = json.loads(row["analysis_json"])
    if not a.get("requirements"):
        return None
    return {"analysis": a, "source": json.loads(row["stages_json"]).get("requirements", {}).get("source", "reused")}


# ---------------------------------------------------------------- rewrites

def _rewrite(r: Any) -> dict[str, Any]:
    return {"id": r["id"], "runId": r["run_id"], "bulletRef": r["bullet_ref"], "original": r["original"], "proposed": r["proposed"], "reason": r["reason"], "status": r["status"]}


def list_rewrites(user_id: int, run_id: int) -> list[dict[str, Any]]:
    with open_db() as db:
        rows = db.execute("SELECT * FROM cv_rewrite_proposals WHERE user_id=? AND run_id=? ORDER BY id", (user_id, run_id)).fetchall()
    return [_rewrite(r) for r in rows]


def get_rewrite(user_id: int, rewrite_id: int) -> dict[str, Any]:
    return _rewrite(_owned("SELECT * FROM cv_rewrite_proposals WHERE id=? AND user_id=?", (rewrite_id, user_id), "Suggestion"))


def replace_rewrites(user_id: int, run_id: int, items: list[dict[str, str]]) -> list[dict[str, Any]]:
    with open_db() as db, db:
        db.execute("DELETE FROM cv_rewrite_proposals WHERE user_id=? AND run_id=? AND status='pending'", (user_id, run_id))
        for it in items:
            db.execute(
                "INSERT INTO cv_rewrite_proposals(run_id, user_id, bullet_ref, original, proposed, reason, status, created) VALUES (?,?,?,?,?,?,'pending',?)",
                (run_id, user_id, it["bullet_ref"], it["original"], it["proposed"], it["reason"], now()),
            )
    return list_rewrites(user_id, run_id)


def update_rewrite(user_id: int, rewrite_id: int, *, status: str | None, proposed: str | None) -> dict[str, Any]:
    get_rewrite(user_id, rewrite_id)
    with open_db() as db, db:
        if status:
            db.execute("UPDATE cv_rewrite_proposals SET status=? WHERE id=? AND user_id=?", (status, rewrite_id, user_id))
        if proposed is not None:
            db.execute("UPDATE cv_rewrite_proposals SET proposed=? WHERE id=? AND user_id=?", (proposed[:1500], rewrite_id, user_id))
    return get_rewrite(user_id, rewrite_id)


def mark_applied(user_id: int, ids: list[int]) -> None:
    with open_db() as db, db:
        for i in ids:
            db.execute("UPDATE cv_rewrite_proposals SET status='applied' WHERE id=? AND user_id=?", (i, user_id))


# ---------------------------------------------------------------- export and delete-all

def export_all(user_id: int) -> dict[str, Any]:
    with open_db() as db:
        rewrites = [dict(r) for r in db.execute("SELECT * FROM cv_rewrite_proposals WHERE user_id=?", (user_id,))]
    return {
        "cvs": [get_cv(user_id, c["id"]) for c in list_cvs(user_id)],
        "scores": [get_run(user_id, r["id"]) for r in list_runs(user_id, limit=200)],
        "rewrites": rewrites,
    }


def delete_all(user_id: int) -> None:
    for c in list_cvs(user_id):
        delete_cv(user_id, c["id"])
    with open_db() as db, db:
        db.execute("DELETE FROM cv_rewrite_proposals WHERE user_id=?", (user_id,))
        db.execute("DELETE FROM cv_score_runs WHERE user_id=?", (user_id,))
