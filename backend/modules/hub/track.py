"""Which topics the Hub shows for this user: guessed from the target role, then the CV, else system design."""
from __future__ import annotations

from typing import Any

from dc_platform import tracks
from modules import enabled_modules

TITLE_WEIGHT = 3


def _cv_parts(user_id: int) -> list[tuple[str, int]]:
    """The active CV as weighted text: headline and job titles count most, then skills, then everything else."""
    if "cv" not in enabled_modules():
        return []
    from modules.cv import service
    from modules.cv.structure import CVStructure

    cv = service.active_cv(user_id)
    if not cv or not cv["latest"]:
        return []
    s = CVStructure.model_validate(cv["latest"]["structure"])
    titles = " ".join([s.headline, *(r.title for r in s.experience)])
    prose = " ".join([s.summary, *(b for r in s.experience for b in r.bullets)])
    return [(titles, TITLE_WEIGHT), (" ".join(s.skills), 2), (prose, 1)]


def of(user_id: int, row: Any) -> dict[str, str]:
    """The track and where it came from: "target" when the role says it, "cv" when only the CV does, else "default"."""
    target = tracks.detect([(row["title"], TITLE_WEIGHT), (row["jd_text"] or "", 1)]) if row else None
    found, source = (target, "target") if target else (tracks.detect(_cv_parts(user_id)), "cv")
    track = found or tracks.DEFAULT
    return {"slug": track.slug, "label": track.label, "source": source if found else "default"}
