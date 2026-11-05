import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { createWiseduAdapter } from "../../src/connectors/vendors/wisedu";
import type { ConnectorContext, SemesterSelection } from "../../src/v2/types";

const semester: SemesterSelection = {
  academicYear: "2026-2027",
  termCode: "1",
  termName: "测试学期",
  semesterStart: "2026-08-31",
  teachingWeeks: 18,
};

function context(): ConnectorContext {
  const window = new Window({ url: "https://example.edu.cn/jwapp/sys/homeapp/index.do" });
  window.document.documentElement.innerHTML = "<body>EMAP jwapp 学生课表</body>";
  return {
    url: new URL("https://example.edu.cn/jwapp/sys/homeapp/index.do"),
    document: window.document as unknown as Document,
    fetchImpl: globalThis.fetch,
    now: () => new Date("2026-11-06T04:00:00.000Z"),
  };
}

describe("generic Wisedu adapter", () => {
  it("stays on the generic endpoint and never switches academic role", async () => {
    const calls: string[] = [];
    const ctx = context();
    ctx.fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      let value: unknown = { datas: {} };
      if (url.includes("currentUser.do")) value = { datas: { welcomeInfo: { xnxqdm: "2026-2027-1" } } };
      else if (url.includes("jcjcx.do")) value = { datas: { jcjcx: { rows: [{ DM: 1, MC: "第一节", KSSJ: "08:00", JSSJ: "08:45" }, { DM: 2, MC: "第二节", KSSJ: "08:55", JSSJ: "09:40" }] } } };
      else if (url.includes("xskcb.do")) value = {
        datas: {
          xskcb: {
            rows: [{ KCM: "通用金智测试课", KCH: "GEN101", JXBID: "GEN-CLASS-1", SKJS: "测试教师", JASMC: "测试教室", SKXQ: 2, KSJC: 1, JSJC: 2, SKZC: "000001111111100000000000000000", ZCMC: "6-13周", KBID: "GEN-MEETING-1" }],
          },
        },
      };
      return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const adapter = createWiseduAdapter();
    const extraction = await adapter.extract(ctx, semester);
    expect(adapter.descriptor.status).toBe("experimental");
    expect(extraction.draft.courses).toHaveLength(1);
    expect(extraction.draft.courses[0]?.meetings[0]).toMatchObject({ weekday: 2, startPeriod: 1, endPeriod: 2 });
    expect(calls.some((url) => url.includes("changeAppRole"))).toBe(false);
    expect(calls.some((url) => url.includes("cxxszhxqkb.do"))).toBe(false);
  });
});
