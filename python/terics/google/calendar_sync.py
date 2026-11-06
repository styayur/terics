from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from ..models import TimetableEventV2
from ..timetable_v2 import build_v2_events


def _private_props(event: dict[str, Any]) -> dict[str, str]:
    return ((event.get("extendedProperties") or {}).get("private") or {})


def _prop(event: dict[str, Any], camel: str, legacy: str) -> str | None:
    props = _private_props(event)
    return props.get(camel) or props.get(legacy)


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
    body: dict[str, Any] = {
        "id": f"terics{hashlib.sha256(event.uid.encode('utf-8')).hexdigest()[:48]}",
        "iCalUID": event.uid,
        "summary": event.title,
        "location": event.room,
        "description": description,
        "start": {"dateTime": event.start_date_time, "timeZone": timezone},
        "end": {"dateTime": event.end_date_time, "timeZone": timezone},
        "extendedProperties": {
            "private": {
                "tericsManaged": "true",
                "tericsSchemaVersion": "2.0",
                "tericsCourseId": event.course_id,
                "tericsMeetingId": event.meeting_id,
                "tericsSource": "terics",
                "tericsUid": event.uid,
                "tericsTermId": event.term_id,
                "tericsScheduleHash": schedule_hash,
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
    rendered = "\x1f".join(
        [
            str(body.get("summary") or ""),
            str(body.get("description") or ""),
            str(body.get("location") or ""),
            str(body["start"].get("dateTime") or ""),
            str(body["start"].get("timeZone") or ""),
            str(body["end"].get("dateTime") or ""),
            str(body["end"].get("timeZone") or ""),
        ]
    )
    body["extendedProperties"]["private"]["tericsRenderedHash"] = hashlib.sha256(rendered.encode("utf-8")).hexdigest()
    return body


def _rendered_hash(event: dict[str, Any]) -> str:
    start = event.get("start") or {}
    end = event.get("end") or {}
    rendered = "\x1f".join(
        [
            str(event.get("summary") or ""),
            str(event.get("description") or ""),
            str(event.get("location") or ""),
            str(start.get("dateTime") or ""),
            str(start.get("timeZone") or ""),
            str(end.get("dateTime") or ""),
            str(end.get("timeZone") or ""),
        ]
    )
    return hashlib.sha256(rendered.encode("utf-8")).hexdigest()


def _managed(event: dict[str, Any], term_id: str) -> bool:
    props = _private_props(event)
    managed = props.get("tericsManaged") == "true" or props.get("terics_source") == "terics"
    return managed and (props.get("tericsTermId") or props.get("terics_term_id")) == term_id


@dataclass(slots=True)
class SyncPlan:
    calendar_id: str
    term_id: str
    creates: list[dict[str, Any]] = field(default_factory=list)
    updates: list[dict[str, Any]] = field(default_factory=list)
    skips: list[dict[str, Any]] = field(default_factory=list)
    deletes: list[dict[str, Any]] = field(default_factory=list)
    conflicts: list[dict[str, Any]] = field(default_factory=list)
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
    by_uid: dict[str, list[dict[str, Any]]] = {}
    for existing in managed:
        uid = _prop(existing, "tericsUid", "terics_event_uid") or str(existing.get("iCalUID") or "")
        if uid:
            by_uid.setdefault(uid, []).append(existing)
    existing_by_uid: dict[str, dict[str, Any]] = {}
    for uid, matches in by_uid.items():
        if len(matches) == 1:
            existing_by_uid[uid] = matches[0]
        else:
            plan.conflicts.append({"existing": matches[0], "reason": f"检测到 {len(matches)} 个重复托管事件（{uid}）"})
    desired_uids = {event.uid for event in build.events}
    for event in build.events:
        schedule_hash = _schedule_hash(event)
        payload = _google_event(timetable, event, schedule_hash)
        existing = existing_by_uid.get(event.uid)
        if not existing:
            plan.creates.append({"event": event, "request": payload, "schedule_hash": schedule_hash})
            continue
        expected_rendered = _private_props(existing).get("tericsRenderedHash")
        if expected_rendered and _rendered_hash(existing) != expected_rendered:
            plan.conflicts.append({"event": event, "existing": existing, "reason": "Google Calendar 中的 terics 事件被手动修改"})
            continue
        old_hash = _prop(existing, "tericsScheduleHash", "terics_schedule_hash")
        if old_hash == schedule_hash:
            plan.skips.append({"event": event, "existing": existing})
        elif not expected_rendered:
            plan.conflicts.append({"event": event, "existing": existing, "reason": "旧版 terics 事件缺少远程字段哈希"})
        else:
            plan.updates.append({"event": event, "existing": existing, "request": payload, "schedule_hash": schedule_hash})
    if data_complete and not plan.conflicts:
        for existing in managed:
            uid = _prop(existing, "tericsUid", "terics_event_uid") or existing.get("iCalUID")
            if uid and uid not in desired_uids:
                plan.deletes.append({"existing": existing})
    elif not data_complete:
        plan.blocked = True
        plan.warnings.append("数据完整性检查失败，禁止删除")
    if plan.deletes:
        plan.warnings.append(f"{len(plan.deletes)} 个旧事件是删除候选；执行时必须显式确认")
    if plan.conflicts:
        plan.warnings.append("检测到冲突或重复事件；已禁止生成删除计划")
    return plan


@dataclass(slots=True)
class SyncResult:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    deleted: int = 0
    conflicted: int = 0
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
    result = SyncResult(skipped=len(plan.skips), conflicted=len(plan.conflicts))
    for action in plan.creates:
        try:
            insert_event(plan.calendar_id, action["request"])
            result.created += 1
        except Exception as exc:  # noqa: BLE001 - aggregate API failures
            result.errors.append(f"创建失败：{exc}")
    for action in plan.updates:
        try:
            patch_body = dict(action["request"])
            patch_body.pop("id", None)
            patch_body.pop("iCalUID", None)
            patch_event(plan.calendar_id, str(action["existing"]["id"]), patch_body)
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


@dataclass(slots=True)
class CourseRemovalResult:
    calendar_id: str
    course_id: str
    candidates: int = 0
    deleted: int = 0
    already_missing: int = 0
    skipped: int = 0
    failures: list[dict[str, str]] = field(default_factory=list)


def remove_course_from_google_calendar(
    client: Any,
    calendar_id: str,
    term_id: str,
    course_id: str,
    course_title: str | None = None,
) -> CourseRemovalResult:
    if not calendar_id.strip():
        raise ValueError("必须指定目标 calendarId")
    if not term_id.strip():
        raise ValueError("必须指定 termId")
    if not course_id.strip():
        raise ValueError("必须指定精确 courseId；禁止按标题删除")
    events = client.list_managed_events(calendar_id, term_id)
    candidates = [event for event in events if _managed(event, term_id)]
    matched = [event for event in candidates if _prop(event, "tericsCourseId", "terics_course_id") == course_id]
    skipped = sum(
        1
        for event in candidates
        if not _prop(event, "tericsCourseId", "terics_course_id")
        and course_title is not None
        and event.get("summary") == course_title
    )
    result = CourseRemovalResult(calendar_id=calendar_id, course_id=course_id, candidates=len(matched), skipped=skipped)
    seen: set[str] = set()
    for event in matched:
        event_id = str(event.get("id") or "")
        if not event_id or event_id in seen:
            result.skipped += 1
            continue
        seen.add(event_id)
        try:
            client.delete_event(calendar_id, event_id)
            result.deleted += 1
        except Exception as exc:  # noqa: BLE001 - aggregate deletion failures
            status = getattr(getattr(exc, "resp", None), "status", None)
            if status in (404, 410):
                result.already_missing += 1
            else:
                result.failures.append({"eventId": event_id, "error": str(exc)})
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
        by_id: dict[str, dict[str, Any]] = {}
        filters = [
            ["tericsManaged=true", f"tericsTermId={term_id}"],
            ["terics_source=terics", f"terics_term_id={term_id}"],
        ]
        for private_filters in filters:
            token: str | None = None
            while True:
                page = (
                    self.service.events()
                    .list(
                        calendarId=calendar_id,
                        maxResults=2500,
                        singleEvents=True,
                        showDeleted=False,
                        privateExtendedProperty=private_filters,
                        pageToken=token,
                    )
                    .execute()
                )
                for event in page.get("items", []):
                    if event.get("id"):
                        by_id[str(event["id"])] = event
                token = page.get("nextPageToken")
                if not token:
                    break
        return [event for event in by_id.values() if _managed(event, term_id)]

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
