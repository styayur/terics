from __future__ import annotations

from pathlib import Path

import pytest

from terics.google.auth import GOOGLE_SCOPES, GoogleOAuthNotConfiguredError, authenticate, google_client_config
from terics.google.calendar_sync import (
    _google_event,
    _schedule_hash,
    execute_sync_plan,
    plan_google_sync,
    remove_course_from_google_calendar,
)
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


def test_google_event_identity_and_manual_edit_protection() -> None:
    data = timetable()
    event = build_v2_events(data).events[0]
    body = _google_event(data, event, _schedule_hash(event))
    private = body["extendedProperties"]["private"]
    assert body["id"].startswith("terics")
    assert private["tericsManaged"] == "true"
    assert private["tericsCourseId"] == event.course_id
    assert private["tericsMeetingId"] == event.meeting_id
    assert private["tericsUid"] == event.uid
    assert private["tericsRenderedHash"]
    edited = {**body, "id": "edited", "location": "用户手动修改"}
    plan = plan_google_sync(data, [edited], "calendar-1")
    assert plan.conflicts
    assert not plan.updates


def test_whole_course_calendar_removal_uses_exact_course_id() -> None:
    class Client:
        deleted: list[str]

        def __init__(self) -> None:
            self.deleted = []

        def list_managed_events(self, _calendar_id: str, _term_id: str):
            return [
                {"id": "camel-a", "summary": "课程一", "extendedProperties": {"private": {"tericsManaged": "true", "tericsTermId": "T1", "tericsCourseId": "A"}}},
                {"id": "legacy-a", "summary": "课程一", "extendedProperties": {"private": {"terics_source": "terics", "terics_term_id": "T1", "terics_course_id": "A"}}},
                {"id": "course-b", "summary": "课程一", "extendedProperties": {"private": {"tericsManaged": "true", "tericsTermId": "T1", "tericsCourseId": "B"}}},
                {"id": "title-only", "summary": "课程一", "extendedProperties": {"private": {"tericsManaged": "true", "tericsTermId": "T1"}}},
            ]

        def delete_event(self, _calendar_id: str, event_id: str) -> None:
            self.deleted.append(event_id)

    client = Client()
    result = remove_course_from_google_calendar(client, "target", "T1", "A", "课程一")
    assert result.candidates == 2
    assert result.deleted == 2
    assert result.skipped == 1
    assert client.deleted == ["camel-a", "legacy-a"]
    with pytest.raises(ValueError, match="courseId"):
        remove_course_from_google_calendar(client, "target", "T1", "")


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


def test_google_scopes_never_request_gmail() -> None:
    assert "https://www.googleapis.com/auth/calendar.events" in GOOGLE_SCOPES
    assert all("gmail" not in scope.lower() for scope in GOOGLE_SCOPES)


class FakeStore:
    def load(self):
        return None

    def save(self, token):
        raise AssertionError("不应保存 token")

    def clear(self):
        pass
