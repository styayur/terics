from __future__ import annotations

import csv
import io

from ..errors import TericsParseError
from ..models import FORMAT_LABELS, ParseMetadata, ParseResult
from .tabular import parse_tabular_rows


def parse_csv(text: str, file_name: str) -> ParseResult:
    input_text = text.lstrip("\ufeff")
    if not input_text.strip():
        raise TericsParseError("CSV 文件为空或只包含空白字符")

    sample = input_text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    try:
        rows = [row for row in csv.reader(io.StringIO(input_text), dialect) if any(cell.strip() for cell in row)]
    except csv.Error as exc:
        raise TericsParseError(f"CSV 语法错误：{exc}") from exc

    if not rows:
        raise TericsParseError("CSV 没有可解析的数据行")
    table = parse_tabular_rows(rows, f"{file_name} CSV")
    if table is None:
        raise TericsParseError("未找到 CSV 表头。至少需要课程、周次，以及星期或时间列。")
    courses, issues, _header = table
    if not courses:
        raise TericsParseError("CSV 表头有效，但没有可转换的课程行", issues)

    has_errors = any(issue.severity == "error" for issue in issues)
    return ParseResult(
        format="csv",
        format_label=FORMAT_LABELS["csv"],
        confidence=0.86 if has_errors else 0.99,
        courses=courses,
        issues=issues,
        metadata=ParseMetadata(
            source_rows=max(0, len(rows) - 1),
            detected_encoding="由内容嗅探确定",
        ),
    )
