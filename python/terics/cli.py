from __future__ import annotations

import argparse
import sys
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

from .errors import TericsParseError
from .ics import generate_ics, suggested_file_name
from .models import DEFAULT_PERIODS, TIMEZONE, SemesterConfig
from .parsers import parse_timetable_file


def _default_start() -> str:
    today = date.today()
    anchor = date(today.year, 9, 1) if today.month >= 7 else date(today.year, 3, 1)
    return (anchor - timedelta(days=anchor.weekday())).isoformat()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="terics 课表转 ICS")
    parser.add_argument("input", help="CSV、HTML 或 XLSX 课表文件")
    parser.add_argument("-o", "--output", help="输出 .ics 路径；默认与输入同目录")
    parser.add_argument("--title", default="我的课表", help="日历名称")
    parser.add_argument("--start", default=_default_start(), help="第 1 周周一，YYYY-MM-DD")
    parser.add_argument("--alarm", type=int, default=10, help="课前提醒分钟数，0 表示关闭")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        parsed = parse_timetable_file(args.input)
        config = SemesterConfig(
            title=args.title,
            semester_start=args.start,
            timezone=TIMEZONE,
            periods=[replace(period) for period in DEFAULT_PERIODS],
            alarm_minutes=args.alarm,
        )
        output = generate_ics(config, parsed.courses)
        target = Path(args.output) if args.output else Path(args.input).with_suffix(".ics")
        target.write_text(output.ics, encoding="utf-8", newline="")
        print(f"{parsed.format_label}: {len(parsed.courses)} 门课程, {len(output.build.events)} 个事件")
        print(f"已写入: {target}")
        print(f"建议文件名: {suggested_file_name(config)}")
        return 0
    except (TericsParseError, ValueError, OSError) as exc:
        print(f"terics: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
