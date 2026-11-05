from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

from ..errors import TericsParseError
from ..models import ParseIssue, ParseMetadata, ParseResult, RawCourse
from ..weeks import (
    clean_cell_text,
    clean_course_name,
    clean_teacher,
    extract_week_rule,
    parse_period_range,
    parse_weekday,
    parse_weeks_detailed,
    weekday_token,
)
from .tabular import dedupe_courses, parse_tabular_rows

REMOVE_TAGS = ("script", "style", "noscript", "template", "iframe", "object", "svg", "img")
BLOCK_TAGS = ("div", "p", "li", "tr")


def _span_value(cell: Tag, name: str) -> int:
    try:
        value = int(str(cell.get(name, 1)))
    except ValueError:
        return 1
    return value if 1 <= value <= 50 else 1


def _cell_text(cell: Tag) -> str:
    clone = BeautifulSoup(str(cell), "html.parser")
    for tag in clone.find_all(REMOVE_TAGS):
        tag.decompose()
    for tag in clone.find_all("br"):
        tag.replace_with("\n")
    for tag in clone.find_all(BLOCK_TAGS):
        tag.append("\n")
    return clean_cell_text(clone.get_text())


def _table_to_matrix(table: Tag) -> list[list[str]]:
    grid: list[list[str | None]] = []
    rows = table.find_all("tr")
    for row_index, row in enumerate(rows):
        if row_index >= len(grid):
            grid.append([])
        column_index = 0
        for cell in row.find_all(["td", "th"], recursive=False):
            while column_index < len(grid[row_index]) and grid[row_index][column_index] is not None:
                column_index += 1
            text = _cell_text(cell)
            row_span = _span_value(cell, "rowspan")
            col_span = _span_value(cell, "colspan")
            for row_offset in range(row_span):
                target_row = row_index + row_offset
                while len(grid) <= target_row:
                    grid.append([])
                while len(grid[target_row]) < column_index + col_span:
                    grid[target_row].append(None)
                for col_offset in range(col_span):
                    grid[target_row][column_index + col_offset] = text
            column_index += col_span
    width = max((len(row) for row in grid), default=0)
    return [[cell or "" for cell in row] + [""] * (width - len(row)) for row in grid]


