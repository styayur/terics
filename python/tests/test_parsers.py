from pathlib import Path

import pytest

from terics.errors import TericsParseError
from terics.parsers import parse_timetable_bytes

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def read_fixture(relative: str) -> bytes:
    return (FIXTURES / relative).read_bytes()


def test_csv_and_gb18030_content_detection() -> None:
    result = parse_timetable_bytes(read_fixture("csv/terics_sample.csv"), "courses.bin")
    assert result.format == "csv"
    assert len(result.courses) == 6
    assert result.courses[0].name == "高等数学A"
    assert result.courses[0].teacher == "张伟"
    assert result.metadata.detected_encoding == "utf-8"

    legacy = parse_timetable_bytes(read_fixture("csv/terics_sample_gb18030.csv"), "legacy.csv")
    assert legacy.metadata.detected_encoding == "gb18030"
    assert len(legacy.courses) == 6


def test_html_qingguo_and_wakeup_samples() -> None:
    qingguo = parse_timetable_bytes(read_fixture("html/qingguo_list_sample.xls"), "qingguo.xls")
    assert qingguo.format == "html"
    assert len(qingguo.courses) == 5
    programming = next(course for course in qingguo.courses if course.name == "程序设计基础")
    assert programming.weekday == 2
    assert programming.start_period == 5
    assert programming.end_period == 6
    assert programming.weeks == [1, 3, 5, 7, 9, 11, 13, 15]

    wakeup = parse_timetable_bytes(read_fixture("html/wakeup_usc_sample.html"), "wakeup.csv")
    assert wakeup.format == "html"
    assert len(wakeup.courses) == 7


def test_xlsx_fixture_detected_by_zip_signature() -> None:
    result = parse_timetable_bytes(read_fixture("xlsx/wakeup_schedule_template.xlsx"), "renamed.csv")
    assert result.format == "xlsx"
    assert len(result.courses) == 5
    linear = next(course for course in result.courses if course.name == "线性代数")
    assert linear.weekday == 3
    assert linear.start_period == 1
    assert linear.end_period == 1
    assert linear.weeks == [1, 3, 5, 7, 9, 11, 13, 15]


def test_html_scripts_are_ignored() -> None:
    result = parse_timetable_bytes(read_fixture("invalid/malicious.html"), "malicious.html")
    assert result.courses[0].name == "安全课"


@pytest.mark.parametrize(
    ("data", "name", "message"),
    [
        (b"", "empty", "为空"),
        (b"PK\x03\x04\x01\x02", "fake.xlsx", "损坏"),
        (bytes.fromhex("d0cf11e0a1b11ae1"), "legacy.xls", "旧版二进制 XLS"),
        (read_fixture("invalid/no_table.html"), "no-table.html", "没有找到 <table>"),
        (read_fixture("invalid/header_only.csv"), "header-only.csv", "没有可转换的课程"),
    ],
)
def test_bad_inputs(data: bytes, name: str, message: str) -> None:
    with pytest.raises(TericsParseError, match=message):
        parse_timetable_bytes(data, name)


def test_size_limit() -> None:
    with pytest.raises(TericsParseError, match="10 MiB"):
        parse_timetable_bytes(b"x" * (10 * 1024 * 1024 + 1), "huge.csv")
