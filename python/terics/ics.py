from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from .course import build_events
from .dates import format_utc_stamp, weekday_zh
from .errors import TericsParseError
from .models import APP_VERSION, TIMEZONE, BuildResult, CalendarEvent, RawCourse, SemesterConfig, TimetableEventV2
from .weeks import normalize_text


@dataclass(slots=True)
class IcsOutput:
    ics: str
    build: BuildResult


def escape_ics_text(value: object) -> str:
    text = normalize_text(value)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    text = text.replace("\\", "\\\\")
    text = text.replace("\n", "\\n")
    text = text.replace(";", "\\;")
    text = text.replace(",", "\\,")
    return text


def fold_ics_line(line: str) -> str:
    chunks: list[str] = []
    current = ""
    current_bytes = 0
    for char in line:
        char_bytes = len(char.encode("utf-8"))
        limit = 75 if not chunks else 74
        if current_bytes + char_bytes > limit and current:
            chunks.append(current)
            current = ""
            current_bytes = 0
        current += char
        current_bytes += char_bytes
    chunks.append(current)
    return "\r\n ".join(chunks)


def _event_description(event: CalendarEvent) -> str:
    lines = [
        f"教师：{event.teacher or '未提供'}",
        f"地点：{event.location or '未提供'}",
        f"节次：第 {event.start_period}-{event.end_period} 节",
        f"周次：{event.week_rule}",
        f"日期：{event.date}（{weekday_zh(event.weekday)}）",
    ]
    if event.note:
        lines.append(f"备注：{event.note}")
    return "\n".join(lines)


def generate_ics(
    config: SemesterConfig,
    courses: list[RawCourse],
    now: datetime | None = None,
) -> IcsOutput:
    build = build_events(config, courses)
    if any(issue.severity == "error" for issue in build.issues) or not build.events:
        message = next((issue.message for issue in build.issues if issue.severity == "error"), "没有可导出的课程")
        raise TericsParseError(message, build.issues)

    dtstamp = format_utc_stamp(now)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//terics//Timetable Converter {APP_VERSION}//ZH-CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_ics_text(config.title or '我的课表')}",
        f"X-WR-TIMEZONE:{TIMEZONE}",
        f"X-TERICS-VERSION:{APP_VERSION}",
        "BEGIN:VTIMEZONE",
        f"TZID:{TIMEZONE}",
        f"X-LIC-LOCATION:{TIMEZONE}",
        "BEGIN:STANDARD",
        "DTSTART:19700101T000000",
        "TZOFFSETFROM:+0800",
        "TZOFFSETTO:+0800",
        "TZNAME:CST",
        "END:STANDARD",
        "END:VTIMEZONE",
    ]

    for event in build.events:
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{event.uid}",
                f"DTSTAMP:{dtstamp}",
                f"DTSTART;TZID={TIMEZONE}:{event.start_date_time}",
                f"DTEND;TZID={TIMEZONE}:{event.end_date_time}",
                f"SUMMARY:{escape_ics_text(event.title)}",
            ]
        )
        if event.location:
            lines.append(f"LOCATION:{escape_ics_text(event.location)}")
        lines.extend(
            [
                f"DESCRIPTION:{escape_ics_text(_event_description(event))}",
                "STATUS:CONFIRMED",
                "TRANSP:OPAQUE",
                "SEQUENCE:0",
            ]
        )
        if config.alarm_minutes > 0:
            lines.extend(
                [
                    "BEGIN:VALARM",
                    "ACTION:DISPLAY",
                    f"TRIGGER:-PT{config.alarm_minutes}M",
                    f"DESCRIPTION:{escape_ics_text(event.title)}",
                    "END:VALARM",
                ]
            )
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    ics = "\r\n".join(fold_ics_line(line) for line in lines) + "\r\n"
    return IcsOutput(ics=ics, build=build)


def suggested_file_name(config: SemesterConfig) -> str:
    title = normalize_text(config.title or "我的课表")
    title = re.sub(r'[\\/:*?"<>|]+', "-", title)
    title = re.sub(r"\s+", "-", title)[:60]
    return f"{title}-{config.semester_start}.ics"


@dataclass(slots=True)
class IcsV2Output:
    ics: str
    events: list[TimetableEventV2]
    conflicts: list[object]


