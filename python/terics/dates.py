from __future__ import annotations

import re
from datetime import UTC, date, datetime, timedelta


def parse_iso_date(value: str) -> date:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(f"日期必须使用 YYYY-MM-DD 格式：{value}")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"无效日期：{value}") from exc
    return parsed


def monday_of_iso(value: str) -> str:
    parsed = parse_iso_date(value)
    return (parsed - timedelta(days=parsed.weekday())).isoformat()


def is_monday(value: str) -> bool:
    return parse_iso_date(value).weekday() == 0


def date_for_class(semester_start: str, week: int, weekday: int) -> str:
    if not isinstance(week, int) or week < 1:
        raise ValueError(f"周次必须是正整数：{week}")
    if not isinstance(weekday, int) or weekday < 1 or weekday > 7:
        raise ValueError(f"星期必须在 1–7 之间：{weekday}")
    start = parse_iso_date(semester_start)
    return (start + timedelta(days=(week - 1) * 7 + weekday - 1)).isoformat()


def format_utc_stamp(value: datetime | None = None) -> str:
    current = value or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    return current.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def weekday_zh(weekday: int) -> str:
    values = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    return values[weekday] if 0 < weekday < len(values) else f"周{weekday}"


def assert_time(value: str, label: str) -> str:
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
        raise ValueError(f"{label}必须是 HH:mm 格式，且在 00:00–23:59 之间：{value}")
    return value


def compact_local_date_time(day: str, clock: str) -> str:
    return f"{day.replace('-', '')}T{clock.replace(':', '')}00"


def time_to_minutes(value: str) -> int:
    assert_time(value, "时间")
    hours, minutes = (int(part) for part in value.split(":"))
    return hours * 60 + minutes
