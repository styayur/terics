from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from terics.course import build_events  # noqa: E402
from terics.models import DEFAULT_PERIODS, TIMEZONE, SemesterConfig, TimetableEventV2  # noqa: E402
from terics.parsers import parse_timetable_file  # noqa: E402
from terics.timetable_v2 import build_v2_events, parse_terics_json  # noqa: E402

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



v2_timetable = parse_terics_json((ROOT / "fixtures/exchange/overrides.terics.json").read_text(encoding="utf-8"))
v2_build = build_v2_events(v2_timetable)
def v2_event_dict(event: TimetableEventV2) -> dict[str, object]:
    return {
        "uid": event.uid,
        "title": event.title,
        "teacher": event.teacher,
        "location": event.room,
        "weekday": event.weekday,
        "startPeriod": event.start_period,
        "endPeriod": event.end_period,
        "week": event.week,
        "date": event.date,
        "start": event.start,
        "end": event.end,
    }

snapshot.append(
    {
        "fixture": "fixtures/exchange/overrides.terics.json",
        "format": "terics-v2",
        "courses": sorted(
            [
                {
                    "id": course["id"],
                    "name": course["name"],
                    "meetings": sorted(
                        [
                            {
                                "id": meeting["id"],
                                "teacher": meeting.get("teacher", ""),
                                "room": meeting.get("room", ""),
                                "weekday": meeting["weekday"],
                                "startPeriod": meeting["startPeriod"],
                                "endPeriod": meeting["endPeriod"],
                                "weeks": list(meeting["weeks"]),
                            }
                            for meeting in course["meetings"]
                        ],
                        key=lambda item: str(item["id"]),
                    ),
                }
                for course in v2_timetable["courses"]
            ],
            key=lambda item: str(item["id"]),
        ),
        "events": sorted((v2_event_dict(event) for event in v2_build.events), key=lambda item: str(item["uid"])),
        "conflictCount": len(v2_build.conflicts),
    }
)

sys.stdout.write(json.dumps(snapshot, ensure_ascii=False, indent=2))