def generate_ics_v2(
    timetable: dict[str, object],
    now: datetime | None = None,
    alarm_minutes: int = 0,
) -> IcsV2Output:
    from .timetable_v2 import build_v2_events

    build = build_v2_events(timetable)
    if any(issue.severity == "error" for issue in build.issues) or not build.events:
        message = next((issue.message for issue in build.issues if issue.severity == "error"), "没有可导出的课程")
        raise TericsParseError(message, build.issues)
    term = timetable["term"]  # type: ignore[index]
    source = timetable["source"]  # type: ignore[index]
    timezone_id = str(term.get("timezone") or "Asia/Shanghai")  # type: ignore[union-attr]
    dtstamp = format_utc_stamp(now)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//terics//Timetable Bridge 0.5//ZH-CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_ics_text(term.get('termName') or '我的课表')}",  # type: ignore[union-attr]
        f"X-WR-TIMEZONE:{escape_ics_text(timezone_id)}",
        "X-TERICS-SCHEMA:2.0",
        f"X-TERICS-ADAPTER:{escape_ics_text(source.get('adapterId', ''))}",  # type: ignore[union-attr]
        f"X-TERICS-ADAPTER-VERSION:{escape_ics_text(source.get('adapterVersion', ''))}",  # type: ignore[union-attr]
        f"X-TERICS-TERM-ID:{escape_ics_text(term.get('termId', ''))}",  # type: ignore[union-attr]
        "BEGIN:VTIMEZONE",
        f"TZID:{escape_ics_text(timezone_id)}",
        f"X-LIC-LOCATION:{escape_ics_text(timezone_id)}",
        "BEGIN:STANDARD",
        "DTSTART:19700101T000000",
        "TZOFFSETFROM:+0800",
        "TZOFFSETTO:+0800",
        "TZNAME:CST",
        "END:STANDARD",
        "END:VTIMEZONE",
    ]
    for event in build.events:
        description = "\n".join(
            [
                f"教师：{event.teacher or '未提供'}",
                f"地点：{event.room or '未提供'}",
                f"节次：第 {event.start_period}-{event.end_period} 节",
                f"周次：{event.week_rule}",
                f"日期：{event.date}（{weekday_zh(event.weekday)}）",
                f"课程 ID：{event.course_id}",
                f"上课实例 ID：{event.meeting_id}",
            ]
        )
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{event.uid}",
                f"DTSTAMP:{dtstamp}",
                f"DTSTART;TZID={timezone_id}:{event.start_date_time}",
                f"DTEND;TZID={timezone_id}:{event.end_date_time}",
                f"SUMMARY:{escape_ics_text(event.title)}",
                f"X-TERICS-COURSE-ID:{escape_ics_text(event.course_id)}",
                f"X-TERICS-MEETING-ID:{escape_ics_text(event.meeting_id)}",
                f"X-TERICS-TERM-ID:{escape_ics_text(event.term_id)}",
            ]
        )
        if event.room:
            lines.append(f"LOCATION:{escape_ics_text(event.room)}")
        lines.extend(
            [
                f"DESCRIPTION:{escape_ics_text(description)}",
                "STATUS:CONFIRMED",
                "TRANSP:OPAQUE",
                "SEQUENCE:0",
            ]
        )
        if alarm_minutes > 0:
            lines.extend(
                [
                    "BEGIN:VALARM",
                    "ACTION:DISPLAY",
                    f"TRIGGER:-PT{alarm_minutes}M",
                    f"DESCRIPTION:{escape_ics_text(event.title)}",
                    "END:VALARM",
                ]
            )
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return IcsV2Output(
        ics="\r\n".join(fold_ics_line(line) for line in lines) + "\r\n",
        events=build.events,
        conflicts=list(build.conflicts),
    )


def suggested_ics_v2_file_name(timetable: dict[str, object]) -> str:
    term = timetable["term"]  # type: ignore[index]
    title = normalize_text(term.get("termName") or "我的课表")  # type: ignore[union-attr]
    title = re.sub(r'[\\/:*?"<>|]+', "-", title)
    title = re.sub(r"\s+", "-", title)[:60]
    return f"{title}-{term.get('semesterStart', 'unknown')}.ics"  # type: ignore[union-attr]
