from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class SchoolProfile:
    id: str
    name: str
    vendor: str
    entry_url: str
    domains: tuple[str, ...]
    status: str
    capabilities: tuple[str, ...]
    limitations: tuple[str, ...]


def _asset(name: str) -> Path:
    return Path(__file__).resolve().parents[1] / "assets" / name


def load_connector_manifest() -> dict[str, Any]:
    path = _asset("connector-manifest.json")
    if not path.exists():
        return {"sdkVersion": "1.0", "adapters": [], "schools": []}
    return json.loads(path.read_text(encoding="utf-8"))


def list_schools() -> list[SchoolProfile]:
    payload = load_connector_manifest()
    schools: list[SchoolProfile] = []
    for school in payload.get("schools", []):
        schools.append(
            SchoolProfile(
                id=str(school.get("id", "")),
                name=str(school.get("name", "")),
                vendor=str(school.get("vendor", "")),
                entry_url=str(school.get("entryUrl", "")),
                domains=tuple(str(item) for item in school.get("domains", [])),
                status=str(school.get("status", "experimental")),
                capabilities=tuple(str(item) for item in school.get("capabilities", [])),
                limitations=tuple(str(item) for item in school.get("limitations", [])),
            )
        )
    return schools


def connector_runtime_path() -> Path:
    return _asset("connector-runtime.js")
