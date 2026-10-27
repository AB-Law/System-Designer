"""What the API shows of a session: its plan only when the user may see it, its turns, and its feedback."""
from __future__ import annotations

import json
from typing import Any

from dc_platform.rows import now

from . import conversation, roles, sessions
from .schemas import Plan


def visible_plan(row: Any) -> list[dict[str, Any]] | None:
    """A plan the user asked to see before starting, or any plan once the interview is over. Otherwise hidden to keep it realistic."""
    shown = sessions.style_of(row).showPlan or row["status"] == sessions.ENDED
    return [i.model_dump() for i in Plan.model_validate_json(row["plan_json"]).items] if shown and row["plan_json"] else None


def session_detail(user_id: int, session_id: int) -> dict[str, Any]:
    row = sessions.get_row(user_id, session_id)
    role = roles.get_row(user_id, row["role_id"])
    turns = sessions.turns_of(user_id, session_id)
    return {
        "id": row["id"], "roleId": row["role_id"], "role": roles.public(role), "style": json.loads(row["style_json"]),
        "status": row["status"], "error": row["error"], "planJobId": row["plan_job_id"], "feedbackJobId": row["feedback_job_id"],
        "plan": visible_plan(row), "turns": [conversation.turn_json(t) for t in turns],
        "startedAt": turns[0].created if turns else None, "serverNow": now(), "score": row["score"],
        "created": row["created"], "ended": row["ended"], "feedback": sessions.feedback_of(user_id, session_id),
    }
