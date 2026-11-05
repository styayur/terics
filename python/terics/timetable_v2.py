from __future__ import annotations

import json
from typing import Any

from .course import stable_uid
from .dates import compact_local_date_time, date_for_class, is_monday, parse_iso_date
from .errors import TericsParseError
from .models import BuildV2Result, Conflict, ParseIssue, TimetableEventV2

FORBIDDEN_KEYS = {
    "password",
    "passwd",
    "cookie",
    "cookies",
    "access_token",
    "refresh_token",
    "session_token",
    "csrf",
    "xsrf",
    "authorization",
    "credential",
    "credentials",
}


def _find_forbidden(value: object, path: str = "$") -> list[str]:
    found: list[str] = []
    if isinstance(value, list):
        for index, item in enumerate(value):
            found.extend(_find_forbidden(item, f"{path}[{index}]"))
    elif isinstance(value, dict):
        for key, nested in value.items():
            if key.lower() in FORBIDDEN_KEYS:
                found.append(f"{path}.{key}")
            found.extend(_find_forbidden(nested, f"{path}.{key}"))
    return found


def validate_timetable_v2(value: object) -> dict[str, Any]:
    issues: list[ParseIssue] = []
    warnings: list[ParseIssue] = []
    if not isinstance(value, dict):
        raise TericsParseError("terics v2 课表必须是 JSON 对象")
    for forbidden in _find_forbidden(value):
        issues.append(ParseIssue("error", "forbidden_credential_field", f"{forbidden}: 禁止认证凭证字段"))
    if value.get("schemaVersion") != "2.0":
        issues.append(ParseIssue("error", "unsupported_schema", "仅支持 schemaVersion 2.0"))
    term = value.get("term")
    if not isinstance(term, dict):
        issues.append(ParseIssue("error", "missing_term", "缺少 term"))
    else:
        try:
            start = str(term.get("semesterStart", ""))
            parse_iso_date(start)
            if not is_monday(start):
                issues.append(ParseIssue("error", "not_monday", "semesterStart 必须是周一"))
        except ValueError:
            issues.append(ParseIssue("error", "invalid_date", "semesterStart 无效"))
        schedules = term.get("periodSchedules")
        if not isinstance(schedules, list) or not schedules:
            issues.append(ParseIssue("error", "missing_periods", "缺少节次时间表"))
    courses = value.get("courses")
    if not isinstance(courses, list) or not courses:
        issues.append(ParseIssue("error", "missing_courses", "课表没有课程"))
    meeting_count = 0
    missing_teacher = 0
    missing_room = 0
    if isinstance(courses, list):
        for course_index, course in enumerate(courses):
            if not isinstance(course, dict) or not course.get("id") or not course.get("name"):
                issues.append(ParseIssue("error", "invalid_course", f"courses[{course_index}] 无效"))
                continue
            meetings = course.get("meetings")
            if not isinstance(meetings, list) or not meetings:
                issues.append(ParseIssue("error", "missing_meetings", f"courses[{course_index}] 没有 meetings"))
                continue
            for meeting_index, meeting in enumerate(meetings):
                meeting_count += 1
                if not isinstance(meeting, dict) or not meeting.get("id"):
                    issues.append(
                        ParseIssue("error", "missing_meeting_id", f"courses[{course_index}].meetings[{meeting_index}] 缺少 ID")
                    )
                    continue
                if not isinstance(meeting.get("weeks"), list) or not meeting["weeks"]:
                    issues.append(ParseIssue("error", "missing_weeks", "上课实例缺少周次"))
                if not meeting.get("teacher"):
                    missing_teacher += 1
                if not meeting.get("room"):
                    missing_room += 1
    if missing_teacher:
        warnings.append(ParseIssue("warning", "missing_teacher", f"{missing_teacher} 个上课实例缺少教师"))
    if missing_room:
        warnings.append(ParseIssue("warning", "missing_room", f"{missing_room} 个上课实例缺少教室"))
    status = "failed" if issues else "partial" if warnings else "verified"
    return {
        "status": status,
        "issues": issues,
        "warnings": warnings,
        "completeness": {
            "courseCount": len(courses) if isinstance(courses, list) else 0,
            "meetingCount": meeting_count,
            "missingTeacher": missing_teacher,
            "missingRoom": missing_room,
            "missingPeriods": 0,
            "unknownWeekRules": 0,
            "adjustmentDataAvailable": bool(value.get("overrides")),
        },
    }


