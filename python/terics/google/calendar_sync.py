from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from ..models import TimetableEventV2
from ..timetable_v2 import build_v2_events


def _private_props(event: dict[str, Any]) -> dict[str, str]:
    return ((event.get("extendedProperties") or {}).get("private") or {})


def _schedule_hash(event: TimetableEventV2) -> str:
    key = "\x1f".join(
        [
            event.uid,
            event.course_id,
            event.meeting_id,
            event.title,
            event.teacher,
            event.room,
            event.date,
            event.start,
            event.end,
            str(event.start_period),
            str(event.end_period),
        ]
    )
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _google_event(timetable: dict[str, Any], event: TimetableEventV2, schedule_hash: str) -> dict[str, Any]:
    timezone = str((timetable.get("term") or {}).get("timezone") or "Asia/Shanghai")
    description = "\n".join(
        [
            f"教师：{event.teacher or '未提供'}",
            f"地点：{event.room or '未提供'}",
            f"节次：第 {event.start_period}-{event.end_period} 节",
            f"周次：{event.week_rule}",
            f"terics courseId：{event.course_id}",
            f"terics meetingId：{event.meeting_id}",
        ]
    )
    return {
        "summary": event.title,
        "location": event.room,
        "description": description,
        "start": {"dateTime": event.start_date_time, "timeZone": timezone},
        "end": {"dateTime": event.end_date_time, "timeZone": timezone},
        "extendedProperties": {
            "private": {
                "terics_source": "terics",
                "terics_course_id": event.course_id,
                "terics_meeting_id": event.meeting_id,
                "terics_event_uid": event.uid,
                "terics_schedule_hash": schedule_hash,
                "terics_adapter_version": event.adapter_version,
                "terics_term_id": event.term_id,
            }
        },
    }


def _managed(event: dict[str, Any], term_id: str) -> bool:
    props = _private_props(event)
    return props.get("terics_source") == "terics" and props.get("terics_term_id") == term_id


@dataclass(slots=True)
class SyncPlan:
    calendar_id: str
    term_id: str
    creates: list[dict[str, Any]] = field(default_factory=list)
    updates: list[dict[str, Any]] = field(default_factory=list)
    skips: list[dict[str, Any]] = field(default_factory=list)
    deletes: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    blocked: bool = False
    data_complete: bool = True


def plan_google_sync(
    timetable: dict[str, Any],
    existing_events: list[dict[str, Any]],
    calendar_id: str,
) -> SyncPlan:
    build = build_v2_events(timetable)
    term_id = str(timetable["term"]["termId"])
    validation = timetable.get("validation") or {}
    data_complete = validation.get("status") != "failed"
    plan = SyncPlan(calendar_id=calendar_id, term_id=term_id, data_complete=data_complete)
    managed = [event for event in existing_events if _managed(event, term_id)]
    if not build.events:
        plan.blocked = True
        plan.warnings.append("新课表为空；为避免误删，禁止生成任何删除操作")
        return plan
    existing_by_uid = {
        _private_props(event).get("terics_event_uid") or event.get("iCalUID", ""): event
        for event in managed
    }
    desired_uids = {event.uid for event in build.events}
    for event in build.events:
        schedule_hash = _schedule_hash(event)
        payload = _google_event(timetable, event, schedule_hash)
        existing = existing_by_uid.get(event.uid)
        if not existing:
            plan.creates.append({"event": event, "request": payload, "schedule_hash": schedule_hash})
        elif _private_props(existing).get("terics_schedule_hash") == schedule_hash:
            plan.skips.append({"event": event, "existing": existing})
        else:
            plan.updates.append({"event": event, "existing": existing, "request": payload, "schedule_hash": schedule_hash})
    if data_complete:
        for existing in managed:
            uid = _private_props(existing).get("terics_event_uid") or existing.get("iCalUID")
            if uid and uid not in desired_uids:
                plan.deletes.append({"existing": existing})
    else:
        plan.blocked = True
        plan.warnings.append("数据完整性检查失败，禁止删除")
    if plan.deletes:
        plan.warnings.append(f"{len(plan.deletes)} 个旧事件是删除候选；执行时必须显式确认")
    return plan


@dataclass(slots=True)
class SyncResult:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    deleted: int = 0
    errors: list[str] = field(default_factory=list)


def execute_sync_plan(
    plan: SyncPlan,
    insert_event: Callable[[str, dict[str, Any]], Any],
    patch_event: Callable[[str, str, dict[str, Any]], Any],
    delete_event: Callable[[str, str], Any],
    confirm_deletes: bool,
) -> SyncResult:
    if plan.blocked:
        raise RuntimeError("同步计划未通过数据完整性检查，已阻止执行")
    result = SyncResult(skipped=len(plan.skips))
    for action in plan.creates:
        try:
            insert_event(plan.calendar_id, action["request"])
            result.created += 1
        except Exception as exc:  # noqa: BLE001 - aggregate API failures
            result.errors.append(f"创建失败：{exc}")
    for action in plan.updates:
        try:
            patch_event(plan.calendar_id, str(action["existing"]["id"]), action["request"])
            result.updated += 1
        except Exception as exc:  # noqa: BLE001 - aggregate API failures
            result.errors.append(f"更新失败：{exc}")
    if confirm_deletes:
        for action in plan.deletes:
            try:
                delete_event(plan.calendar_id, str(action["existing"]["id"]))
                result.deleted += 1
            except Exception as exc:  # noqa: BLE001 - aggregate API failures
                result.errors.append(f"删除失败：{exc}")
    return result


class GoogleApiCalendarClient:
    def __init__(self, service: Any) -> None:
        self.service = service

    def list_calendars(self) -> list[dict[str, Any]]:
        calendars: list[dict[str, Any]] = []
        token: str | None = None
        while True:
            request = self.service.calendarList().list(
                maxResults=250,
                minAccessRole="writer",
                pageToken=token,
            )
            page = request.execute()
            calendars.extend(page.get("items", []))
            token = page.get("nextPageToken")
            if not token:
                return calendars

    def create_calendar(self, summary: str, time_zone: str = "Asia/Shanghai") -> dict[str, Any]:
        return self.service.calendars().insert(body={"summary": summary, "timeZone": time_zone}).execute()

    def list_managed_events(self, calendar_id: str, term_id: str) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        token: str | None = None
        while True:
            page = (
                self.service.events()
                .list(
                    calendarId=calendar_id,
                    maxResults=2500,
                    singleEvents=True,
                    showDeleted=False,
                    privateExtendedProperty=[
                        "terics_source=terics",
                        f"terics_term_id={term_id}",
                    ],
                    pageToken=token,
                )
                .execute()
            )
            events.extend(page.get("items", []))
            token = page.get("nextPageToken")
            if not token:
                break
        return [event for event in events if _managed(event, term_id)]

    def insert_event(self, calendar_id: str, event: dict[str, Any]) -> Any:
        return self.service.events().insert(calendarId=calendar_id, body=event, sendUpdates="none").execute()

    def patch_event(self, calendar_id: str, event_id: str, event: dict[str, Any]) -> Any:
        return (
            self.service.events()
            .patch(calendarId=calendar_id, eventId=event_id, body=event, sendUpdates="none")
            .execute()
        )

    def delete_event(self, calendar_id: str, event_id: str) -> Any:
        return self.service.events().delete(calendarId=calendar_id, eventId=event_id, sendUpdates="none").execute()
