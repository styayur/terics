from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

APP_VERSION = "0.5.0-rc.1"
TIMEZONE = "Asia/Shanghai"
DEFAULT_MAX_WEEK = 30

InputFormat = Literal["csv", "html", "xlsx"]
IssueSeverity = Literal["error", "warning", "info"]

FORMAT_LABELS: dict[InputFormat, str] = {
    "csv": "CSV 课程清单",
    "html": "HTML 教务课表",
    "xlsx": "XLSX 网格课表",
}


@dataclass(slots=True)
class ParseIssue:
    severity: IssueSeverity
    code: str
    message: str
    row: int | None = None
    hint: str | None = None


@dataclass(slots=True)
class RawCourse:
    name: str
    teacher: str
    location: str
    weekday: int
    start_period: int
    end_period: int
    weeks: list[int]
    week_rule: str
    note: str = ""
    source_ref: str = ""


@dataclass(slots=True)
class ParseMetadata:
    detected_encoding: str | None = None
    sheet_name: str | None = None
    table_count: int | None = None
    source_rows: int | None = None


@dataclass(slots=True)
class ParseResult:
    format: InputFormat
    format_label: str
    confidence: float
    courses: list[RawCourse]
    issues: list[ParseIssue] = field(default_factory=list)
    metadata: ParseMetadata = field(default_factory=ParseMetadata)


@dataclass(slots=True)
class PeriodTime:
    index: int
    start: str
    end: str
    label: str | None = None


@dataclass(slots=True)
class SemesterConfig:
    title: str
    semester_start: str
    timezone: str
    periods: list[PeriodTime]
    alarm_minutes: int = 0


@dataclass(slots=True)
class CalendarEvent:
    uid: str
    title: str
    teacher: str
    location: str
    note: str
    weekday: int
    start_period: int
    end_period: int
    week: int
    date: str
    start: str
    end: str
    start_date_time: str
    end_date_time: str
    week_rule: str


@dataclass(slots=True)
class Conflict:
    date: str
    start: str
    end: str
    event_indexes: list[int]
    labels: list[str]


@dataclass(slots=True)
class BuildResult:
    events: list[CalendarEvent]
    conflicts: list[Conflict]
    issues: list[ParseIssue]


@dataclass(slots=True)
class TimetableEventV2:
    uid: str
    course_id: str
    meeting_id: str
    title: str
    teacher: str
    room: str
    campus: str
    note: str
    weekday: int
    start_period: int
    end_period: int
    week: int
    date: str
    start: str
    end: str
    start_date_time: str
    end_date_time: str
    week_rule: str
    adapter_id: str
    adapter_version: str
    school_id: str
    term_id: str


@dataclass(slots=True)
class BuildV2Result:
    events: list[TimetableEventV2]
    conflicts: list[Conflict]
    issues: list[ParseIssue]


DEFAULT_PERIODS: list[PeriodTime] = [
    PeriodTime(1, "08:00", "08:45"),
    PeriodTime(2, "08:55", "09:40"),
    PeriodTime(3, "10:00", "10:45"),
    PeriodTime(4, "10:55", "11:40"),
    PeriodTime(5, "14:00", "14:45"),
    PeriodTime(6, "14:55", "15:40"),
    PeriodTime(7, "16:00", "16:45"),
    PeriodTime(8, "16:55", "17:40"),
    PeriodTime(9, "19:00", "19:45"),
    PeriodTime(10, "19:55", "20:40"),
    PeriodTime(11, "20:50", "21:35"),
    PeriodTime(12, "21:45", "22:30"),
]
