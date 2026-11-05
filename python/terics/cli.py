from __future__ import annotations

import argparse
import sys
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

from .errors import TericsParseError
from .ics import generate_ics, generate_ics_v2, suggested_file_name, suggested_ics_v2_file_name
from .models import DEFAULT_PERIODS, TIMEZONE, SemesterConfig
from .parsers import parse_timetable_file
from .timetable_v2 import parse_terics_json


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
        input_path = Path(args.input)
        raw = input_path.read_bytes()
        is_json = input_path.suffix.lower() == ".json" or raw[:4096].decode("utf-8", errors="ignore").lstrip().startswith("{")
        config = SemesterConfig(
            title=args.title,
            semester_start=args.start,
            timezone=TIMEZONE,
            periods=[replace(period) for period in DEFAULT_PERIODS],
            alarm_minutes=args.alarm,
        )
        if is_json:
            timetable = parse_terics_json(raw.decode("utf-8-sig"))
            output = generate_ics_v2(timetable, alarm_minutes=args.alarm)
            event_count = len(output.events)
            suggested = suggested_ics_v2_file_name(timetable)
            print(f"terics v2: {len(timetable.get('courses', []))} 门课程, {event_count} 个事件")
        else:
            parsed = parse_timetable_file(input_path)
            old_output = generate_ics(config, parsed.courses)
            output = old_output
            event_count = len(old_output.build.events)
            suggested = suggested_file_name(config)
            print(f"{parsed.format_label}: {len(parsed.courses)} 门课程, {event_count} 个事件")
        target = Path(args.output) if args.output else input_path.with_suffix(".ics")
        target.write_text(output.ics, encoding="utf-8", newline="")
        print(f"已写入: {target}")
        print(f"建议文件名: {suggested}")
        return 0
    except (TericsParseError, ValueError, OSError) as exc:
        print(f"terics: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
