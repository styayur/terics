import type { ParseIssue, RawCourse } from "../types";
import {
  cleanCellText,
  cleanCourseName,
  cleanTeacher,
  extractWeekRule,
  normalizeText,
  parsePeriodRange,
  parseWeeksDetailed,
  parseWeekday,
} from "../weeks";

export type CanonicalColumn =
  | "name"
  | "teacher"
  | "location"
  | "weekday"
  | "periods"
  | "weeks"
  | "time"
  | "note";

const HEADER_ALIASES: Record<string, CanonicalColumn> = {
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
};

export function normalizeHeader(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s_\-:：/\\()（）[\]【】]+/g, "");
}

export function canonicalHeader(value: unknown): CanonicalColumn | null {
  return HEADER_ALIASES[normalizeHeader(value)] ?? null;
}

export function findTabularHeader(matrix: unknown[][]): {
  rowIndex: number;
  columns: Partial<Record<CanonicalColumn, number>>;
} | null {
  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 25); rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const columns: Partial<Record<CanonicalColumn, number>> = {};
    row.forEach((cell, columnIndex) => {
      const canonical = canonicalHeader(cell);
      if (canonical && columns[canonical] === undefined) columns[canonical] = columnIndex;
    });
    if (
      columns.name !== undefined &&
      (columns.weeks !== undefined || columns.periods !== undefined || columns.time !== undefined)
    ) {
      return { rowIndex, columns };
    }
  }
  return null;
}

function valueAt(row: unknown[], index: number | undefined): string {
  if (index === undefined) return "";
  return cleanCellText(row[index]);
}

function stripMatched(text: string, matched: string | undefined): string {
  if (!matched) return text;
  return text.replace(matched, " ");
}

