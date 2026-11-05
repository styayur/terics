from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from .course import build_events
from .dates import format_utc_stamp, weekday_zh
from .errors import TericsParseError
from .models import APP_VERSION, TIMEZONE, BuildResult, CalendarEvent, RawCourse, SemesterConfig
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
