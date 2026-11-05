from __future__ import annotations

import hashlib
from dataclasses import replace

from .dates import (
    assert_time,
    compact_local_date_time,
    date_for_class,
    is_monday,
    time_to_minutes,
    weekday_zh,
)
from .models import (
    BuildResult,
    CalendarEvent,
    Conflict,
    ParseIssue,
    PeriodTime,
    RawCourse,
    SemesterConfig,
)
from .weeks import clean_cell_text, clean_course_name, clean_teacher, normalize_text


def _canonical_course_key(course: RawCourse) -> tuple[object, ...]:
    return (
        clean_course_name(course.name),
        clean_teacher(course.teacher),
        clean_cell_text(course.location),
        course.weekday,
        course.start_period,
        course.end_period,
        tuple(sorted(course.weeks)),
        clean_cell_text(course.note),
    )


def stable_uid(key: str) -> str:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return f"terics-{digest[:32]}@terics"


def _validate_periods(periods: list[PeriodTime], issues: list[ParseIssue]) -> dict[int, PeriodTime]:
    period_map: dict[int, PeriodTime] = {}
    for index, period in enumerate(periods):
        if not isinstance(period.index, int) or period.index < 1 or period.index > 30:
            issues.append(
                ParseIssue(
                    "error",
                    "invalid_period_index",
                    f"节次编号必须为 1–30 的整数：{period.index}",
                )
            )
            continue
        if period.index in period_map:
            issues.append(ParseIssue("error", "duplicate_period_index", f"节次 {period.index} 重复"))
            continue
        try:
            assert_time(period.start, f"第 {period.index} 节开始时间")
            assert_time(period.end, f"第 {period.index} 节结束时间")
            if time_to_minutes(period.end) <= time_to_minutes(period.start):
                issues.append(
                    ParseIssue(
                        "error",
                        "period_time_order",
                        f"第 {period.index} 节结束时间必须晚于开始时间",
                    )
                )
                continue
            period_map[period.index] = replace(period)
        except ValueError as exc:
            issues.append(ParseIssue("error", "invalid_period_time", str(exc)))

        if index > 0:
            previous = periods[index - 1]
            if period.index == previous.index + 1:
                try:
                    if time_to_minutes(period.start) < time_to_minutes(previous.end):
                        issues.append(
                            ParseIssue(
                                "warning",
                                "period_overlap",
                                f"第 {previous.index} 节与第 {period.index} 节时间重叠，请确认作息表",
                            )
                        )
                except ValueError:
                    pass
    return period_map


def build_events(config: SemesterConfig, raw_courses: list[RawCourse]) -> BuildResult:
    issues: list[ParseIssue] = []
    if not is_monday(config.semester_start):
        issues.append(
            ParseIssue(
                "error",
                "semester_start_not_monday",
                f"学期开始日期必须是第 1 周周一：{config.semester_start}",
            )
        )
        return BuildResult([], [], issues)
    if not isinstance(config.alarm_minutes, int) or config.alarm_minutes < 0 or config.alarm_minutes > 10080:
        issues.append(ParseIssue("error", "invalid_alarm", "提醒时间必须为 0–10080 分钟的整数"))

    period_map = _validate_periods(config.periods, issues)
    if any(issue.severity == "error" for issue in issues):
        return BuildResult([], [], issues)

    unique_courses: dict[tuple[object, ...], RawCourse] = {}
    for course in raw_courses:
        normalized = replace(
            course,
            name=clean_course_name(course.name),
            teacher=clean_teacher(course.teacher),
            location=clean_cell_text(course.location),
            note=clean_cell_text(course.note),
            week_rule=normalize_text(course.week_rule),
            weeks=sorted(set(course.weeks)),
        )
        if not normalized.name:
            issues.append(
                ParseIssue(
                    "error",
                    "missing_course_name",
                    f"课程缺少名称：{normalized.source_ref or '未知位置'}",
                )
            )
            continue
        if normalized.weekday < 1 or normalized.weekday > 7:
            issues.append(
                ParseIssue("error", "invalid_weekday", f"{normalized.name} 的星期无效：{normalized.weekday}")
            )
            continue
        if normalized.start_period > normalized.end_period:
            issues.append(
                ParseIssue(
                    "error",
                    "invalid_section_range",
                    f"{normalized.name} 的节次范围无效：{normalized.start_period}-{normalized.end_period}",
                )
            )
            continue
        unique_courses[_canonical_course_key(normalized)] = normalized

    events: list[CalendarEvent] = []
    seen_uids: set[str] = set()
    for course in unique_courses.values():
        start_period_time = period_map.get(course.start_period)
        end_period_time = period_map.get(course.end_period)
        if start_period_time is None or end_period_time is None:
            issues.append(
                ParseIssue(
                    "error",
                    "missing_period_time",
                    f"{course.name} 引用了未配置的节次 {course.start_period}-{course.end_period}",
                )
            )
            continue
        for week in course.weeks:
            day = date_for_class(config.semester_start, week, course.weekday)
            start = start_period_time.start
            end = end_period_time.end
            uid_key = "\x1f".join(
                [
                    course.name,
                    course.teacher,
                    course.location,
                    day,
                    str(course.start_period),
                    str(course.end_period),
                ]
            )
            uid = stable_uid(uid_key)
            if uid in seen_uids:
                continue
            seen_uids.add(uid)
            events.append(
                CalendarEvent(
                    uid=uid,
                    title=course.name,
                    teacher=course.teacher,
                    location=course.location,
                    note=course.note,
                    weekday=course.weekday,
                    start_period=course.start_period,
                    end_period=course.end_period,
                    week=week,
                    date=day,
                    start=start,
                    end=end,
                    start_date_time=compact_local_date_time(day, start),
                    end_date_time=compact_local_date_time(day, end),
                    week_rule=course.week_rule or ",".join(str(value) for value in course.weeks),
                )
            )

    events.sort(key=lambda event: (event.start_date_time, event.title))

    conflicts: list[Conflict] = []
    for left_index, left in enumerate(events):
        for right_index in range(left_index + 1, len(events)):
            right = events[right_index]
            if left.date != right.date:
                continue
            if left.start < right.end and right.start < left.end:
                labels = [
                    f"{left.title}（{weekday_zh(left.weekday)} {left.start}-{left.end}）",
                    f"{right.title}（{weekday_zh(right.weekday)} {right.start}-{right.end}）",
                ]
                conflict = Conflict(
                    date=left.date,
                    start=max(left.start, right.start),
                    end=min(left.end, right.end),
                    event_indexes=[left_index, right_index],
                    labels=labels,
                )
                conflicts.append(conflict)
                issues.append(
                    ParseIssue(
                        "warning",
                        "course_conflict",
                        f"{left.date} {conflict.start}-{conflict.end} 课程冲突：{' / '.join(labels)}",
                    )
                )

    if not events:
        issues.append(ParseIssue("error", "no_events", "没有生成任何课程事件，请检查周次与节次配置"))

    return BuildResult(events, conflicts, issues)
