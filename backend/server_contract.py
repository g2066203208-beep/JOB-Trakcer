"""Reference API contract for a future local/cloud GPU backend.

This file is intentionally dependency-light: it only validates the payload shape.
Production inference adapters should be added behind the LayerBackend interface.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import Any, Protocol


@dataclass
class LayerRecord:
    id: str
    label: str
    zOrder: int
    parent: str
    pivot: dict[str, float]
    bbox: list[float]
    rgba: str
    hiddenRegionReconstructed: bool = False


class LayerBackend(Protocol):
    def decompose(self, image_bytes: bytes, *, mode: str, split: str) -> dict[str, Any]:
        ...


def validate_response(payload: dict[str, Any]) -> dict[str, Any]:
    required = {"schemaVersion", "source", "inference", "layers"}
    missing = sorted(required - payload.keys())
    if missing:
        raise ValueError(f"Missing fields: {missing}")
    if not isinstance(payload["layers"], list):
        raise TypeError("layers must be a list")
    for layer in payload["layers"]:
        for key in ("id", "label", "zOrder", "parent", "pivot", "bbox", "rgba"):
            if key not in layer:
                raise ValueError(f"Layer missing {key}")
    return payload
