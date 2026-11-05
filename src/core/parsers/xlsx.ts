import readXlsxFile from "read-excel-file/browser";
import { TericsParseError } from "../errors";
import type { ParseIssue, ParseResult, RawCourse } from "../types";
import { FORMAT_LABELS } from "../types";
import { parseGridMatrix } from "./cell";
import { dedupeCourses, findTabularHeader, parseTabularRows } from "./tabular";

interface SheetCandidate {
  sheetName: string;
  courses: RawCourse[];
  issues: ParseIssue[];
  layout: "tabular" | "grid";
}

function chooseCandidate(sheetName: string, matrix: unknown[][]): SheetCandidate | null {
  const tabular = parseTabularRows(matrix, sheetName);
  const grid = parseGridMatrix(matrix, sheetName);
  const candidates: SheetCandidate[] = [];
  if (tabular) {
    candidates.push({
      sheetName,
      courses: tabular.courses,
      issues: tabular.issues,
      layout: "tabular",
    });
  }
  if (grid) {
    candidates.push({
      sheetName,
      courses: grid.courses,
      issues: grid.issues,
      layout: "grid",
    });
  }
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.courses.length - a.courses.length)[0] ?? null;
}

export async function parseXlsx(bytes: Uint8Array, fileName: string): Promise<ParseResult> {
  if (bytes.byteLength === 0) throw new TericsParseError("XLSX 文件为空");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  let sheets: Awaited<ReturnType<typeof readXlsxFile>>;
  try {
    sheets = await readXlsxFile(buffer);
  } catch (error) {
    throw new TericsParseError(
      `XLSX 文件损坏或不是有效的 Office Open XML 工作簿：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new TericsParseError("XLSX 文件中没有工作表");
  }

  const issues: ParseIssue[] = [];
  const selectedSheets: SheetCandidate[] = [];
  for (const sheet of sheets) {
    if (!Array.isArray(sheet.data) || sheet.data.length < 2) continue;
    const candidate = chooseCandidate(sheet.sheet, sheet.data as unknown[][]);
    if (candidate) selectedSheets.push(candidate);
  }

  if (selectedSheets.length === 0) {
    throw new TericsParseError(
      `${fileName} 中未找到可识别的课表工作表；支持“节次 + 周一…周日”网格，或课程/教师/周次/节次列格式。`,
      [
        {
          severity: "error",
          code: "xlsx_layout_unknown",
          message: "工作簿中没有匹配的工作表布局",
          hint: "可参考 fixtures/xlsx/wakeup_schedule_template.xlsx。",
        },
      ],
    );
  }

  for (const candidate of selectedSheets) {
    issues.push(...candidate.issues);
    if (candidate.courses.length === 0) {
      issues.push({
        severity: "warning",
        code: "empty_sheet",
        message: `工作表“${candidate.sheetName}”匹配布局但没有有效课程`,
      });
    }
  }

  const courses = dedupeCourses(
    selectedSheets.flatMap((sheet) => sheet.courses),
    issues,
  );
  if (courses.length === 0) {
    throw new TericsParseError("XLSX 工作簿解析完成，但没有可转换的课程", issues);
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  const sheetNames = selectedSheets.map((sheet) => sheet.sheetName).join(", ");
  return {
    format: "xlsx",
    formatLabel: FORMAT_LABELS.xlsx,
    confidence: hasErrors ? 0.85 : 0.98,
    courses,
    issues,
    metadata: {
      sheetName: sheetNames,
      sourceRows: selectedSheets.reduce((sum, sheet) => sum + sheet.courses.length, 0),
    },
  };
}

export function isRecognizedTabularHeader(matrix: unknown[][]): boolean {
  return findTabularHeader(matrix) !== null;
}