function cleanupCombinedLocation(text: string, weekRule: string | undefined, periodRaw: string | undefined): string {
  let location = text;
  location = stripMatched(location, weekRule);
  location = stripMatched(location, periodRaw);
  location = location
    .replace(/(?:星期|周|礼拜)\s*[一二三四五六日天1-7]/g, " ")
    .replace(/(^|\s)[一二三四五六日天](?=\s|$)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[（(]\s*[）)]/g, " ")
    .replace(/[;,，；、|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return location;
}

export function parseCombinedTimeCell(text: string): {
  weekday: number | null;
  period: ReturnType<typeof parsePeriodRange>;
  weekRule?: string;
  weeks: number[];
  error?: string;
} {
  const normalized = cleanCellText(text);
  const weekMatch = extractWeekRule(normalized);
  const weekResult = parseWeeksDetailed(weekMatch?.rule ?? "");
  const period = parsePeriodRange(normalized);
  return {
    weekday: parseWeekday(normalized),
    period,
    weekRule: weekMatch?.rule,
    weeks: weekResult.weeks,
    error: weekResult.error,
  };
}

export function dedupeCourses(courses: RawCourse[], issues: ParseIssue[]): RawCourse[] {
  const seen = new Set<string>();
  const result: RawCourse[] = [];
  for (const course of courses) {
    const key = [
      course.name,
      course.teacher,
      course.location,
      course.weekday,
      course.startPeriod,
      course.endPeriod,
      course.weeks.join(","),
      course.note,
    ].join("\u001f");
    if (seen.has(key)) {
      issues.push({
        severity: "warning",
        code: "duplicate_course",
        message: `已合并重复课程：${course.name}（${course.sourceRef ?? "未知位置"}）`,
      });
      continue;
    }
    seen.add(key);
    result.push(course);
  }
  return result;
}

export function parseTabularRows(
  matrix: unknown[][],
  sourceLabel: string,
): { courses: RawCourse[]; issues: ParseIssue[]; headerRow: number } | null {
  const header = findTabularHeader(matrix);
  if (!header) return null;

  const issues: ParseIssue[] = [];
  const courses: RawCourse[] = [];
  const { rowIndex: headerRow, columns } = header;

  for (let rowIndex = headerRow + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    if (row.every((cell) => !normalizeText(cell))) continue;
    const sourceRow = rowIndex + 1;
    const name = cleanCourseName(valueAt(row, columns.name));
    if (!name) continue;

    let teacher = cleanTeacher(valueAt(row, columns.teacher));
    const configuredLocation = cleanCellText(valueAt(row, columns.location));
    const note = cleanCellText(valueAt(row, columns.note));
    const weekdayRaw = valueAt(row, columns.weekday);
    const periodsRaw = valueAt(row, columns.periods);
    const weeksRaw = valueAt(row, columns.weeks);
    const combinedRaw = valueAt(row, columns.time);

    const timeSegments = combinedRaw
      ? combinedRaw.split(/[；;]/).map((segment) => segment.trim()).filter(Boolean)
      : [periodsRaw || combinedRaw];

    if (timeSegments.length > 1 && !teacher) {
      issues.push({
        severity: "warning",
        code: "multiple_sessions_shared_teacher",
        message: `第 ${sourceRow} 行包含多个时间地点段；教师与地点按原字段共用。`,
        row: sourceRow,
      });
    }

    let addedForRow = 0;
    for (const segment of timeSegments) {
      const weekRuleMatch = extractWeekRule(weeksRaw || segment);
      const weekRule = weekRuleMatch?.rule ?? weeksRaw;
      const weekResult = parseWeeksDetailed(weekRule);
      if (weekResult.error) {
        issues.push({
          severity: "error",
          code: "invalid_weeks",
          message: `第 ${sourceRow} 行周次无效：${weekResult.error}`,
          row: sourceRow,
          hint: "示例：1-16、1-8,10-16、1-16单、2-16双",
        });
        continue;
      }

      const period = parsePeriodRange(periodsRaw || segment);
      if (!period) {
        issues.push({
          severity: "error",
          code: "invalid_periods",
          message: `第 ${sourceRow} 行节次无效：${segment || "（空）"}`,
          row: sourceRow,
          hint: "示例：1-2、第3-4节、[05-06节]",
        });
        continue;
      }
      if (period.start < 1 || period.end > 30) {
        issues.push({
          severity: "error",
          code: "period_out_of_range",
          message: `第 ${sourceRow} 行节次超出支持范围 1–30：${period.start}-${period.end}`,
          row: sourceRow,
        });
        continue;
      }

      let location = configuredLocation;
      const weekday = parseWeekday(weekdayRaw) ?? parseWeekday(segment);
      if (!weekday) {
        issues.push({
          severity: "error",
          code: "invalid_weekday",
          message: `第 ${sourceRow} 行无法识别星期：${weekdayRaw || segment || "（空）"}`,
          row: sourceRow,
          hint: "支持周一至周日、星期一至星期日、1–7 或 Monday–Sunday",
        });
        continue;
      }

      if (!location && segment) {
        location = cleanupCombinedLocation(segment, weekRuleMatch?.rule, period.raw);
      }
      if (!teacher && segment.includes("|")) {
        teacher = cleanTeacher(segment.split("|").find((part) => /老师|教师|teacher/i.test(part)) ?? "");
      }

      courses.push({
        name,
        teacher,
        location,
        weekday,
        startPeriod: period.start,
        endPeriod: period.end,
        weeks: weekResult.weeks,
        weekRule: weekRule ?? weekResult.normalized,
        note,
        sourceRef: `${sourceLabel} 第 ${sourceRow} 行`,
      });
      addedForRow += 1;
    }

    if (addedForRow === 0) {
      issues.push({
        severity: "warning",
        code: "row_skipped",
        message: `第 ${sourceRow} 行没有生成课程，请检查时间字段。`,
        row: sourceRow,
      });
    }
  }

  return { courses: dedupeCourses(courses, issues), issues, headerRow };
}
