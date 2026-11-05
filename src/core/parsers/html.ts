import { TericsParseError } from "../errors";
import type { ParseIssue, ParseResult, RawCourse } from "../types";
import { FORMAT_LABELS } from "../types";
import { cleanCellText } from "../weeks";
import { parseGridMatrix } from "./cell";
import { dedupeCourses, parseTabularRows } from "./tabular";

function extractCellText(document: Document, element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("script,style,noscript,template,iframe,object,svg,img").forEach((node) => node.remove());
  clone.querySelectorAll("br").forEach((node) => node.replaceWith(document.createTextNode("\n")));
  clone.querySelectorAll("div,p,li,tr").forEach((node) => node.append(document.createTextNode("\n")));
  return cleanCellText(clone.textContent ?? "");
}

function spanValue(element: Element, name: string): number {
  const value = Number(element.getAttribute(name) ?? 1);
  return Number.isInteger(value) && value >= 1 && value <= 50 ? value : 1;
}

function tableToMatrix(document: Document, table: HTMLTableElement): string[][] {
  const rows = Array.from(table.querySelectorAll("tr"));
  const grid: Array<Array<string | undefined>> = [];
  rows.forEach((row, rowIndex) => {
    grid[rowIndex] ??= [];
    let columnIndex = 0;
    for (const cell of Array.from(row.children)) {
      if (!["TD", "TH"].includes(cell.tagName)) continue;
      while (grid[rowIndex]?.[columnIndex] !== undefined) columnIndex += 1;
      const text = extractCellText(document, cell);
      const rowSpan = spanValue(cell, "rowspan");
      const colSpan = spanValue(cell, "colspan");
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        const targetRow = rowIndex + rowOffset;
        grid[targetRow] ??= [];
        for (let colOffset = 0; colOffset < colSpan; colOffset += 1) {
          grid[targetRow]![columnIndex + colOffset] = text;
        }
      }
      columnIndex += colSpan;
    }
  });
  return grid.map((row) => row.map((cell) => cell ?? ""));
}

export function parseHtml(html: string, fileName: string): ParseResult {
  if (!html.trim()) {
    throw new TericsParseError("HTML 文件为空");
  }
  const document = new DOMParser().parseFromString(html, "text/html");
  if (document.querySelector("parsererror")) {
    throw new TericsParseError("HTML 结构损坏，无法解析");
  }
  const tables = Array.from(document.querySelectorAll("table")) as HTMLTableElement[];
  if (tables.length === 0) {
    throw new TericsParseError("HTML 中没有找到 <table> 课表");
  }

  const issues: ParseIssue[] = [];
  const courses: RawCourse[] = [];
  let gridDetected = false;
  let listDetected = false;

  tables.slice(0, 100).forEach((table, tableIndex) => {
    const matrix = tableToMatrix(document, table);
    if (matrix.length < 2 || matrix.every((row) => row.every((cell) => !cell.trim()))) return;
    const label = `${fileName} 表格 ${tableIndex + 1}`;

    const tabular = parseTabularRows(matrix, label);
    if (tabular) {
      listDetected = true;
      courses.push(...tabular.courses);
      issues.push(...tabular.issues);
      return;
    }

    const grid = parseGridMatrix(matrix, label);
    if (grid) {
      gridDetected = true;
      courses.push(...grid.courses);
      issues.push(...grid.issues);
    }
  });

  const deduped = dedupeCourses(courses, issues);
  if (deduped.length === 0) {
    throw new TericsParseError(
      "HTML 表格未识别出课程；请确认包含星期表头，或课程/教师/周次/节次列",
      issues.length > 0
        ? issues
        : [
            {
              severity: "error",
              code: "no_courses",
              message: "HTML 中没有可转换的有效课程行",
              hint: "可参考 docs/formats.md 中的 HTML 示例。",
            },
          ],
    );
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  return {
    format: "html",
    formatLabel: listDetected && !gridDetected ? "HTML 列表式课表" : "HTML 周网格课表",
    confidence: hasErrors ? 0.84 : 0.97,
    courses: deduped,
    issues,
    metadata: {
      tableCount: tables.length,
      sourceRows: courses.length,
    },
  };
}

export const HTML_FORMAT_LABEL = FORMAT_LABELS.html;
