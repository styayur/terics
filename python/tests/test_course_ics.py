from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import pytest
from icalendar import Calendar

from terics.course import build_events
from terics.errors import TericsParseError
from terics.ics import escape_ics_text, generate_ics
from terics.models import DEFAULT_PERIODS, TIMEZONE, PeriodTime, RawCourse, SemesterConfig
from terics.parsers import parse_timetable_bytes

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def read_fixture(relative: str) -> bytes:
    return (FIXTURES / relative).read_bytes()


def config(periods: list[PeriodTime] | None = None, title: str = "2026 秋季课表") -> SemesterConfig:
    return SemesterConfig(
        title=title,
        semester_start="2026-08-31",
        timezone=TIMEZONE,
        periods=[replace(period) for period in (periods or DEFAULT_PERIODS)],
        alarm_minutes=10,
    )


def sample_courses() -> list[RawCourse]:
    return parse_timetable_bytes(read_fixture("csv/terics_sample.csv"), "courses.csv").courses


def test_event_generation_cross_year_and_uid_stability() -> None:
    courses = sample_courses()
    result = build_events(config(), courses)
    assert not [issue for issue in result.issues if issue.severity == "error"]
    assert len(result.events) == 62
    first_math = next(event for event in result.events if event.title == "高等数学A" and event.week == 1)
    assert (first_math.date, first_math.start, first_math.end) == ("2026-08-31", "08:00", "09:40")
    cross_year = next(event for event in result.events if event.title == "跨月实验" and event.week == 18)
    assert (cross_year.date, cross_year.start, cross_year.end) == ("2027-01-02", "19:00", "20:40")

    duplicated = build_events(config(), [*courses, courses[0]])
    assert len(duplicated.events) == len(result.events)

    shifted_periods = [replace(period) for period in DEFAULT_PERIODS]
    shifted_periods[0].start = "08:10"
    shifted_periods[0].end = "08:55"
    shifted = build_events(config(shifted_periods), courses)
    assert shifted.events[0].uid == result.events[0].uid
    assert shifted.events[0].start == "08:10"


def test_conflict_detection() -> None:
    parsed = parse_timetable_bytes(read_fixture("csv/conflict_sample.csv"), "conflict.csv")
    result = build_events(config(), parsed.courses)
    assert len(result.conflicts) == 2
    assert any(issue.code == "course_conflict" for issue in result.issues)


def test_invalid_semester_and_periods() -> None:
    courses = sample_courses()
    wrong_day = config()
    wrong_day.semester_start = "2026-09-01"
    result = build_events(wrong_day, courses)
    assert result.issues[0].code == "semester_start_not_monday"

    invalid_periods = [replace(period) for period in DEFAULT_PERIODS]
    invalid_periods[1].end = "07:00"
    invalid = build_events(config(invalid_periods), courses)
    assert any(issue.code == "period_time_order" for issue in invalid.issues)


def test_ics_rfc_shape_and_independent_parse() -> None:
    output = generate_ics(
        config(),
        sample_courses(),
        now=datetime(2026, 8, 1, tzinfo=UTC),
    )
    ics = output.ics
    assert ics.endswith("\r\n")
    assert "\n" not in ics.replace("\r\n", "")
    assert all(len(line.encode("utf-8")) <= 75 for line in ics.split("\r\n") if line)
    assert "BEGIN:VTIMEZONE" in ics
    assert "DTSTAMP:20260801T000000Z" in ics

    calendar = Calendar.from_ical(ics)
    events = calendar.walk("VEVENT")
    assert len(events) == 62
    math = next(event for event in events if str(event["SUMMARY"]) == "高等数学A")
    assert str(math["DTSTART"].to_ical().decode("ascii")) == "20260831T080000"
    assert math["DTSTART"].params["TZID"] == "Asia/Shanghai"


def test_ics_text_escaping_blocks_event_injection() -> None:
    output = generate_ics(
        config(title="安全,课表;测试"),
        [
            RawCourse(
                name="正常课\r\nBEGIN:VEVENT\r\nSUMMARY:注入",
                teacher="张,老师;测试\\路径",
                location="A101\r\nEND:VEVENT",
                weekday=1,
                start_period=1,
                end_period=2,
                weeks=[1],
                week_rule="1",
                note="第一行\n第二行",
            )
        ],
        now=datetime(2026, 8, 1, tzinfo=UTC),
    )
    assert "\r\nBEGIN:VEVENT\r\nSUMMARY:注入" not in output.ics
    calendar = Calendar.from_ical(output.ics)
    events = calendar.walk("VEVENT")
    assert len(events) == 1
    assert "BEGIN:VEVENT" in str(events[0]["SUMMARY"])
    assert "\n" in str(events[0]["SUMMARY"])
    assert escape_ics_text("a,b;c\\d\ne") == "a\\,b\\;c\\\\d\\ne"


def test_ics_requires_valid_configuration() -> None:
    bad = config()
    bad.semester_start = "2026-09-01"
    with pytest.raises(TericsParseError):
        generate_ics(bad, sample_courses())
