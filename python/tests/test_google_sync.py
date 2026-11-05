from __future__ import annotations

from pathlib import Path

import pytest

from terics.google.auth import GoogleOAuthNotConfiguredError, authenticate, google_client_config
from terics.google.calendar_sync import _google_event, _schedule_hash, execute_sync_plan, plan_google_sync
from terics.timetable_v2 import build_v2_events, parse_terics_json

ROOT = Path(__file__).resolve().parents[2]


def timetable() -> dict[str, object]:
    return parse_terics_json((ROOT / "fixtures" / "exchange" / "overrides.terics.json").read_text(encoding="utf-8"))


def test_sync_plan_respects_managed_events_and_explicit_deletion() -> None:
    data = timetable()
    events = build_v2_events(data).events
    first, second = events[0], events[1]
    same_hash = _schedule_hash(first)
    existing_same = {**_google_event(data, first, same_hash), "id": "same"}
    existing_changed = {**_google_event(data, second, "old-hash"), "id": "changed"}
    stale = {
        "id": "stale",
        "extendedProperties": {"private": {"terics_source": "terics", "terics_term_id": "2026-2027-1", "terics_event_uid": "old"}},
    }
    foreign = {"id": "foreign", "extendedProperties": {"private": {"other": "1"}}}
    plan = plan_google_sync(data, [existing_same, existing_changed, stale, foreign], "calendar-1")
    assert not [item for item in plan.updates if item["existing"]["id"] == "same"]
    assert any(item["existing"]["id"] == "changed" for item in plan.updates)
    assert any(item["existing"]["id"] == "stale" for item in plan.deletes)
    assert not any(item["existing"]["id"] == "foreign" for item in plan.deletes)
    created: list[dict[str, object]] = []
    patched: list[str] = []
    deleted: list[str] = []
    result = execute_sync_plan(
        plan,
        lambda _calendar, payload: created.append(payload),
        lambda _calendar, event_id, _payload: patched.append(event_id),
        lambda _calendar, event_id: deleted.append(event_id),
        True,
    )
    assert result.deleted == 1
    assert deleted == ["stale"]
    assert patched and patched[0] == "changed"


def test_empty_data_blocks_sync_and_deletion() -> None:
    data = timetable()
    data["courses"] = []
    plan = plan_google_sync(data, [], "calendar-1")
    assert plan.blocked
    with pytest.raises(RuntimeError):
        execute_sync_plan(plan, lambda *_: None, lambda *_: None, lambda *_: None, True)


def test_google_oauth_requires_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TERICS_GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("TERICS_GOOGLE_CLIENT_CONFIG", raising=False)
    assert google_client_config() is None
    with pytest.raises(GoogleOAuthNotConfiguredError):
        authenticate(store=FakeStore())


class FakeStore:
    def load(self):
        return None

    def save(self, token):
        raise AssertionError("不应保存 token")

    def clear(self):
        pass
