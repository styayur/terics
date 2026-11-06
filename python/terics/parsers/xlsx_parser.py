from __future__ import annotations

from io import BytesIO

from openpyxl import load_workbook

from ..errors import TericsParseError
from ..models import FORMAT_LABELS, ParseIssue, ParseMetadata, ParseResult, RawCourse
from .html_parser import _parse_grid_matrix
from .tabular import dedupe_courses, parse_tabular_rows
from .xlsx_security import MAX_SHEETS, validate_worksheet_shape, validate_xlsx_zip


def _cell_value(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _candidate(matrix: list[list[object]], sheet_name: str) -> tuple[list[RawCourse], list[ParseIssue]] | None:
    candidates: list[tuple[list[RawCourse], list[ParseIssue]]] = []
    tabular = parse_tabular_rows(matrix, sheet_name)
    if tabular is not None:
        candidates.append((tabular[0], tabular[1]))
    grid = _parse_grid_matrix(matrix, sheet_name)
    if grid is not None:
        candidates.append((grid[0], grid[1]))
    if not candidates:
        return None
    return max(candidates, key=lambda item: len(item[0]))


def parse_xlsx(data: bytes, file_name: str) -> ParseResult:
    if not data:
        raise TericsParseError("XLSX 文件为空")
    validate_xlsx_zip(data)
    try:
        workbook = load_workbook(BytesIO(data), read_only=True, data_only=True, keep_links=False)
    except Exception as exc:
        raise TericsParseError(f"XLSX 文件损坏或不是有效的 Office Open XML 工作簿：{exc}") from exc

    issues: list[ParseIssue] = []
    courses: list[RawCourse] = []
    selected_sheets: list[str] = []
    source_rows = 0
    try:
        if len(workbook.worksheets) > MAX_SHEETS:
            raise TericsParseError(f"XLSX 工作表数超过 {MAX_SHEETS} 限制")
        for sheet in workbook.worksheets:
            validate_worksheet_shape(sheet.title, sheet.max_row or 0, sheet.max_column or 0)
            matrix = [
                [_cell_value(cell) for cell in row]
                for row in sheet.iter_rows(values_only=True)
            ]
            if len(matrix) < 2:
                continue
            candidate = _candidate(matrix, sheet.title)
            if candidate is None:
                continue
            selected_sheets.append(sheet.title)
            sheet_courses, sheet_issues = candidate
            courses.extend(sheet_courses)
            issues.extend(sheet_issues)
            source_rows += len(sheet_courses)
            if not sheet_courses:
                issues.append(
                    ParseIssue(
                        "warning",
                        "empty_sheet",
                        f"工作表“{sheet.title}”匹配布局但没有有效课程",
                    )
                )
    finally:
        workbook.close()

    if not selected_sheets:
        raise TericsParseError(
            f"{file_name} 中未找到可识别的课表工作表；支持“节次 + 周一…周日”网格，或课程/教师/周次/节次列格式。",
            [
                ParseIssue(
                    "error",
                    "xlsx_layout_unknown",
                    "工作簿中没有匹配的工作表布局",
                    hint="可参考 fixtures/xlsx/wakeup_schedule_template.xlsx。",
                )
            ],
        )

    deduped = dedupe_courses(courses, issues)
    if not deduped:
        raise TericsParseError("XLSX 工作簿解析完成，但没有可转换的课程", issues)

    has_errors = any(issue.severity == "error" for issue in issues)
    return ParseResult(
        format="xlsx",
        format_label=FORMAT_LABELS["xlsx"],
        confidence=0.85 if has_errors else 0.98,
        courses=deduped,
        issues=issues,
        metadata=ParseMetadata(sheet_name=", ".join(selected_sheets), source_rows=source_rows),
    )
