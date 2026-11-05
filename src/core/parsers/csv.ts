import Papa from "papaparse";
import { TericsParseError } from "../errors";
import type { ParseIssue, ParseResult } from "../types";
import { FORMAT_LABELS } from "../types";
import { parseTabularRows } from "./tabular";

export function parseCsv(text: string, fileName: string): ParseResult {
  const input = text.replace(/^\uFEFF/, "");
  if (!input.trim()) throw new TericsParseError("CSV 文件为空或只包含空白字符");

  const parsed = Papa.parse<string[]>(input, {
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });
  const issues: ParseIssue[] = parsed.errors.map((error) => ({
    severity: "error",
    code: "csv_syntax",
    message: `CSV 第 ${error.row !== undefined ? error.row + 1 : "?"} 行格式错误：${error.message}`,
    row: error.row !== undefined ? error.row + 1 : undefined,
    hint: "请检查引号、分隔符和字段数量。",
  }));

  const rows = parsed.data.filter((row) => row.some((cell) => String(cell ?? "").trim()));
  if (rows.length === 0) throw new TericsParseError("CSV 没有可解析的数据行", issues);

  const table = parseTabularRows(rows, `${fileName} CSV`);
  if (!table) {
    throw new TericsParseError(
      "未找到 CSV 表头。至少需要课程、周次，以及星期或时间列。",
      issues,
    );
  }
  if (table.courses.length === 0) {
    throw new TericsParseError("CSV 表头有效，但没有可转换的课程行", [...issues, ...table.issues]);
  }

  const allIssues = [...issues, ...table.issues];
  const hasErrors = allIssues.some((issue) => issue.severity === "error");
  return {
    format: "csv",
    formatLabel: FORMAT_LABELS.csv,
    confidence: hasErrors ? 0.86 : 0.99,
    courses: table.courses,
    issues: allIssues,
    metadata: {
      sourceRows: rows.length - 1,
      detectedEncoding: "由内容嗅探确定",
    },
  };
}
