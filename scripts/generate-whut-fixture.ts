import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";
import { createWhutAdapter } from "../src/connectors/schools/whut-adapter";
import { finalizeConnectorExtraction } from "../src/connectors/sdk/normalize";
import { serializeTericsJson } from "../src/v2/exchange";
import type { ConnectorContext, SemesterSelection } from "../src/v2/types";

const readJson = (path: string) => JSON.parse(readFileSync(resolve(path), "utf8"));
const currentUser = readJson("fixtures/connectors/whut/current-user.json");
const sections = readJson("fixtures/connectors/whut/sections.json");
const schedule = readJson("fixtures/connectors/whut/schedule-detail.json");
const calls: Array<{ url: string; method: string; body: string | null }> = [];

const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = String(input);
  calls.push({ url, method: init.method ?? "GET", body: typeof init.body === "string" ? init.body : null });
  let body: unknown;
  if (url.includes("currentUser.do")) body = currentUser;
  else if (url.includes("getSections.do")) body = sections;
  else if (url.includes("getMyScheduleDetail.do")) body = schedule;
  else return new Response("not found", { status: 404 });
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const window = new Window({ url: "https://jwxt.whut.edu.cn/jwapp/sys/homeapp/home/index.html" });
window.document.documentElement.innerHTML = "<body>教学管理系统 我的课表</body>";
const context: ConnectorContext = {
  url: new URL("https://jwxt.whut.edu.cn/jwapp/sys/homeapp/home/index.html"),
  document: window.document as unknown as Document,
  fetchImpl,
  now: () => new Date("2026-11-06T04:00:00.000Z"),
};
const semester: SemesterSelection = {
  academicYear: "2026-2027",
  termCode: "1",
  termName: "2026 秋季",
  semesterStart: "2026-08-31",
  teachingWeeks: 20,
  timezone: "Asia/Shanghai",
};
const adapter = createWhutAdapter();
const extraction = await adapter.extract(context, semester);
const timetable = finalizeConnectorExtraction(extraction, adapter.descriptor, semester, {
  sourceKind: "extension",
  sourceUrl: context.url.href,
  extractedAt: "2026-11-06T04:00:00.000Z",
});
const output = resolve("fixtures/exchange/whut-real-shape.terics.json");
writeFileSync(output, serializeTericsJson(timetable), "utf8");
console.log(`Wrote ${output}`);
console.log(`courses=${timetable.courses.length} meetings=${timetable.courses.flatMap((course) => course.meetings).length} firstMonday=${timetable.term.semesterStart}`);
console.log(`requests=${calls.map((call) => `${call.method} ${new URL(call.url).pathname}`).join(" | ")}`);
