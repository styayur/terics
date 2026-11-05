from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

from ..models import ParseIssue, RawCourse
from ..weeks import (
    clean_cell_text,
    clean_course_name,
    clean_teacher,
    extract_week_rule,
    normalize_text,
    parse_period_range,
    parse_weekday,
    parse_weeks_detailed,
)

CanonicalColumn = str

HEADER_ALIASES: dict[str, CanonicalColumn] = {
    "课程": "name",
    "课程名": "name",
    "课程名称": "name",
    "name": "name",
    "course": "name",
    "coursename": "name",
    "教师": "teacher",
    "老师": "teacher",
    "任课教师": "teacher",
    "上课教师": "teacher",
    "teacher": "teacher",
    "地点": "location",
    "教室": "location",
    "上课地点": "location",
    "location": "location",
    "room": "location",
    "星期": "weekday",
    "周几": "weekday",
    "星期几": "weekday",
    "weekday": "weekday",
    "day": "weekday",
    "节次": "periods",
    "节": "periods",
    "sections": "periods",
    "periods": "periods",
    "周次": "weeks",
    "教学周": "weeks",
    "weeks": "weeks",
    "时间": "time",
    "上课时间": "time",
    "上课时间地点": "time",
    "时间地点": "time",
    "time": "time",
    "备注": "note",
    "note": "note",
    "notes": "note",
}


def normalize_header(value: object) -> str:
    text = unicodedata.normalize("NFKC", normalize_text(value)).lower()
    return re.sub(r"[\s_\-:：/\\()（）\[\]【】]+", "", text)


def canonical_header(value: object) -> str | None:
    return HEADER_ALIASES.get(normalize_header(value))


def find_tabular_header(matrix: list[list[object]]) -> tuple[int, dict[str, int]] | None:
    for row_index, row in enumerate(matrix[:25]):
        columns: dict[str, int] = {}
        for column_index, cell in enumerate(row):
            canonical = canonical_header(cell)
            if canonical and canonical not in columns:
                columns[canonical] = column_index
        if "name" in columns and any(key in columns for key in ("weeks", "periods", "time")):
            return row_index, columns
    return None


def _value_at(row: list[object], index: int | None) -> str:
    if index is None or index >= len(row):
        return ""
    return clean_cell_text(row[index])


def _cleanup_combined_location(text: str, week_rule: str | None, period_raw: str | None) -> str:
    location = text
    if week_rule:
        location = location.replace(week_rule, " ", 1)
    if period_raw:
        location = location.replace(period_raw, " ", 1)
    location = re.sub(r"(?:星期|周|礼拜)\s*[一二三四五六日天1-7]", " ", location)
    location = re.sub(r"(^|\s)[一二三四五六日天](?=\s|$)", " ", location)
    location = re.sub(r"\[[^\]]*\]", " ", location)
    location = re.sub(r"[（(]\s*[）)]", " ", location)
    location = re.sub(r"[;,，；、|]+", " ", location)
    return re.sub(r"\s+", " ", location).strip()


def dedupe_courses(courses: Iterable[RawCourse], issues: list[ParseIssue]) -> list[RawCourse]:
    seen: set[tuple[object, ...]] = set()
    result: list[RawCourse] = []
    for course in courses:
        key = (
            course.name,
            course.teacher,
            course.location,
            course.weekday,
            course.start_period,
            course.end_period,
            tuple(course.weeks),
            course.note,
        )
        if key in seen:
            issues.append(
                ParseIssue(
                    "warning",
                    "duplicate_course",
                    f"已合并重复课程：{course.name}（{course.source_ref or '未知位置'}）",
                )
            )
            continue
        seen.add(key)
        result.append(course)
    return result


def parse_tabular_rows(
    matrix: list[list[object]], source_label: str
) -> tuple[list[RawCourse], list[ParseIssue], int] | None:
    header = find_tabular_header(matrix)
    if header is None:
        return None
    header_row, columns = header
    issues: list[ParseIssue] = []
    courses: list[RawCourse] = []

    for row_index in range(header_row + 1, len(matrix)):
        row = matrix[row_index]
        if all(not normalize_text(cell) for cell in row):
            continue
        source_row = row_index + 1
        name = clean_course_name(_value_at(row, columns.get("name")))
        if not name:
            continue

        teacher = clean_teacher(_value_at(row, columns.get("teacher")))
        configured_location = clean_cell_text(_value_at(row, columns.get("location")))
        note = clean_cell_text(_value_at(row, columns.get("note")))
        weekday_raw = _value_at(row, columns.get("weekday"))
        periods_raw = _value_at(row, columns.get("periods"))
        weeks_raw = _value_at(row, columns.get("weeks"))
        combined_raw = _value_at(row, columns.get("time"))

        time_segments = (
            [part.strip() for part in re.split(r"[；;]", combined_raw) if part.strip()]
            if combined_raw
            else [periods_raw or combined_raw]
        )

        added_for_row = 0
        for segment in time_segments:
            week_match = extract_week_rule(weeks_raw or segment)
            week_rule = week_match.rule if week_match else weeks_raw
            week_result = parse_weeks_detailed(week_rule)
            if week_result.error:
                issues.append(
                    ParseIssue(
                        "error",
                        "invalid_weeks",
                        f"第 {source_row} 行周次无效：{week_result.error}",
                        row=source_row,
                        hint="示例：1-16、1-8,10-16、1-16单、2-16双",
                    )
                )
                continue

            period = parse_period_range(periods_raw or segment)
            if period is None:
                issues.append(
                    ParseIssue(
                        "error",
                        "invalid_periods",
                        f"第 {source_row} 行节次无效：{segment or '（空）'}",
                        row=source_row,
                        hint="示例：1-2、第3-4节、[05-06节]",
                    )
                )
                continue
            if period.start < 1 or period.end > 30:
                issues.append(
                    ParseIssue(
                        "error",
                        "period_out_of_range",
                        f"第 {source_row} 行节次超出支持范围 1–30：{period.start}-{period.end}",
                        row=source_row,
                    )
                )
                continue

            location = configured_location
            weekday = parse_weekday(weekday_raw) or parse_weekday(segment)
            if not weekday:
                issues.append(
                    ParseIssue(
                        "error",
                        "invalid_weekday",
                        f"第 {source_row} 行无法识别星期：{weekday_raw or segment or '（空）'}",
                        row=source_row,
                        hint="支持周一至周日、星期一至星期日、1–7 或 Monday–Sunday",
                    )
                )
                continue

            if not location and segment:
                location = _cleanup_combined_location(segment, week_match.rule if week_match else None, period.raw)
            if not teacher and "|" in segment:
                parts = [part for part in segment.split("|") if re.search(r"老师|教师|teacher", part, re.I)]
                teacher = clean_teacher(parts[0] if parts else "")

            courses.append(
                RawCourse(
                    name=name,
                    teacher=teacher,
                    location=location,
                    weekday=weekday,
                    start_period=period.start,
                    end_period=period.end,
                    weeks=week_result.weeks,
                    week_rule=week_rule or week_result.normalized,
                    note=note,
                    source_ref=f"{source_label} 第 {source_row} 行",
                )
            )
            added_for_row += 1

        if added_for_row == 0:
            issues.append(
                ParseIssue(
                    "warning",
                    "row_skipped",
                    f"第 {source_row} 行没有生成课程，请检查时间字段。",
                    row=source_row,
                )
            )

    return dedupe_courses(courses, issues), issues, header_row
