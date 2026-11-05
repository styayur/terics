import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TericsParseError } from "../src/core/errors";
import { parseTimetableFile } from "../src/core/parsers";

function fixture(path: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(path)));
}

describe("content-based parser adapters", () => {
  it("parses the structured CSV fixture", async () => {
    const result = await parseTimetableFile({
      fileName: "courses.bin",
      bytes: fixture("fixtures/csv/terics_sample.csv"),
    });
    expect(result.format).toBe("csv");
    expect(result.courses).toHaveLength(6);
    expect(result.courses[0]).toMatchObject({
      name: "高等数学A",
      teacher: "张伟",
      location: "教1-101",
      weekday: 1,
      startPeriod: 1,
      endPeriod: 2,
    });
  });

  it("parses GB18030 CSV without relying on the extension", async () => {
    const result = await parseTimetableFile({
      fileName: "legacy.csv",
      bytes: fixture("fixtures/csv/terics_sample_gb18030.csv"),
    });
    expect(result.metadata.detectedEncoding).toBe("gb18030");
    expect(result.courses).toHaveLength(6);
    expect(result.courses[0]?.name).toBe("高等数学A");
  });

  it("parses a Qingguo-style HTML list exported with an .xls extension", async () => {
    const result = await parseTimetableFile({
      fileName: "qingguo_export.xls",
      bytes: fixture("fixtures/html/qingguo_list_sample.xls"),
    });
    expect(result.format).toBe("html");
    expect(result.courses).toHaveLength(5);
    expect(result.courses.find((course) => course.name === "程序设计基础")).toMatchObject({
      weekday: 2,
      startPeriod: 5,
      endPeriod: 6,
      weeks: [1, 3, 5, 7, 9, 11, 13, 15],
    });
    expect(result.courses.some((course) => course.location.includes("计算机楼305"))).toBe(true);
  });

  it("parses the public MIT WakeUp HTML grid fixture", async () => {
    const result = await parseTimetableFile({
      fileName: "wakeup_usc_sample.csv",
      bytes: fixture("fixtures/html/wakeup_usc_sample.html"),
    });
    expect(result.format).toBe("html");
    expect(result.courses).toHaveLength(7);
    expect(result.courses.map((course) => course.name)).toContain("程序设计");
    expect(result.courses.find((course) => course.name === "数据结构")).toMatchObject({
      weekday: 3,
      startPeriod: 3,
      endPeriod: 4,
      weeks: [2, 4, 6, 8, 10, 12, 14, 16],
    });
  });

  it("parses the public MIT WakeUp XLSX template regardless of extension", async () => {
    const result = await parseTimetableFile({
      fileName: "renamed.csv",
      bytes: fixture("fixtures/xlsx/wakeup_schedule_template.xlsx"),
    });
    expect(result.format).toBe("xlsx");
    expect(result.courses).toHaveLength(5);
    expect(result.courses.find((course) => course.name === "线性代数")).toMatchObject({
      weekday: 3,
      startPeriod: 1,
      endPeriod: 1,
      weeks: [1, 3, 5, 7, 9, 11, 13, 15],
    });
  });

  it("does not execute scripts or event handlers in HTML", async () => {
    (globalThis as { __tericsXss?: number }).__tericsXss = 0;
    const result = await parseTimetableFile({
      fileName: "malicious.html",
      bytes: fixture("fixtures/invalid/malicious.html"),
    });
    expect(result.courses[0]?.name).toBe("安全课");
    expect((globalThis as { __tericsXss?: number }).__tericsXss).toBe(0);
  });

  it("rejects empty, damaged and unsupported inputs with explicit errors", async () => {
    const empty = new Uint8Array();
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    const fakeXlsx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    const oleXls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(parseTimetableFile({ fileName: "x", bytes: empty })).rejects.toThrow(/为空/);
    await expect(parseTimetableFile({ fileName: "x", bytes: oversized })).rejects.toThrow(/10 MiB/);
    await expect(parseTimetableFile({ fileName: "x.xlsx", bytes: fakeXlsx })).rejects.toThrow(/损坏/);
    await expect(parseTimetableFile({ fileName: "x.xls", bytes: oleXls })).rejects.toThrow(/旧版二进制 XLS/);
    await expect(
      parseTimetableFile({ fileName: "x.html", bytes: fixture("fixtures/invalid/no_table.html") }),
    ).rejects.toThrow(/没有找到 <table>/);
    await expect(
      parseTimetableFile({ fileName: "x.csv", bytes: fixture("fixtures/invalid/header_only.csv") }),
    ).rejects.toThrow(/没有可转换的课程/);
    await expect(
      parseTimetableFile({ fileName: "x.csv", bytes: fixture("fixtures/invalid/bad_rows.csv") }),
    ).rejects.toBeInstanceOf(TericsParseError);
  });
});
