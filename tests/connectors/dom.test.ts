import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { createQingguoAdapter } from "../../src/connectors/vendors/qingguo";
import { createQiangzhiAdapter } from "../../src/connectors/vendors/qiangzhi";
import { finalizeConnectorExtraction } from "../../src/connectors/sdk/normalize";
import type { ConnectorContext, SemesterSelection } from "../../src/v2/types";

const semester: SemesterSelection = { academicYear: "2026-2027", termCode: "1", termName: "2026 秋季", semesterStart: "2026-08-31", teachingWeeks: 20 };

function contextFromFile(file: string, url: string): ConnectorContext {
  const html = readFileSync(resolve(file), "utf8");
  const window = new Window({ url });
  window.document.write(html);
  return {
    url: new URL(url),
    document: window.document as unknown as Document,
    fetchImpl: globalThis.fetch,
    now: () => new Date("2026-08-01T00:00:00Z"),
  };
}

describe("DOM protocol adapters", () => {
  it("extracts Qingguo list tables", async () => {
    const adapter = createQingguoAdapter();
    const ctx = contextFromFile("fixtures/html/qingguo_list_sample.xls", "https://jw.example.edu.cn/kbcx/list.do");
    expect((await adapter.detect(ctx)).detected).toBe(true);
    const extraction = await adapter.extract(ctx, semester);
    const timetable = finalizeConnectorExtraction(extraction, adapter.descriptor, semester, { sourceKind: "extension", sourceUrl: ctx.url.href });
    expect(timetable.courses.length).toBeGreaterThan(0);
    expect(timetable.metadata.method).toBe("dom");
  });

  it("extracts Qiangzhi-style rendered grids and marks DOM limitations", async () => {
    const adapter = createQiangzhiAdapter();
    const ctx = contextFromFile("fixtures/html/wakeup_usc_sample.html", "https://jw.example.edu.cn/jsxsd/xskb/xskb_list.do");
    expect((await adapter.detect(ctx)).detected).toBe(true);
    const extraction = await adapter.extract(ctx, semester);
    const timetable = finalizeConnectorExtraction(extraction, adapter.descriptor, semester, { sourceKind: "extension", sourceUrl: ctx.url.href });
    expect(timetable.courses.length).toBeGreaterThan(0);
    expect(timetable.term.periodSchedules).toHaveLength(1);
    expect(timetable.source.adapterId).toBe("qiangzhi-dom");
  });
});
