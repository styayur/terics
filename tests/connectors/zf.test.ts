import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createZfAdapter, normalizeZfRows, type ZfRow } from "../../src/connectors/vendors/zf";
import { finalizeConnectorExtraction } from "../../src/connectors/sdk/normalize";
import type { ConnectorContext, SemesterSelection } from "../../src/v2/types";

const semester: SemesterSelection = { academicYear: "2026-2027", termCode: "1", termName: "2026 秋季", semesterStart: "2026-08-31" };

function zfContext(): ConnectorContext {
  const window = new Window({ url: "https://jw.example.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N253508" });
  window.document.documentElement.innerHTML = `<body>正方教务 zftal <select id="xnm"><option value="2026" selected>2026</option></select><select id="xqm"><option value="3" selected>秋</option></select></body>`;
  return {
    url: new URL("https://jw.example.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N253508"),
    document: window.document as unknown as Document,
    fetchImpl: globalThis.fetch,
    now: () => new Date("2026-08-01T00:00:00Z"),
  };
}

describe("Zhengfang connector", () => {
  const rows = (JSON.parse(readFileSync(resolve("fixtures/connectors/zf/kb-list.json"), "utf8")) as { kbList: ZfRow[] }).kbList;

  it("parses kbList weeks, odd/even and periods", async () => {
    const adapter = createZfAdapter();
    const normalized = await normalizeZfRows(rows, adapter.descriptor);
    expect(normalized.courses).toHaveLength(2);
    const physics = normalized.courses.find((course) => course.name === "大学物理实验");
    expect(physics?.meetings[0]).toMatchObject({ weekday: 4, startPeriod: 5, endPeriod: 6, weeks: [2, 4, 6, 8, 10, 12, 14, 16] });
  });

  it("uses the read-only API and preserves term selectors", async () => {
    const adapter = createZfAdapter();
    const ctx = zfContext();
    const fixture = JSON.parse(readFileSync(resolve("fixtures/connectors/zf/kb-list.json"), "utf8"));
    ctx.fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("xskbcx_cxXsgrkb");
      expect(String(init?.body)).toContain("xnm=2026");
      expect(String(init?.body)).toContain("xqm=3");
      return new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const detection = await adapter.detect(ctx);
    expect(detection.detected).toBe(true);
    const extraction = await adapter.extract(ctx, semester);
    const timetable = finalizeConnectorExtraction(extraction, adapter.descriptor, semester, { sourceKind: "extension", sourceUrl: ctx.url.href });
    expect(timetable.courses).toHaveLength(2);
    expect(timetable.term.termCode).toBe("3");
    expect(timetable.metadata.method).toBe("api");
  });
});
