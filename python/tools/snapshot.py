from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from terics.course import build_events  # noqa: E402
from terics.models import DEFAULT_PERIODS, TIMEZONE, SemesterConfig  # noqa: E402
from terics.parsers import parse_timetable_file  # noqa: E402

FIXTURES = [
    "fixtures/csv/terics_sample.csv",
    "fixtures/html/qingguo_list_sample.xls",
    "fixtures/html/wakeup_usc_sample.html",
    "fixtures/xlsx/wakeup_schedule_template.xlsx",
]

CONFIG = SemesterConfig(
    title="一致性测试课表",
    semester_start="2026-08-31",
    timezone=TIMEZONE,
    periods=DEFAULT_PERIODS,
    alarm_minutes=10,
)


def course_dict(course: object) -> dict[str, object]:
    return {
        "name": course.name,
        "teacher": course.teacher,
        "location": course.location,
        "weekday": course.weekday,
        "startPeriod": course.start_period,
        "endPeriod": course.end_period,
        "weeks": list(course.weeks),
        "note": course.note,
    }


def event_dict(event: object) -> dict[str, object]:
    return {
        "uid": event.uid,
        "title": event.title,
        "teacher": event.teacher,
        "location": event.location,
        "weekday": event.weekday,
        "startPeriod": event.start_period,
        "endPeriod": event.end_period,
        "week": event.week,
        "date": event.date,
        "start": event.start,
        "end": event.end,
    }


snapshot: list[dict[str, object]] = []
for fixture in FIXTURES:
    parsed = parse_timetable_file(ROOT / fixture)
    built = build_events(CONFIG, parsed.courses)
    course_items = [course_dict(course) for course in parsed.courses]
    courses = sorted(
        course_items,
        key=lambda item: (
            str(item["name"]),
            int(item["weekday"]),
            int(item["startPeriod"]),
            int(item["endPeriod"]),
            ",".join(str(value) for value in item["weeks"]),
        ),
    )
    events = sorted((event_dict(event) for event in built.events), key=lambda item: str(item["uid"]))
    snapshot.append(
        {
            "fixture": fixture,
            "format": parsed.format,
            "courses": courses,
            "events": events,
            "conflictCount": len(built.conflicts),
        }
    )

sys.stdout.write(json.dumps(snapshot, ensure_ascii=False, indent=2))
