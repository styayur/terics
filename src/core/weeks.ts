import { DEFAULT_MAX_WEEK } from "./types";

export interface WeekParseResult {
  weeks: number[];
  normalized: string;
  error?: string;
}

export interface PeriodParseResult {
  start: number;
  end: number;
  raw: string;
}

export interface WeekMatch {
  rule: string;
  index: number;
  length: number;
}

const WEEKDAY_MAP: Record<string, number> = {
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
};

const ENGLISH_WEEKDAYS: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7,
};

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function parseWeeksDetailed(
  raw: string,
  maxWeek = DEFAULT_MAX_WEEK,
): WeekParseResult {
  const original = normalizeText(raw);
  if (!original) {
    return { weeks: [], normalized: "", error: "周次为空" };
  }

  const sanitized = original
    .replace(/\[[^\]]*节[^\]]*\]/gi, " ")
    .replace(/周次|教学周|第/gi, " ")
    .replace(/[（(]\s*周\s*[）)]/gi, " ")
    .replace(/[（()）\[\]{}]/g, " ")
    .replace(/周/g, " ")
    .replace(/[~～]/g, "-")
    .replace(/[—–－]/g, "-")
    .replace(/[、，；;]/g, ",")
    .replace(/\s+/g, "");

  if (!sanitized) {
    return { weeks: [], normalized: sanitized, error: `无法识别周次：${original}` };
  }

  const tokens = sanitized
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const weeks = new Set<number>();
  const normalizedParts: string[] = [];

  for (const token of tokens) {
    const parityMatch = token.match(/(单|双)/);
    const parity = parityMatch?.[1] ?? "";
    const withoutParity = token.replace(/[单双]/g, "").replace(/^[-至]+|[-至]+$/g, "");
    const range = withoutParity.match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
    if (!range) {
      return { weeks: [], normalized: sanitized, error: `无法识别周次片段：${token}` };
    }
    const start = Number(range[1]);
    const end = Number(range[2] ?? range[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      return { weeks: [], normalized: sanitized, error: `周次范围无效：${token}` };
    }
    if (end > maxWeek) {
      return {
        weeks: [],
        normalized: sanitized,
        error: `周次 ${end} 超出支持上限 ${maxWeek}；如学期更长请拆分课表`,
      };
    }
    for (let week = start; week <= end; week += 1) {
      if (parity === "单" && week % 2 === 0) continue;
      if (parity === "双" && week % 2 !== 0) continue;
      weeks.add(week);
    }
    normalizedParts.push(`${withoutParity}${parity}`);
  }

  const result = [...weeks].sort((a, b) => a - b);
  if (result.length === 0) {
    return { weeks: [], normalized: normalizedParts.join(","), error: `周次筛选后为空：${original}` };
  }
  return { weeks: result, normalized: normalizedParts.join(",") };
}

export function extractWeekRule(text: string): WeekMatch | undefined {
  const normalized = normalizeText(text);
  const sequence = String.raw`\d{1,2}(?:\s*[-~～—–－至]\s*\d{1,2})?(?:\s*[,，、]\s*\d{1,2}(?:\s*[-~～—–－至]\s*\d{1,2})?)*`;
  const patterns = [
    new RegExp(
      String.raw`(?:第\s*)?${sequence}\s*(?:[（(]\s*周\s*[）)]|周)\s*(?:[（(]?\s*(?:单|双)\s*[）)]?\s*周?)?`,
      "i",
    ),
    new RegExp(
      String.raw`(?:第\s*)?${sequence}\s*(?:单|双)\s*周?`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.index !== undefined && match[0]) {
      return { rule: match[0].trim(), index: match.index, length: match[0].length };
    }
  }
  return undefined;
}

export function parsePeriodRange(raw: string): PeriodParseResult | null {
  const normalized = normalizeText(raw);
  if (!normalized) return null;

  const bracketed = normalized.match(/\[\s*(\d{1,2})(?:\s*[-~～—–－至]\s*(\d{1,2}))?\s*节?\s*\]/);
  if (bracketed) {
    const start = Number(bracketed[1]);
    const end = Number(bracketed[2] ?? bracketed[1]);
    if (start >= 1 && end >= start) return { start, end, raw: normalized };
    return null;
  }

  const annotatedRange = normalized.match(/(\d{1,2})\s*[-~～—–－至]\s*(\d{1,2})\s*节/);
  if (annotatedRange) {
    const start = Number(annotatedRange[1]);
    const end = Number(annotatedRange[2]);
    if (start >= 1 && end >= start) return { start, end, raw: normalized };
    return null;
  }

  const list = normalized.match(/(?:第\s*)?((?:\d{1,2}\s*[,，、]\s*)+\d{1,2})\s*节/);
  if (list?.[1]) {
    const values = list[1]
      .split(/[,，、]/)
      .map((part) => Number(part.trim()))
      .filter(Number.isInteger)
      .sort((a, b) => a - b);
    if (values.length > 0 && values.every((value, index) => index === 0 || value === (values[index - 1] ?? 0) + 1)) {
      return { start: values[0] ?? 0, end: values[values.length - 1] ?? 0, raw: normalized };
    }
    return null;
  }

  const annotatedSingle = normalized.match(/(?:第\s*)?(\d{1,2})\s*节/);
  if (annotatedSingle) {
    const value = Number(annotatedSingle[1]);
    if (value >= 1) return { start: value, end: value, raw: normalized };
  }

  if (/^\d{1,2}$/.test(normalized)) {
    const value = Number(normalized);
    return value >= 1 ? { start: value, end: value, raw: normalized } : null;
  }

  if (/^\d{1,2}\s*[-~～—–－至]\s*\d{1,2}$/.test(normalized)) {
    const range = normalized.match(/(\d{1,2})\s*[-~～—–－至]\s*(\d{1,2})/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start >= 1 && end >= start) return { start, end, raw: normalized };
    }
  }

  if (/节次|section|period/i.test(normalized)) {
    const range = normalized.match(/(\d{1,2})\s*[-~～—–－至]\s*(\d{1,2})/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start >= 1 && end >= start) return { start, end, raw: normalized };
    }
  }

  return null;
}

export function parseWeekday(raw: unknown): number | null {
  const value = normalizeText(raw).toLowerCase();
  if (!value) return null;

  const labelled = value.match(/(?:星期|周|礼拜)\s*([一二三四五六日天1-7])/);
  if (labelled?.[1]) return WEEKDAY_MAP[labelled[1]] ?? null;

  const bracketed = value.match(/([一二三四五六日天1-7])\s*\[/);
  if (bracketed?.[1]) return WEEKDAY_MAP[bracketed[1]] ?? null;

  if (/^[1-7]$/.test(value)) return Number(value);
  return WEEKDAY_MAP[value] ?? ENGLISH_WEEKDAYS[value] ?? null;
}

export function weekdayToken(weekday: number): string {
  return ["", "一", "二", "三", "四", "五", "六", "日"][weekday] ?? String(weekday);
}

export function cleanCellText(value: unknown): string {
  return normalizeText(value)
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanCourseName(value: unknown): string {
  return normalizeText(value)
    .replace(/^\[[^\]]{1,20}\]\s*/u, "")
    .trim();
}

export function cleanTeacher(value: unknown): string {
  return normalizeText(value)
    .replace(/\s*\[\d+\]\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
