from __future__ import annotations

import sys
from importlib.metadata import PackageNotFoundError, distributions

ALLOWED = (
    "MIT",
    "BSD",
    "Apache",
    "ISC",
    "MPL",
    "Python",
    "PSF",
    "Unlicense",
    "CC0",
)


def license_text(metadata) -> str:
    expression = metadata.get("License-Expression")
    if expression:
        return expression
    license_value = metadata.get("License") or ""
    if license_value:
        return license_value
    classifiers = metadata.get_all("Classifier") or []
    return " ".join(item for item in classifiers if "License ::" in item)


def main() -> int:
    unknown: list[str] = []
    count = 0
    for distribution in distributions():
        name = distribution.metadata.get("Name", "unknown")
        version = distribution.version
        text = license_text(distribution.metadata)
        if any(token.lower() in text.lower() for token in ALLOWED):
            count += 1
            continue
        unknown.append(f"{name}=={version}: {text or 'MISSING'}")
    if unknown:
        print("Unrecognized Python dependency licenses:", file=sys.stderr)
        for item in unknown:
            print(f"- {item}", file=sys.stderr)
        return 1
    print(f"Python license audit passed: {count} installed distributions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