def parse_terics_json(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise TericsParseError(f"不是有效的 JSON 文件：{exc}") from exc
    report = validate_timetable_v2(data)
    if report["status"] == "failed":
        raise TericsParseError("不是有效的 terics v2 课表文件", report["issues"])
    return data


def _weekday_from_date(day: str) -> int:
    return parse_iso_date(day).isoweekday()


def _choose_schedule(timetable: dict[str, Any], day: str) -> dict[str, Any] | None:
    schedules = [
        schedule
        for schedule in timetable["term"]["periodSchedules"]
        if str(schedule.get("effectiveFrom", "")) <= day
        and (not schedule.get("effectiveTo") or day <= str(schedule["effectiveTo"]))
    ]
    schedules.sort(key=lambda schedule: str(schedule.get("effectiveFrom", "")))
    return schedules[-1] if schedules else None


def _period_time(schedule: dict[str, Any], index: int, field: str) -> str | None:
    for period in schedule.get("periods", []):
        if int(period.get("index", -1)) == index:
            return str(period.get(field, "")) or None
    return None


def _week_for_date(timetable: dict[str, Any], day: str) -> int:
    start = parse_iso_date(timetable["term"]["semesterStart"])
    delta = (parse_iso_date(day) - start).days
    return max(1, delta // 7 + 1)


def _override_key(course_id: str, meeting_id: str) -> str:
    return f"{course_id}\x1f{meeting_id}"


def _create_event(
    timetable: dict[str, Any],
    course: dict[str, Any],
    meeting: dict[str, Any],
    day: str,
    week: int,
    start_period: int,
    end_period: int,
    start_time: str | None = None,
    end_time: str | None = None,
    teacher: str | None = None,
    room: str | None = None,
    note: str | None = None,
    issues: list[ParseIssue] | None = None,
) -> TimetableEventV2 | None:
    issue_list = issues if issues is not None else []
    schedule = _choose_schedule(timetable, day)
    if schedule is None:
        issue_list.append(ParseIssue("error", "missing_period_schedule", f"{day} 没有有效的节次时间表"))
        return None
    start = start_time or _period_time(schedule, start_period, "start")
    end = end_time or _period_time(schedule, end_period, "end")
    if not start or not end:
        issue_list.append(ParseIssue("error", "missing_period_time", f"{course.get('name')} 在 {day} 引用了未配置节次"))
        return None
    if end <= start:
        issue_list.append(ParseIssue("error", "invalid_event_time", f"{course.get('name')} 在 {day} 的结束时间无效"))
        return None
    key = "\x1f".join(
        [
            str(timetable["term"]["termId"]),
            str(course["id"]),
            str(meeting["id"]),
            day,
            str(start_period),
            str(end_period),
        ]
    )
    uid = stable_uid(key)
    return TimetableEventV2(
        uid=uid,
        course_id=str(course["id"]),
        meeting_id=str(meeting["id"]),
        title=str(course.get("name", "")),
        teacher=teacher if teacher is not None else str(meeting.get("teacher", "")),
        room=room if room is not None else str(meeting.get("room", "")),
        campus=str(meeting.get("campus") or timetable["term"].get("campus") or ""),
        note=note if note is not None else str(meeting.get("note", "")),
        weekday=_weekday_from_date(day),
        start_period=start_period,
        end_period=end_period,
        week=week,
        date=day,
        start=start,
        end=end,
        start_date_time=compact_local_date_time(day, start),
        end_date_time=compact_local_date_time(day, end),
        week_rule=str(meeting.get("weekRule") or ",".join(str(week) for week in meeting.get("weeks", []))),
        adapter_id=str(timetable["source"].get("adapterId", "")),
        adapter_version=str(timetable["source"].get("adapterVersion", "")),
        school_id=str(timetable["source"].get("schoolId", "")),
        term_id=str(timetable["term"]["termId"]),
    )


def build_v2_events(timetable: dict[str, Any]) -> BuildV2Result:
    report = validate_timetable_v2(timetable)
    if report["status"] == "failed":
        return BuildV2Result([], [], report["issues"])
    if not is_monday(str(timetable["term"]["semesterStart"])):
        return BuildV2Result([], [], [ParseIssue("error", "not_monday", "学期开始日期必须是周一")])
    courses = timetable["courses"]
    overrides = timetable.get("overrides", [])
    cancellations: set[str] = set()
    reschedules: dict[str, dict[str, Any]] = {}
    modifications: dict[str, list[dict[str, Any]]] = {}
    makeups: list[dict[str, Any]] = []
    issues: list[ParseIssue] = list(report["warnings"])
    for override in overrides:
        if not override.get("confirmed"):
            issues.append(ParseIssue("warning", "unconfirmed_override_ignored", f"未确认的调课记录已忽略：{override.get('id')}"))
            continue
        key = _override_key(str(override.get("courseId", "")), str(override.get("meetingId", "")))
        override_type = override.get("type")
        if override_type == "cancel":
            cancellations.add(f"{key}\x1f{override.get('originalDate')}")
        elif override_type == "reschedule":
            date_key = f"{key}\x1f{override.get('originalDate')}"
            cancellations.add(date_key)
            reschedules[date_key] = override
        elif override_type == "makeup":
            makeups.append(override)
        else:
            date_key = f"{key}\x1f{override.get('originalDate')}"
            modifications.setdefault(date_key, []).append(override)

    events: list[TimetableEventV2] = []
    seen: set[str] = set()
    meeting_lookup: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}
    for course in courses:
        for meeting in course.get("meetings", []):
            meeting_lookup[_override_key(str(course["id"]), str(meeting["id"]))] = (course, meeting)
            for week in sorted(set(int(value) for value in meeting.get("weeks", []))):
                original_day = date_for_class(str(timetable["term"]["semesterStart"]), week, int(meeting["weekday"]))
                key = _override_key(str(course["id"]), str(meeting["id"]))
                date_key = f"{key}\x1f{original_day}"
                if date_key in cancellations:
                    reschedule = reschedules.get(date_key)
                    if reschedule:
                        new_day = str(reschedule["newDate"])
                        event = _create_event(
                            timetable,
                            course,
                            meeting,
                            new_day,
                            _week_for_date(timetable, new_day),
                            int(reschedule.get("startPeriod") or meeting["startPeriod"]),
                            int(reschedule.get("endPeriod") or meeting["endPeriod"]),
                            reschedule.get("startTime"),
                            reschedule.get("endTime"),
                            reschedule.get("teacher"),
                            reschedule.get("room"),
                            reschedule.get("reason"),
                            issues,
                        )
                        if event and event.uid not in seen:
                            seen.add(event.uid)
                            events.append(event)
                    continue
                start_period = int(meeting["startPeriod"])
                end_period = int(meeting["endPeriod"])
                start_time = meeting.get("startTime")
                end_time = meeting.get("endTime")
                teacher = str(meeting.get("teacher", ""))
                room = str(meeting.get("room", ""))
                for override in modifications.get(date_key, []):
                    if override.get("type") == "room_change" and override.get("room"):
                        room = str(override["room"])
                    if override.get("type") == "teacher_change" and override.get("teacher"):
                        teacher = str(override["teacher"])
                    if override.get("type") == "period_change":
                        start_period = int(override.get("startPeriod") or start_period)
                        end_period = int(override.get("endPeriod") or end_period)
                        start_time = override.get("startTime") or start_time
                        end_time = override.get("endTime") or end_time
                event = _create_event(
                    timetable,
                    course,
                    meeting,
                    original_day,
                    week,
                    start_period,
                    end_period,
                    start_time,
                    end_time,
                    teacher,
                    room,
                    None,
                    issues,
                )
                if event and event.uid not in seen:
                    seen.add(event.uid)
                    events.append(event)

    for makeup in makeups:
        entry = meeting_lookup.get(
            _override_key(str(makeup.get("courseId", "")), str(makeup.get("meetingId", "")))
        )
        if entry is None:
            issues.append(
                ParseIssue("warning", "orphan_makeup_override", f"补课记录引用不存在的上课实例：{makeup.get('id')}")
            )
            continue
        course, meeting = entry
        new_day = str(makeup["newDate"])
        event = _create_event(
            timetable,
            course,
            meeting,
            new_day,
            _week_for_date(timetable, new_day),
            int(makeup.get("startPeriod") or meeting["startPeriod"]),
            int(makeup.get("endPeriod") or meeting["endPeriod"]),
            makeup.get("startTime"),
            makeup.get("endTime"),
            makeup.get("teacher"),
            makeup.get("room"),
            makeup.get("reason"),
            issues,
        )
        if event and event.uid not in seen:
            seen.add(event.uid)
            events.append(event)

    events.sort(key=lambda event: (event.start_date_time, event.title))
    conflicts: list[Conflict] = []
    for left_index, left in enumerate(events):
        for right_index in range(left_index + 1, len(events)):
            right = events[right_index]
            if left.date != right.date:
                continue
            if left.start < right.end and right.start < left.end:
                conflict = Conflict(
                    date=left.date,
                    start=max(left.start, right.start),
                    end=min(left.end, right.end),
                    event_indexes=[left_index, right_index],
                    labels=[f"{left.title}（{left.start}-{left.end}）", f"{right.title}（{right.start}-{right.end}）"],
                )
                conflicts.append(conflict)
                issues.append(ParseIssue("warning", "course_conflict", f"{left.date} 课程冲突"))
    if not events:
        issues.append(ParseIssue("error", "no_events", "没有生成任何课程事件"))
    return BuildV2Result(events, conflicts, issues)
