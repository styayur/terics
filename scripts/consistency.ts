import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { buildEvents } from "../src/core/course";
import { parseTimetableFile } from "../src/core/parsers/index";
import { DEFAULT_PERIODS, TIMEZONE, type ParseResult } from "../src/core/types";
import { parseTericsJson } from "../src/v2/exchange";
import { buildV2Events } from "../src/v2/events";

const dom = new Window();
(globalThis as Record<string, unknown>).window = dom;
(globalThis as Record<string, unknown>).document = dom.document;
(globalThis as Record<string, unknown>).DOMParser = dom.DOMParser;
(globalThis as Record<string, unknown>).HTMLTableCellElement = dom.HTMLTableCellElement;

const fixtures = [
  "fixtures/csv/terics_sample.csv",
  "fixtures/html/qingguo_list_sample.xls",
  "fixtures/html/wakeup_usc_sample.html",
  "fixtures/xlsx/wakeup_schedule_template.xlsx",
];

const config = {
  title: "一致性测试课表",
  semesterStart: "2026-08-31",
  timezone: TIMEZONE,
  periods: DEFAULT_PERIODS.map((period) => ({ ...period })),
  alarmMinutes: 10,
};

function coursesOf(parsed: ParseResult) {
  return parsed.courses
    .map((course) => ({
      name: course.name,
      teacher: course.teacher,
      location: course.location,
      weekday: course.weekday,
      startPeriod: course.startPeriod,
      endPeriod: course.endPeriod,
      weeks: [...course.weeks],
      note: course.note,
    }))
    .sort((a, b) => {
      const left = `${a.name}\u001f${a.weekday}\u001f${a.startPeriod}\u001f${a.endPeriod}\u001f${a.weeks.join(",")}`;
      const right = `${b.name}\u001f${b.weekday}\u001f${b.startPeriod}\u001f${b.endPeriod}\u001f${b.weeks.join(",")}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });
}

const snapshot = [];
for (const fixture of fixtures) {
  const bytes = new Uint8Array(readFileSync(resolve(fixture)));
  const parsed = await parseTimetableFile({ fileName: fixture.split("/").at(-1) ?? fixture, bytes });
  const built = await buildEvents(config, parsed.courses);
  const events = built.events
    .map((event) => ({
      uid: event.uid,
      title: event.title,
      teacher: event.teacher,
      location: event.location,
      weekday: event.weekday,
      startPeriod: event.startPeriod,
      endPeriod: event.endPeriod,
      week: event.week,
      date: event.date,
      start: event.start,
      end: event.end,
    }))
    .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  snapshot.push({
    fixture,
    format: parsed.format,
    courses: coursesOf(parsed),
    events,
    conflictCount: built.conflicts.length,
  });
}

const v2Fixtures = [
  "fixtures/exchange/overrides.terics.json",
  "fixtures/exchange/whut-real-shape.terics.json",
];
for (const fixture of v2Fixtures) {
  const v2Timetable = parseTericsJson(readFileSync(resolve(fixture), "utf8"));
  const v2Build = await buildV2Events(v2Timetable);
  snapshot.push({
    fixture,
    format: "terics-v2",
    courses: v2Timetable.courses
      .map((course) => ({
        id: course.id,
        name: course.name,
        meetings: course.meetings
          .map((meeting) => ({
            id: meeting.id,
            teacher: meeting.teacher,
            room: meeting.room,
            weekday: meeting.weekday,
            startPeriod: meeting.startPeriod,
            endPeriod: meeting.endPeriod,
            weeks: [...meeting.weeks],
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    events: v2Build.events
      .map((event) => ({
        uid: event.uid,
        title: event.title,
        teacher: event.teacher,
        location: event.room,
        weekday: event.weekday,
        startPeriod: event.startPeriod,
        endPeriod: event.endPeriod,
        week: event.week,
        date: event.date,
        start: event.start,
        end: event.end,
      }))
      .sort((a, b) => a.uid.localeCompare(b.uid)),
    conflictCount: v2Build.conflicts.length,
  });
}

const pythonCandidates: string[] = [
  process.env.PYTHON,
  process.platform === "win32" ? resolve(".venv/Scripts/python.exe") : resolve(".venv/bin/python"),
  process.platform === "win32" ? "python" : "python3",
].filter((value): value is string => Boolean(value));

let pythonRun;
for (const candidate of pythonCandidates) {
  pythonRun = spawnSync(candidate, ["python/tools/snapshot.py"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (pythonRun.status === 0) break;
}
if (!pythonRun || pythonRun.status !== 0) {
  console.error(pythonRun?.stderr || pythonRun?.error || "Python snapshot failed");
  process.exit(1);
}

const pythonSnapshot = JSON.parse(pythonRun.stdout);
const left = JSON.stringify(snapshot, null, 2);
const right = JSON.stringify(pythonSnapshot, null, 2);
if (left !== right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  console.error("Web/Python snapshot mismatch at character", index);
  console.error("--- Web ---\n", left.slice(Math.max(0, index - 400), index + 1200));
  console.error("--- Python ---\n", right.slice(Math.max(0, index - 400), index + 1200));
  process.exit(1);
}
console.log(`Cross-language consistency passed: ${snapshot.length} fixtures, ${snapshot.reduce((sum, item) => sum + item.events.length, 0)} events.`);
