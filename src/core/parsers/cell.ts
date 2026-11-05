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
  weekdayToken,
} from "../weeks";
import { dedupeCourses } from "./tabular";

export interface GridContext {
  weekday: number;
  startPeriod: number;
  endPeriod: number;
  sourceRef: string;
}

function splitBlocks(raw: string): string[] {
  const normalized = cleanCellText(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n?\s*[-—–_=]{3,}\s*\n?/g, "\n---TERICS-SEP---\n");
  return normalized
    .split(/\n?---TERICS-SEP---\n?|\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function cleanTrailingMeta(value: string): string {
  return value
    .replace(/(?:星期|周|礼拜)\s*[一二三四五六日天1-7]\s*$/u, "")
    .replace(/[（(]\s*[）)]/g, "")
    .replace(/[|,，;；{}[\]\s]+$/u, "")
    .trim();
}

function parsePipeEntry(block: string, context: GridContext): RawCourse | null {
  if (!block.includes("|")) return null;
  const tokens = block
    .split("|")
    .map((token) => cleanCellText(token))
    .filter(Boolean);
  if (tokens.length < 2) return null;

  const weekMarker = tokens.findIndex((token) => /周次|weeks?/i.test(token));
  const teacherMarker = tokens.findIndex((token) => /老师|教师|teacher/i.test(token));
  if (weekMarker < 0) return null;

  const weekToken = tokens[weekMarker + 1] ?? "";
  const weekResult = parseWeeksDetailed(weekToken);
  if (weekResult.error) return null;

  let teacher = "";
  if (teacherMarker >= 0) {
    teacher = tokens
      .slice(teacherMarker + 1, weekMarker >= 0 ? weekMarker : undefined)
      .join(" ");
  } else if (tokens.length >= 3) {
    teacher = tokens[2] ?? "";
  }

  const locationMarker = tokens.findIndex((token) => /教室|地点|location|room/i.test(token));
  const location = locationMarker >= 0 ? tokens.slice(locationMarker + 1).join(" ") : "";
  const name = cleanCourseName(tokens[0]);

  return {
    name,
    teacher: cleanTeacher(teacher),
    location: cleanCellText(location),
    weekday: context.weekday,
    startPeriod: context.startPeriod,
    endPeriod: context.endPeriod,
    weeks: weekResult.weeks,
    weekRule: weekToken || weekResult.normalized,
    note: "",
    sourceRef: context.sourceRef,
  };
}

function parseFreeformEntry(block: string, context: GridContext): RawCourse | null {
  const weekMatch = extractWeekRule(block);
  if (!weekMatch) return null;
  const weekResult = parseWeeksDetailed(weekMatch.rule);
  if (weekResult.error) return null;

  const before = block
    .slice(0, weekMatch.index)
    .replace(/[{([]\s*$/u, "")
    .trim();
  const after = block
    .slice(weekMatch.index + weekMatch.length)
    .replace(/^[\s})\]}]+/u, "")
    .trim();

  const courseLine = before
    .split("\n")
    .map((line) => cleanTrailingMeta(line))
    .filter(Boolean)
    .pop();
  const name = cleanCourseName(courseLine ?? "");
  if (!name) return null;

  const afterLines = after
    .split("\n")
    .map((line) => cleanCellText(line))
    .filter(Boolean);
  let teacher = "";
  let location = "";
  if (afterLines.length >= 2) {
    teacher = afterLines[0] ?? "";
    location = afterLines.slice(1).join(" ");
  } else if (afterLines.length === 1) {
    const tokens = (afterLines[0] ?? "").split(/\s+/).filter(Boolean);
    teacher = tokens[0] ?? "";
    location = tokens.slice(1).join(" ");
  }

  return {
    name,
    teacher: cleanTeacher(teacher),
    location: cleanCellText(location.replace(/\[[^\]]*\]/g, " ")),
    weekday: context.weekday,
    startPeriod: context.startPeriod,
    endPeriod: context.endPeriod,
    weeks: weekResult.weeks,
    weekRule: weekMatch.rule,
    note: "",
    sourceRef: context.sourceRef,
  };
}

export function parseGridCell(raw: string, context: GridContext): {
  course?: RawCourse;
  issue?: ParseIssue;
} {
  const block = cleanCellText(raw);
  if (!block || /^(?:无|空|休息|-|—|--|\/)$/.test(block)) return {};
  try {
    const course = parsePipeEntry(block, context) ?? parseFreeformEntry(block, context);
    if (!course?.name) {
      return {
        issue: {
          severity: "error",
          code: "unrecognized_cell",
          message: `${context.sourceRef} 无法识别课程内容：${block.slice(0, 80)}`,
          hint: "支持管道字段格式，或 `课程名 {第1-16周 教师 地点` / 多行格式。",
        },
      };
    }
    return { course };
  } catch (error) {
    return {
      issue: {
        severity: "error",
        code: "cell_parse_error",
        message: `${context.sourceRef} 解析失败：${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

export function findWeekdayHeader(matrix: unknown[][]): {
  rowIndex: number;
  columns: Map<number, number>;
} | null {
  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 15); rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const columns = new Map<number, number>();
    row.forEach((cell, columnIndex) => {
      const weekday = parseWeekday(cell);
      if (weekday) columns.set(columnIndex, weekday);
    });
    if (columns.size >= 2) return { rowIndex, columns };
  }
  return null;
}

function inferPeriod(row: unknown[], headerRow: number, rowIndex: number): { start: number; end: number } | null {
  const first = cleanCellText(row[0]);
  const parsed = parsePeriodRange(first);
  if (parsed) return parsed;
  if (!first) {
    const inferred = rowIndex - headerRow;
    return inferred >= 1 ? { start: inferred, end: inferred } : null;
  }
  return null;
}

export function parseGridMatrix(matrix: unknown[][], label: string): {
  courses: RawCourse[];
  issues: ParseIssue[];
  headerRow: number;
} | null {
  const header = findWeekdayHeader(matrix);
  if (!header) return null;
  const issues: ParseIssue[] = [];
  const courses: RawCourse[] = [];

  for (let rowIndex = header.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const period = inferPeriod(row, header.rowIndex, rowIndex);
    if (!period) continue;
    if (period.start < 1 || period.end > 30) {
      issues.push({
        severity: "error",
        code: "period_out_of_range",
        message: `${label} 第 ${rowIndex + 1} 行节次超出支持范围：${period.start}-${period.end}`,
        row: rowIndex + 1,
      });
      continue;
    }

    for (const [columnIndex, weekday] of header.columns) {
      const raw = cleanCellText(row[columnIndex]);
      if (!raw) continue;
      const context: GridContext = {
        weekday,
        startPeriod: period.start,
        endPeriod: period.end,
        sourceRef: `${label} 第 ${rowIndex + 1} 行 / ${weekdayToken(weekday)}`,
      };
      for (const block of splitBlocks(raw)) {
        const result = parseGridCell(block, context);
        if (result.course) courses.push(result.course);
        if (result.issue) issues.push(result.issue);
      }
    }
  }

  return { courses: dedupeCourses(courses, issues), issues, headerRow: header.rowIndex };
}

export function blankCell(value: unknown): boolean {
  return !normalizeText(value);
}
