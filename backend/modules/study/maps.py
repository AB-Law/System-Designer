"""Mind map persistence: versions of a graph scoped per user."""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import HTTPException

from db import open_db
from dc_platform.rows import now
from dc_platform.rows import owned as _owned
from modules import feature_on

MAPS_FLAG = "study.maps"


def require_maps() -> None:
    if not feature_on(MAPS_FLAG):
        raise HTTPException(404, "Mind maps are not enabled.")


def get_row(user_id: int, map_id: int) -> Any:
    return _owned("SELECT * FROM study_mindmaps WHERE id=? AND user_id=?", (map_id, user_id), "Mind map")


def _public(row: Any, *, nodes: list[dict[str, Any]] | None = None, edges: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": row["id"],
        "sourceKind": row["source_kind"],
        "sourceRef": row["source_ref"],
        "version": row["version"],
        "status": row["status"],
        "jobId": row["job_id"],
        "created": row["created"],
    }
    if nodes is not None:
        out["nodes"] = nodes
    if edges is not None:
        out["edges"] = edges
    return out


def list_maps(user_id: int) -> list[dict[str, Any]]:
    require_maps()
    with open_db() as db:
        rows = db.execute(
            "SELECT * FROM study_mindmaps WHERE user_id=? ORDER BY created DESC",
            (user_id,),
        ).fetchall()
    return [_public(r) for r in rows]


def get_map(user_id: int, map_id: int) -> dict[str, Any]:
    require_maps()
    row = get_row(user_id, map_id)
    with open_db() as db:
        nodes = db.execute(
            "SELECT node_id, label, parent_node_id, summary, sources_json FROM study_mindmap_nodes WHERE map_id=? AND user_id=?",
            (map_id, user_id),
        ).fetchall()
        edges = db.execute(
            "SELECT edge_id, source, target FROM study_mindmap_edges WHERE map_id=? AND user_id=?",
            (map_id, user_id),
        ).fetchall()
    return _public(
        row,
        nodes=[
            {
                "id": n["node_id"],
                "label": n["label"],
                "parentId": n["parent_node_id"],
                "summary": n["summary"],
                "sources": json.loads(n["sources_json"] or "[]"),
            }
            for n in nodes
        ],
        edges=[{"id": e["edge_id"], "source": e["source"], "target": e["target"]} for e in edges],
    )


def create(user_id: int, *, source_kind: str, source_ref: str, version: int = 1) -> dict[str, Any]:
    require_maps()
    with open_db() as db, db:
        cur = db.execute(
            "INSERT INTO study_mindmaps(user_id, source_kind, source_ref, version, status, created) VALUES (?,?,?,?,?,?)",
            (user_id, source_kind, source_ref, version, "generating", now()),
        )
        map_id = int(cur.lastrowid or 0)
    return get_row(user_id, map_id)


def set_status(user_id: int, map_id: int, status: str, *, job_id: str | None = None, bump_version: bool = False) -> None:
    get_row(user_id, map_id)
    with open_db() as db, db:
        if bump_version:
            db.execute(
                "UPDATE study_mindmaps SET status=?, job_id=?, version=version+1 WHERE id=? AND user_id=?",
                (status, job_id, map_id, user_id),
            )
        else:
            db.execute(
                "UPDATE study_mindmaps SET status=?, job_id=? WHERE id=? AND user_id=?",
                (status, job_id, map_id, user_id),
            )


def replace_graph(user_id: int, map_id: int, nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> None:
    get_row(user_id, map_id)
    with open_db() as db, db:
        db.execute("DELETE FROM study_mindmap_edges WHERE map_id=? AND user_id=?", (map_id, user_id))
        db.execute("DELETE FROM study_mindmap_nodes WHERE map_id=? AND user_id=?", (map_id, user_id))
        for n in nodes:
            db.execute(
                """INSERT INTO study_mindmap_nodes(map_id, node_id, user_id, label, parent_node_id, summary, sources_json)
                   VALUES (?,?,?,?,?,?,?)""",
                (
                    map_id,
                    n["id"],
                    user_id,
                    n["label"][:120],
                    n.get("parentId"),
                    (n.get("summary") or "")[:2000],
                    json.dumps(n.get("sources") or []),
                ),
            )
        for e in edges:
            db.execute(
                "INSERT INTO study_mindmap_edges(map_id, edge_id, user_id, source, target) VALUES (?,?,?,?,?)",
                (map_id, e["id"], user_id, e["source"], e["target"]),
            )


def patch_node(
    user_id: int,
    map_id: int,
    node_id: str,
    *,
    label: str | None = None,
    summary: str | None = None,
    delete: bool = False,
    add_child_label: str | None = None,
) -> dict[str, Any]:
    require_maps()
    get_row(user_id, map_id)
    node = _owned(
        "SELECT * FROM study_mindmap_nodes WHERE map_id=? AND node_id=? AND user_id=?",
        (map_id, node_id, user_id),
        "Node",
    )
    if delete:
        _delete_subtree(user_id, map_id, node_id)
        return get_map(user_id, map_id)
    if add_child_label:
        child_id = f"n_{uuid.uuid4().hex[:10]}"
        edge_id = f"e_{uuid.uuid4().hex[:10]}"
        with open_db() as db, db:
            db.execute(
                """INSERT INTO study_mindmap_nodes(map_id, node_id, user_id, label, parent_node_id, summary, sources_json)
                   VALUES (?,?,?,?,?,?,?)""",
                (map_id, child_id, user_id, add_child_label.strip()[:120], node_id, "", "[]"),
            )
            db.execute(
                "INSERT INTO study_mindmap_edges(map_id, edge_id, user_id, source, target) VALUES (?,?,?,?,?)",
                (map_id, edge_id, user_id, node_id, child_id),
            )
        return get_map(user_id, map_id)
    sets: list[str] = []
    params: list[Any] = []
    if label is not None:
        sets.append("label=?")
        params.append(label.strip()[:120])
    if summary is not None:
        sets.append("summary=?")
        params.append(summary.strip()[:2000])
    if sets:
        params.extend([map_id, node_id, user_id])
        with open_db() as db, db:
            db.execute(
                f"UPDATE study_mindmap_nodes SET {', '.join(sets)} WHERE map_id=? AND node_id=? AND user_id=?",
                params,
            )
    _ = node
    return get_map(user_id, map_id)


def _delete_subtree(user_id: int, map_id: int, node_id: str) -> None:
    with open_db() as db, db:
        stack = [node_id]
        while stack:
            cur = stack.pop()
            kids = db.execute(
                "SELECT node_id FROM study_mindmap_nodes WHERE map_id=? AND user_id=? AND parent_node_id=?",
                (map_id, user_id, cur),
            ).fetchall()
            stack.extend(str(k["node_id"]) for k in kids)
            db.execute("DELETE FROM study_mindmap_edges WHERE map_id=? AND user_id=? AND (source=? OR target=?)", (map_id, user_id, cur, cur))
            db.execute("DELETE FROM study_mindmap_nodes WHERE map_id=? AND node_id=? AND user_id=?", (map_id, cur, user_id))


def node_row(user_id: int, map_id: int, node_id: str) -> Any:
    get_row(user_id, map_id)
    return _owned(
        "SELECT * FROM study_mindmap_nodes WHERE map_id=? AND node_id=? AND user_id=?",
        (map_id, node_id, user_id),
        "Node",
    )
