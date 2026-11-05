from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from .models import DEFAULT_MAX_WEEK

WEEKDAY_MAP = {
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "日": 7,
    "天": 7,
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
}

ENGLISH_WEEKDAYS = {
    "monday": 1,
    "mon": 1,
    "tuesday": 2,
    "tue": 2,
    "wednesday": 3,
    "wed": 3,
    "thursday": 4,
    "thu": 4,
    "friday": 5,
    "fri": 5,
    "saturday": 6,
    "sat": 6,
    "sunday": 7,
    "sun": 7,
}


@dataclass(slots=True)
class WeekParseResult:
    weeks: list[int]
    normalized: str
    error: str | None = None


@dataclass(slots=True)
class PeriodParseResult:
    start: int
    end: int
    raw: str


@dataclass(slots=True)
class WeekMatch:
    rule: str
    index: int
    length: int


def normalize_text(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.replace("\u00a0", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"[ \t]+", " ", text).strip()


def parse_weeks_detailed(raw: str, max_week: int = DEFAULT_MAX_WEEK) -> WeekParseResult:
    original = normalize_text(raw)
    if not original:
        return WeekParseResult([], "", "周次为空")

    sanitized = re.sub(r"\[[^\]]*节[^\]]*\]", " ", original, flags=re.IGNORECASE)
    sanitized = re.sub(r"周次|教学周|第", " ", sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r"[（(]\s*周\s*[）)]", " ", sanitized)
    sanitized = re.sub(r"[（()）\[\]{}]", " ", sanitized)
    sanitized = sanitized.replace("周", " ")
    sanitized = sanitized.replace("~", "-").replace("～", "-")
    sanitized = re.sub(r"[—–－]", "-", sanitized)
    sanitized = re.sub(r"[、，；;]", ",", sanitized)
    sanitized = re.sub(r"\s+", "", sanitized)

    if not sanitized:
        return WeekParseResult([], sanitized, f"无法识别周次：{original}")

    weeks: set[int] = set()
    normalized_parts: list[str] = []
    for token in (part.strip() for part in sanitized.split(",")):
        if not token:
            continue
        parity_match = re.search(r"(单|双)", token)
        parity = parity_match.group(1) if parity_match else ""
        without_parity = re.sub(r"[单双]", "", token).strip("-至")
        match = re.fullmatch(r"(\d{1,2})(?:-(\d{1,2}))?", without_parity)
        if not match:
            return WeekParseResult([], sanitized, f"无法识别周次片段：{token}")
        start = int(match.group(1))
        end = int(match.group(2) or match.group(1))
        if start < 1 or end < start:
            return WeekParseResult([], sanitized, f"周次范围无效：{token}")
        if end > max_week:
            return WeekParseResult(
                [],
                sanitized,
                f"周次 {end} 超出支持上限 {max_week}；如学期更长请拆分课表",
            )
        for week in range(start, end + 1):
            if parity == "单" and week % 2 == 0:
                continue
            if parity == "双" and week % 2 != 0:
                continue
            weeks.add(week)
        normalized_parts.append(f"{without_parity}{parity}")

    result = sorted(weeks)
    if not result:
        return WeekParseResult([], ",".join(normalized_parts), f"周次筛选后为空：{original}")
    return WeekParseResult(result, ",".join(normalized_parts))


def extract_week_rule(text: str) -> WeekMatch | None:
    normalized = normalize_text(text)
    sequence = r"\d{1,2}(?:\s*[-~～—–－至]\s*\d{1,2})?(?:\s*[,，、]\s*\d{1,2}(?:\s*[-~～—–－至]\s*\d{1,2})?)*"
    patterns = [
        re.compile(
            rf"(?:第\s*)?{sequence}\s*(?:[（(]\s*周\s*[）)]|周)\s*(?:[（(]?\s*(?:单|双)\s*[）)]?\s*周?)?",
            re.IGNORECASE,
        ),
        re.compile(rf"(?:第\s*)?{sequence}\s*(?:单|双)\s*周?", re.IGNORECASE),
    ]
    for pattern in patterns:
        match = pattern.search(normalized)
        if match:
            return WeekMatch(match.group(0).strip(), match.start(), len(match.group(0)))
    return None


def parse_period_range(raw: str) -> PeriodParseResult | None:
    normalized = normalize_text(raw)
    if not normalized:
        return None

    bracketed = re.search(r"\[\s*(\d{1,2})(?:\s*[-~～—–－至]\s*(\d{1,2}))?\s*节?\s*\]", normalized)
    if bracketed:
        start = int(bracketed.group(1))
        end = int(bracketed.group(2) or bracketed.group(1))
        return PeriodParseResult(start, end, normalized) if start >= 1 and end >= start else None

    annotated_range = re.search(r"(\d{1,2})\s*[-~～—–－至]\s*(\d{1,2})\s*节", normalized)
    if annotated_range:
        start = int(annotated_range.group(1))
        end = int(annotated_range.group(2))
        return PeriodParseResult(start, end, normalized) if start >= 1 and end >= start else None

    listed = re.search(r"(?:第\s*)?((?:\d{1,2}\s*[,，、]\s*)+\d{1,2})\s*节", normalized)
    if listed:
        values = sorted(int(part.strip()) for part in re.split(r"[,，、]", listed.group(1)))
        if values and all(value == values[0] + index for index, value in enumerate(values)):
            return PeriodParseResult(values[0], values[-1], normalized)
        return None

    annotated_single = re.search(r"(?:第\s*)?(\d{1,2})\s*节", normalized)
    if annotated_single:
        value = int(annotated_single.group(1))
        return PeriodParseResult(value, value, normalized) if value >= 1 else None

    if re.fullmatch(r"\d{1,2}", normalized):
        value = int(normalized)
        return PeriodParseResult(value, value, normalized) if value >= 1 else None

    if re.fullmatch(r"\d{1,2}\s*[-~～—–－至]\s*\d{1,2}", normalized):
        match = re.search(r"(\d{1,2})\s*[-~～—–－至]\s*(\d{1,2})", normalized)
        if match:
            start, end = int(match.group(1)), int(match.group(2))
            return PeriodParseResult(start, end, normalized) if start >= 1 and end >= start else None

    if re.search(r"节次|section|period", normalized, re.IGNORECASE):
        match = re.search(r"(\d{1,2})\s*[-~～—–－至]\s*(\d{1,2})", normalized)
        if match:
            start, end = int(match.group(1)), int(match.group(2))
            return PeriodParseResult(start, end, normalized) if start >= 1 and end >= start else None

    return None


def parse_weekday(raw: object) -> int | None:
    value = normalize_text(raw).lower()
    if not value:
        return None

    labelled = re.search(r"(?:星期|周|礼拜)\s*([一二三四五六日天1-7])", value)
    if labelled:
        return WEEKDAY_MAP.get(labelled.group(1))

    bracketed = re.search(r"([一二三四五六日天1-7])\s*\[", value)
    if bracketed:
        return WEEKDAY_MAP.get(bracketed.group(1))

    if re.fullmatch(r"[1-7]", value):
        return int(value)
    return WEEKDAY_MAP.get(value) or ENGLISH_WEEKDAYS.get(value)


def weekday_token(weekday: int) -> str:
    values = ["", "一", "二", "三", "四", "五", "六", "日"]
    return values[weekday] if 0 < weekday < len(values) else str(weekday)


def clean_cell_text(value: object) -> str:
    text = normalize_text(value)
    text = re.sub(r"\s*\n\s*", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_course_name(value: object) -> str:
    text = normalize_text(value)
    return re.sub(r"^\[[^\]]{1,20}\]\s*", "", text).strip()


def clean_teacher(value: object) -> str:
    text = normalize_text(value)
    text = re.sub(r"\s*\[\d+\]\s*", " ", text)
    return re.sub(r"\s{2,}", " ", text).strip()
