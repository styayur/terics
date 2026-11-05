import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { buildV2Events } from "../../src/v2/events";
import { finalizeConnectorExtraction } from "../../src/connectors/sdk/normalize";
import { WHUT_PROFILE } from "../../src/connectors/schools/whut";
import { createWiseduAdapter, normalizeWiseduRows, weeksFromBitmap } from "../../src/connectors/vendors/wisedu";
import type { ConnectorContext, SemesterSelection } from "../../src/v2/types";

const semester: SemesterSelection = {
  academicYear: "2026-2027",
  termCode: "1",
  termName: "2026 秋季",
  semesterStart: "2026-08-31",
  teachingWeeks: 20,
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function context(html = "EMAP jwapp 学生课表"): ConnectorContext {
  const window = new Window({ url: "https://jwxt.whut.edu.cn/jwapp/sys/homeapp/index.do?forceCas=1" });
  window.document.documentElement.innerHTML = `<body>${html}</body>`;
  return {
    url: new URL("https://jwxt.whut.edu.cn/jwapp/sys/homeapp/index.do?forceCas=1"),
    document: window.document as unknown as Document,
    fetchImpl: globalThis.fetch,
    now: () => new Date("2026-08-01T00:00:00Z"),
  };
}

function fakeWhutFetch(): typeof fetch {
  const rows = readJson("fixtures/connectors/whut/rows.json") as { datas: { cxxszhxqkb: { rows: unknown[] } } };
  const bundle = readJson("fixtures/connectors/whut/api-bundle.json") as { currentUser: unknown; sections: unknown };
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    let body: unknown = { datas: {} };
    if (url.includes("changeAppRole")) body = { code: "0" };
    else if (url.includes("currentUser")) body = bundle.currentUser;
    else if (url.includes("jcjcx")) body = bundle.sections;
    else if (url.includes("cxxszhxqkb")) body = rows;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("WHUT Wisedu connector", () => {
  it("maps DM section codes, bitmaps and stable IDs", async () => {
    const rows = (readJson("fixtures/connectors/whut/rows.json") as { datas: { cxxszhxqkb: { rows: Parameters<typeof normalizeWiseduRows>[0] } } }).datas.cxxszhxqkb.rows;
    const adapter = createWiseduAdapter(WHUT_PROFILE);
    const normalized = await normalizeWiseduRows(rows, adapter.descriptor, semester);
    expect(normalized.courses).toHaveLength(3);
    const analog = normalized.courses.find((course) => course.name === "模拟电子技术基础B");
    expect(analog?.meetings[0]).toMatchObject({ startPeriod: 1, endPeriod: 2, weeks: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15] });
    const art = normalized.courses.find((course) => course.name === "世界美术欣赏");
    expect(art?.meetings[0]).toMatchObject({ startPeriod: 11, endPeriod: 13 });
    expect(weeksFromBitmap("010101010101010100000000000000")).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);

    const changed = rows.map((row) => ({ ...row, KCM: `${row.KCM}-改名`, SKJS: "变更教师", JASMC: "变更教室" }));
    const changedNormalized = await normalizeWiseduRows(changed, adapter.descriptor, semester);
    expect(changedNormalized.courses.map((course) => course.id).sort()).toEqual(normalized.courses.map((course) => course.id).sort());
  });

  it("extracts via current-user, jcjcx and cxxszhxqkb read-only API chain", async () => {
    const adapter = createWiseduAdapter(WHUT_PROFILE);
    const ctx = context();
    ctx.fetchImpl = fakeWhutFetch();
    const detection = await adapter.detect(ctx);
    expect(detection.detected).toBe(true);
    expect(detection.confidence).toBeGreaterThanOrEqual(0.9);
    const extraction = await adapter.extract(ctx, semester);
    expect(extraction.rawRows).toBe(3);
    expect(extraction.draft.warnings).not.toContain("未获取到当前用户信息，将使用用户填写的学期信息");
    const timetable = finalizeConnectorExtraction(extraction, adapter.descriptor, semester, { sourceKind: "extension", sourceUrl: ctx.url.href });
    expect(timetable.term.termId).toBe("2026-2027-1");
    expect(timetable.validation.status).toBe("verified");
    const events = await buildV2Events(timetable);
    expect(events.events.length).toBeGreaterThan(10);
    expect(new Set(events.events.map((event) => event.uid)).size).toBe(events.events.length);
  });

  it("fails clearly when the user is not on a logged-in timetable", async () => {
    const adapter = createWiseduAdapter(WHUT_PROFILE);
    const ctx = context("");
    ctx.fetchImpl = (async () => new Response(JSON.stringify({ datas: {} }), { status: 200 })) as typeof fetch;
    await expect(adapter.extract(ctx, semester)).rejects.toThrow(/空课表/);
  });
});
