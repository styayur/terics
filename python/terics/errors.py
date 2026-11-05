from __future__ import annotations

from .models import ParseIssue


class TericsParseError(ValueError):
    def __init__(self, message: str, issues: list[ParseIssue] | None = None) -> None:
        super().__init__(message)
        self.issues = issues or []