def _split_blocks(raw: str) -> list[str]:
    normalized = clean_cell_text(raw)
    normalized = re.sub(r"<br\s*/?>", "\n", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\n?\s*[-—–_=]{3,}\s*\n?", "\n---TERICS-SEP---\n", normalized)
    return [part.strip() for part in re.split(r"\n?---TERICS-SEP---\n?|\n{2,}", normalized) if part.strip()]


def _clean_trailing_meta(value: str) -> str:
    value = re.sub(r"(?:星期|周|礼拜)\s*[一二三四五六日天1-7]\s*$", "", value)
    value = re.sub(r"[（(]\s*[）)]", "", value)
    value = re.sub(r"[|,，;；{}\[\]\s]+$", "", value)
    return value.strip()


def _parse_pipe_entry(block: str, context: dict[str, object]) -> RawCourse | None:
    if "|" not in block:
        return None
    tokens = [clean_cell_text(token) for token in block.split("|") if clean_cell_text(token)]
    if len(tokens) < 2:
        return None

    week_marker = next((index for index, token in enumerate(tokens) if re.search(r"周次|weeks?", token, re.I)), -1)
    teacher_marker = next((index for index, token in enumerate(tokens) if re.search(r"老师|教师|teacher", token, re.I)), -1)
    if week_marker < 0:
        return None

    week_token = tokens[week_marker + 1] if week_marker + 1 < len(tokens) else ""
    week_result = parse_weeks_detailed(week_token)
    if week_result.error:
        return None

    teacher = ""
    if teacher_marker >= 0:
        teacher = " ".join(tokens[teacher_marker + 1 : week_marker])
    elif len(tokens) >= 3:
        teacher = tokens[2]

    location_marker = next(
        (index for index, token in enumerate(tokens) if re.search(r"教室|地点|location|room", token, re.I)),
        -1,
    )
    location = " ".join(tokens[location_marker + 1 :]) if location_marker >= 0 else ""
    return RawCourse(
        name=clean_course_name(tokens[0]),
        teacher=clean_teacher(teacher),
        location=clean_cell_text(location),
        weekday=int(context["weekday"]),
        start_period=int(context["start_period"]),
        end_period=int(context["end_period"]),
        weeks=week_result.weeks,
        week_rule=week_token or week_result.normalized,
        source_ref=str(context["source_ref"]),
    )


def _parse_freeform_entry(block: str, context: dict[str, object]) -> RawCourse | None:
    week_match = extract_week_rule(block)
    if week_match is None:
        return None
    week_result = parse_weeks_detailed(week_match.rule)
    if week_result.error:
        return None

    before = re.sub(r"[{([]\s*$", "", block[: week_match.index]).strip()
    after = re.sub(r"^[\s})\]}]+", "", block[week_match.index + week_match.length :]).strip()
    course_line = next(
        (
            _clean_trailing_meta(line)
            for line in reversed(before.splitlines())
            if _clean_trailing_meta(line)
        ),
        "",
    )
    name = clean_course_name(course_line)
    if not name:
        return None

    after_lines = [clean_cell_text(line) for line in after.splitlines() if clean_cell_text(line)]
    teacher = ""
    location = ""
    if len(after_lines) >= 2:
        teacher = after_lines[0]
        location = " ".join(after_lines[1:])
    elif after_lines:
        tokens = [token for token in re.split(r"\s+", after_lines[0]) if token]
        teacher = tokens[0] if tokens else ""
        location = " ".join(tokens[1:])
    location = re.sub(r"\[[^\]]*\]", " ", location)
    return RawCourse(
        name=name,
        teacher=clean_teacher(teacher),
        location=clean_cell_text(location),
        weekday=int(context["weekday"]),
        start_period=int(context["start_period"]),
        end_period=int(context["end_period"]),
        weeks=week_result.weeks,
        week_rule=week_match.rule,
        source_ref=str(context["source_ref"]),
    )


def _parse_grid_cell(raw: str, context: dict[str, object]) -> tuple[RawCourse | None, ParseIssue | None]:
    block = clean_cell_text(raw)
    if not block or re.fullmatch(r"(?:无|空|休息|-|—|--|/)", block):
        return None, None
    try:
        course = _parse_pipe_entry(block, context) or _parse_freeform_entry(block, context)
        if course and course.name:
            return course, None
        return None, ParseIssue(
            "error",
            "unrecognized_cell",
            f"{context['source_ref']} 无法识别课程内容：{block[:80]}",
            hint="支持管道字段格式，或 `课程名 {第1-16周 教师 地点` / 多行格式。",
        )
    except Exception as exc:  # noqa: BLE001 - user-facing parse isolation
        return None, ParseIssue(
            "error",
            "cell_parse_error",
            f"{context['source_ref']} 解析失败：{exc}",
        )


def _find_weekday_header(matrix: list[list[object]]) -> tuple[int, dict[int, int]] | None:
    for row_index, row in enumerate(matrix[:15]):
        columns: dict[int, int] = {}
        for column_index, cell in enumerate(row):
            weekday = parse_weekday(cell)
            if weekday:
                columns[column_index] = weekday
        if len(columns) >= 2:
            return row_index, columns
    return None


def _parse_grid_matrix(
    matrix: list[list[object]], label: str
) -> tuple[list[RawCourse], list[ParseIssue], int] | None:
    header = _find_weekday_header(matrix)
    if header is None:
        return None
    header_row, columns = header
    issues: list[ParseIssue] = []
    courses: list[RawCourse] = []

    for row_index in range(header_row + 1, len(matrix)):
        row = matrix[row_index]
        first = clean_cell_text(row[0] if row else "")
        period = parse_period_range(first)
        if period is None and not first:
            inferred = row_index - header_row
            period = parse_period_range(str(inferred)) if inferred >= 1 else None
        if period is None:
            continue
        if period.start < 1 or period.end > 30:
            issues.append(
                ParseIssue(
                    "error",
                    "period_out_of_range",
                    f"{label} 第 {row_index + 1} 行节次超出支持范围：{period.start}-{period.end}",
                    row=row_index + 1,
                )
            )
            continue

        for column_index, weekday in columns.items():
            raw = clean_cell_text(row[column_index] if column_index < len(row) else "")
            if not raw:
                continue
            context: dict[str, object] = {
                "weekday": weekday,
                "start_period": period.start,
                "end_period": period.end,
                "source_ref": f"{label} 第 {row_index + 1} 行 / {weekday_token(weekday)}",
            }
            for block in _split_blocks(raw):
                course, issue = _parse_grid_cell(block, context)
                if course:
                    courses.append(course)
                if issue:
                    issues.append(issue)

    return dedupe_courses(courses, issues), issues, header_row


def parse_html(html: str, file_name: str) -> ParseResult:
    if not html.strip():
        raise TericsParseError("HTML 文件为空")
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    if not tables:
        raise TericsParseError("HTML 中没有找到 <table> 课表")

    issues: list[ParseIssue] = []
    courses: list[RawCourse] = []
    grid_detected = False
    list_detected = False

    for table_index, table in enumerate(tables[:100]):
        matrix = _table_to_matrix(table)
        if len(matrix) < 2 or not any(any(cell.strip() for cell in row) for row in matrix):
            continue
        label = f"{file_name} 表格 {table_index + 1}"

        tabular = parse_tabular_rows(matrix, label)
        if tabular is not None:
            list_detected = True
            timetable_courses, timetable_issues, _header = tabular
            courses.extend(timetable_courses)
            issues.extend(timetable_issues)
            continue

        grid = _parse_grid_matrix(matrix, label)
        if grid is not None:
            grid_detected = True
            grid_courses, grid_issues, _header = grid
            courses.extend(grid_courses)
            issues.extend(grid_issues)

    deduped = dedupe_courses(courses, issues)
    if not deduped:
        fallback = issues or [
            ParseIssue(
                "error",
                "no_courses",
                "HTML 中没有可转换的有效课程行",
                hint="可参考 docs/formats.md 中的 HTML 示例。",
            )
        ]
        raise TericsParseError("HTML 表格未识别出课程；请确认包含星期表头，或课程/教师/周次/节次列", fallback)

    has_errors = any(issue.severity == "error" for issue in issues)
    return ParseResult(
        format="html",
        format_label="HTML 列表式课表" if list_detected and not grid_detected else "HTML 周网格课表",
        confidence=0.84 if has_errors else 0.97,
        courses=deduped,
        issues=issues,
        metadata=ParseMetadata(table_count=len(tables), source_rows=len(courses)),
    )
