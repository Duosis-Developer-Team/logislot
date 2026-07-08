"""Standart basarili yanit zarfi."""

from typing import Any


def ok(data: Any = None, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"success": True, "data": data, "error": None}
    if meta is not None:
        body["meta"] = meta
    return body
