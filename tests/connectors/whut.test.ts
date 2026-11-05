import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { finalizeConnectorExtraction } from "../../src/connectors/sdk/normalize";
import {
  createWhutAdapter,
  normalizeWhutScheduleDetail,
  parseWhutSections,
  parseWhutTermCode,
  parseWhutWeekBitmap,
  resolveWhutDisplayDate,
  resolveWhutTermContext,
} from "../../src/connectors/schools/whut-adapter";
import { buildV2Events } from "../../src/v2/events";
import type { ConnectorContext, SemesterSelection } from "../../src/v2/types";

const semester: SemesterSelection = {
  academicYear: "2026-2027",
  termCode: "1",
  termName: "2026 秋季",
  semesterStart: "2026-08-31",
  teachingWeeks: 20,
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function context(): ConnectorContext {
  const window = new Window({ url: "https://jwxt.whut.edu.cn/jwapp/sys/homeapp/home/index.html" });
  window.document.documentElement.innerHTML = "<body>教学管理系统 我的课表 学生业务工作台</body>";
  return {
    url: new URL("https://jwxt.whut.edu.cn/jwapp/sys/homeapp/home/index.html"),
    document: window.document as unknown as Document,
    fetchImpl: globalThis.fetch,
    now: () => new Date("2026-11-06T04:00:00.000Z"),
  };
}

interface CallRecord {
  url: string;
  method: string;
  body: string | null;
}

function fakeWhutFetch(options: {
  currentUser?: unknown;
  sections?: unknown;
  schedule?: unknown;
  status?: number;
} = {}): { fetchImpl: typeof fetch; calls: CallRecord[] } {
  const currentUser = options.currentUser ?? readJson("fixtures/connectors/whut/current-user.json");
  const sections = options.sections ?? readJson("fixtures/connectors/whut/sections.json");
  const schedule = options.schedule ?? readJson("fixtures/connectors/whut/schedule-detail.json");
  const calls: CallRecord[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? "GET", body: typeof init.body === "string" ? init.body : null });
    const status = options.status ?? 200;
    let body: unknown = { code: "0", datas: {} };
    if (url.includes("currentUser.do")) body = currentUser;
    else if (url.includes("getSections.do")) body = sections;
    else if (url.includes("getMyScheduleDetail.do")) body = schedule;
    if (status >= 400) {
      body = "<html>login</html>";
      return new Response(String(body), { status, headers: { "content-type": "text/html" } });
    }
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("WHUT 2026 jwapp adapter", () => {
  it("detects the live WHUT jwapp page with high confidence", async () => {
    const adapter = createWhutAdapter();
    const detection = await adapter.detect(context());
    expect(detection.detected).toBe(true);
    expect(detection.confidence).toBeGreaterThanOrEqual(0.9);
    expect(detection.evidence).toContain("whut.edu.cn 域名");
  });

  it("resolves the confirmed term context: week 9 Friday -> 2026-09-07", () => {
    const user = readJson<{ datas: { welcomeInfo: Record<string, unknown> } }>(
      "fixtures/connectors/whut/current-user.json",
    ).datas;
    const term = resolveWhutTermContext(user as never, new Date("2026-11-06T04:00:00.000Z"));
    expect(parseWhutTermCode(term.termId)).toMatchObject({ startYear: 2026, endYear: 2027, termCode: "1" });
    expect(term.currentWeek).toBe(9);
    expect(term.currentDate).toBe("2026-11-06");
    expect(term.currentWeekday).toBe(5);
    expect(term.firstTeachingMonday).toBe("2026-09-07");
  });

  it("uses the real request chain and exact form body", async () => {
    const adapter = createWhutAdapter();
    const ctx = context();
    const fake = fakeWhutFetch();
    ctx.fetchImpl = fake.fetchImpl;
    const extraction = await adapter.extract(ctx, semester);
    expect(extraction.rawRows).toBe(4);
    expect(extraction.parsedRows).toBe(4);
    expect(extraction.skippedRows).toBe(0);
    expect(extraction.draft.termSource).toBe("adapter");
    expect(extraction.draft.courses).toHaveLength(3);
    expect(extraction.draft.courses.flatMap((course) => course.meetings)).toHaveLength(4);
    expect(fake.calls.some((call) => call.url.includes("changeAppRole.do"))).toBe(false);
    expect(fake.calls.map((call) => call.method)).toEqual(["GET", "GET", "POST"]);
    expect(fake.calls[1]?.url).toContain("termCode=2026-2027-1");
    expect(fake.calls[1]?.url).toContain("campusCode=");
    expect(fake.calls[2]?.url).toContain("/student/getMyScheduleDetail.do");
    expect(Object.fromEntries(new URLSearchParams(fake.calls[2]?.body ?? ""))).toEqual({
      termCode: "2026-2027-1",
      campusCode: "",
      type: "week",
      week: "9",
    });
    expect(extraction.evidence).toContain("POST getMyScheduleDetail.do form: termCode,campusCode,type=week,week");

    const timetable = finalizeConnectorExtraction(extraction, adapter.descriptor, semester, {
      sourceKind: "extension",
      sourceUrl: ctx.url.href,
    });
    expect(timetable.term.semesterStart).toBe("2026-09-07");
    expect(timetable.term.teachingWeeks).toBe(18);
    expect(timetable.term.periodSchedules[0]?.periods).toHaveLength(13);
    expect(timetable.term.periodSchedules[0]?.periods[0]).toMatchObject({ index: 1, start: "08:00", end: "08:45" });
    expect(timetable.term.periodSchedules[0]?.periods[8]).toMatchObject({ index: 9, start: "16:45", end: "17:30" });
    expect(timetable.warnings?.some((warning) => warning.includes("已采用教务值"))).toBe(true);

    const events = await buildV2Events(timetable);
    expect(events.events).toHaveLength(37);
    const friday = events.events.find((event) => event.date === "2026-11-06" && event.title === "数据结构基础");
    expect(friday).toMatchObject({ startPeriod: 6, endPeriod: 9, start: "14:00", end: "17:30", week: 9 });
    expect(new Set(events.events.map((event) => event.uid)).size).toBe(events.events.length);
  });

  it("parses variable-length week bitmaps without truncation", () => {
    expect(parseWhutWeekBitmap("1111111111111111").weeks).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
    expect(parseWhutWeekBitmap("1010101010101010").weeks).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
    expect(parseWhutWeekBitmap("0101010101010101").weeks).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    expect(parseWhutWeekBitmap("1000000010000000001").weeks).toEqual([1, 9, 19]);
    expect(parseWhutWeekBitmap("0010100")).toMatchObject({ weeks: [3, 5], weekRule: "3,5" });
    expect(parseWhutWeekBitmap("0000000000000000000000001000000000").weeks).toEqual([25]);
    expect(parseWhutWeekBitmap(`${"0".repeat(34)}1`).weeks).toEqual([35]);
    expect(parseWhutWeekBitmap("").error).toContain("为空");
    expect(parseWhutWeekBitmap("01020").error).toContain("非 0/1");
    expect(parseWhutWeekBitmap("0000").error).toContain("未标记");
  });

  it("rejects malformed registrar dates and invalid teaching weeks", () => {
    expect(() => resolveWhutDisplayDate("今天是13月6日 星期五", "2026-2027-1", new Date("2026-11-06T04:00:00.000Z"))).toThrow(
      /日期/,
    );
    expect(() =>
      resolveWhutTermContext(
        { welcomeInfo: { xnxqdm: "2026-2027-1", classWeek: 0, date: "今天是11月6日 星期五" } },
        new Date("2026-11-06T04:00:00.000Z"),
      ),
    ).toThrow(/教学周/);
    expect(() => resolveWhutDisplayDate("2026-11-06 星期四", "2026-2027-1", new Date("2026-11-06T04:00:00.000Z"))).toThrow(
      /星期不一致/,
    );
  });

  it("keeps IDs stable when mutable display data changes", async () => {
    const adapter = createWhutAdapter();
    const schedule = readJson<{ datas: Parameters<typeof normalizeWhutScheduleDetail>[0] }>(
      "fixtures/connectors/whut/schedule-detail.json",
    ).datas;
    const sections = parseWhutSections(
      readJson("fixtures/connectors/whut/sections.json"),
      "2026-2027-1",
      "",
      "2026-09-07",
    ).schedule;
    const user = readJson<{ datas: Parameters<typeof resolveWhutTermContext>[0] }>(
      "fixtures/connectors/whut/current-user.json",
    ).datas;
    const term = resolveWhutTermContext(user, new Date("2026-11-06T04:00:00.000Z"));
    const before = await normalizeWhutScheduleDetail(schedule, adapter.descriptor, term, sections);
    const changed = structuredClone(schedule);
    for (const row of changed.arrangedList ?? []) {
      row.courseName = `${row.courseName}-改名`;
      row.weeksAndTeachers = "变更教师";
      row.titleDetail = [row.courseName, "变更教师", row.titleDetail?.[2] ?? "", row.titleDetail?.[3] ?? ""];
      row.placeName = "变更教室";
    }
    const after = await normalizeWhutScheduleDetail(changed, adapter.descriptor, term, sections);
    expect(after.courses.map((course) => course.id).sort()).toEqual(before.courses.map((course) => course.id).sort());
    expect(after.courses.flatMap((course) => course.meetings.map((meeting) => meeting.id)).sort()).toEqual(
      before.courses.flatMap((course) => course.meetings.map((meeting) => meeting.id)).sort(),
    );
  });

  it("reports unsupported collections and incomplete section schedules as partial warnings", async () => {
    const adapter = createWhutAdapter();
    const ctx = context();
    const partial = readJson("fixtures/connectors/whut/partial-response.json");
    const sections = structuredClone(readJson<{ datas: unknown[] }>("fixtures/connectors/whut/sections.json"));
    sections.datas.splice(12, 1);
    const fake = fakeWhutFetch({ schedule: partial, sections });
    ctx.fetchImpl = fake.fetchImpl;
    const extraction = await adapter.extract(ctx, semester);
    expect(extraction.rawRows).toBe(3);
    expect(extraction.parsedRows).toBe(2);
    expect(extraction.skippedRows).toBe(1);
    expect(extraction.draft.warnings.some((warning) => warning.includes("notArrangeList"))).toBe(true);
    expect(extraction.draft.warnings.some((warning) => warning.includes("缺少第 13 节"))).toBe(true);
  });

  it("distinguishes expired login from an empty timetable", async () => {
    const adapter = createWhutAdapter();
    const expired = context();
    expired.fetchImpl = fakeWhutFetch({ status: 401 }).fetchImpl;
    await expect(adapter.extract(expired, semester)).rejects.toMatchObject({ code: "login_expired" });

    const empty = context();
    empty.fetchImpl = fakeWhutFetch({ schedule: readJson("fixtures/connectors/whut/empty-response.json") }).fetchImpl;
    await expect(adapter.extract(empty, semester)).rejects.toMatchObject({ code: "empty_timetable" });
  });
});
