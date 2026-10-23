from __future__ import annotations

import pytest
from fastapi import HTTPException

from deps import check_doc


def test_check_doc_accepts_small_design() -> None:
    text = check_doc({"nodes": [{"id": "a"}], "edges": []})
    assert '"nodes"' in text


def test_check_doc_rejects_bad_shape() -> None:
    with pytest.raises(HTTPException) as ei:
        check_doc({"nodes": "nope", "edges": []})
    assert ei.value.status_code == 400


def test_check_doc_rejects_too_many_nodes() -> None:
    with pytest.raises(HTTPException) as ei:
        check_doc({"nodes": [{}] * 201, "edges": []})
    assert ei.value.status_code == 400
