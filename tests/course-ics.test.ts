import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEvents } from "../src/core/course";
import { generateIcs } from "../src/core/ics";
import { parseTimetableFile } from "../src/core/parsers";
import { DEFAULT_PERIODS, TIMEZONE, type SemesterConfig } from "../src/core/types";

function bytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(path)));
}

function config(overrides: Partial<SemesterConfig> = {}): SemesterConfig {
  return {
    title: "2026 秋季课表",
    semesterStart: "2026-08-31",
    timezone: TIMEZONE,
    periods: DEFAULT_PERIODS.map((period) => ({ ...period })),
    alarmMinutes: 10,
    ...overrides,
  };
}

async function sampleCourses() {
  const result = await parseTimetableFile({
    fileName: "courses.csv",
    bytes: bytes("fixtures/csv/terics_sample.csv"),
  });
  return result.courses;
}

describe("calendar event generation", () => {
  it("generates one event per teaching-week occurrence and handles cross-year dates", async () => {
    const result = await buildEvents(config(), await sampleCourses());
    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
    expect(result.events).toHaveLength(62);
    const firstMath = result.events.find((event) => event.title === "高等数学A" && event.week === 1);
    expect(firstMath).toMatchObject({
      date: "2026-08-31",
      start: "08:00",
      end: "09:40",
      weekday: 1,
      startPeriod: 1,
      endPeriod: 2,
    });
    const crossYear = result.events.find((event) => event.title === "跨月实验" && event.week === 18);
    expect(crossYear).toMatchObject({ date: "2027-01-02", start: "19:00", end: "20:40" });
    expect(result.conflicts).toHaveLength(0);
  });

  it("deduplicates internal repeats and keeps UID stable when editable clock times change", async () => {
    const courses = await sampleCourses();
    const first = await buildEvents(config(), courses);
    const duplicated = await buildEvents(config(), [...courses, courses[0]!]);
    expect(duplicated.events).toHaveLength(first.events.length);

    const shifted = DEFAULT_PERIODS.map((period) =>
      period.index === 1 ? { ...period, start: "08:10", end: "08:55" } : { ...period },
    );
    const second = await buildEvents(config({ periods: shifted }), courses);
    expect(second.events[0]?.uid).toBe(first.events[0]?.uid);
    expect(second.events[0]?.start).toBe("08:10");
  });

  it("keeps legacy event identity independent of mutable display fields", async () => {
    const courses = await sampleCourses();
    const before = await buildEvents(config(), courses);
    const changed = courses.map((course, index) =>
      index === 0 ? { ...course, name: `${course.name}-改名`, teacher: "变更教师", location: "变更教室" } : course,
    );
    const after = await buildEvents(config(), changed);
    expect(after.events[0]?.uid).toBe(before.events[0]?.uid);
  });

  it("detects overlapping courses on each affected date", async () => {
    const parsed = await parseTimetableFile({
      fileName: "conflict.csv",
      bytes: bytes("fixtures/csv/conflict_sample.csv"),
    });
    const result = await buildEvents(config(), parsed.courses);
    expect(result.conflicts).toHaveLength(2);
    expect(result.issues.some((issue) => issue.code === "course_conflict")).toBe(true);
    expect(result.conflicts[0]?.labels.join(" ")).toContain("冲突课A");
  });

  it("rejects a semester start that is not Monday and invalid custom periods", async () => {
    const courses = await sampleCourses();
    const wrongMonday = await buildEvents(config({ semesterStart: "2026-09-01" }), courses);
    expect(wrongMonday.issues[0]).toMatchObject({ code: "semester_start_not_monday" });

    const badPeriods = config().periods.map((period) =>
      period.index === 2 ? { ...period, end: "07:00" } : period,
    );
    const invalid = await buildEvents(config({ periods: badPeriods }), courses);
    expect(invalid.issues.some((issue) => issue.code === "period_time_order")).toBe(true);
  });
});

describe("RFC 5545 output", () => {
  it("produces CRLF, <=75-byte folded lines, VTIMEZONE and one event per occurrence", async () => {
    const output = await generateIcs(config(), await sampleCourses(), {
      now: new Date("2026-08-01T00:00:00Z"),
    });
    const ics = output.ics;
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replaceAll("\r\n", "").includes("\n")).toBe(false);
    for (const line of ics.split("\r\n").filter(Boolean)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:Asia/Shanghai");
    expect(ics).toContain("DTSTAMP:20260801T000000Z");

    const { default: ICAL } = await import("ical.js");
    const calendar = new ICAL.Component(ICAL.parse(ics));
    const calendars = calendar.getAllSubcomponents("vtimezone");
    const events = calendar.getAllSubcomponents("vevent");
    expect(calendars).toHaveLength(1);
    expect(events).toHaveLength(62);
    expect(calendar.getFirstPropertyValue("x-wr-timezone")).toBe("Asia/Shanghai");

    const mathProperty = events
      .map((component) => new ICAL.Event(component))
      .find((event) => event.summary === "高等数学A");
    expect(mathProperty).toBeDefined();
    expect(mathProperty?.startDate.toString()).toBe("2026-08-31T08:00:00");
    expect(mathProperty?.endDate.toString()).toBe("2026-08-31T09:40:00");
    expect(mathProperty?.component.getFirstProperty("dtstart")?.getParameter("tzid")).toBe(
      "Asia/Shanghai",
    );
  });

  it("escapes newlines, commas, semicolons and backslashes without creating injected events", async () => {
    const output = await generateIcs(
      config({ title: "安全,课表;测试", alarmMinutes: 0 }),
      [
        {
          name: "正常课\r\nBEGIN:VEVENT\r\nSUMMARY:注入",
          teacher: "张,老师;测试\\路径",
          location: "A101\r\nEND:VEVENT",
          weekday: 1,
          startPeriod: 1,
          endPeriod: 2,
          weeks: [1],
          weekRule: "1",
          note: "第一行\n第二行",
        },
      ],
      { now: new Date("2026-08-01T00:00:00Z") },
    );
    expect(output.ics).not.toContain("\r\nBEGIN:VEVENT\r\nSUMMARY:注入");
    const { default: ICAL } = await import("ical.js");
    const calendar = new ICAL.Component(ICAL.parse(output.ics));
    const events = calendar.getAllSubcomponents("vevent");
    expect(events).toHaveLength(1);
    expect(events[0]?.getFirstPropertyValue("summary")).toContain("BEGIN:VEVENT");
    expect(events[0]?.getFirstPropertyValue("summary")).toContain("\n");
  });

  it("folds long multi-byte text without breaking UTF-8 and remains parseable", async () => {
    const longName = "超长课程名称".repeat(30);
    const output = await generateIcs(
      config({ alarmMinutes: 0 }),
      [
        {
          name: longName,
          teacher: "教师",
          location: "教学大楼",
          weekday: 2,
          startPeriod: 3,
          endPeriod: 4,
          weeks: [1],
          weekRule: "1",
          note: "",
        },
      ],
      { now: new Date("2026-08-01T00:00:00Z") },
    );
    for (const line of output.ics.split("\r\n").filter(Boolean)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    const { default: ICAL } = await import("ical.js");
    const calendar = new ICAL.Component(ICAL.parse(output.ics));
    expect(calendar.getAllSubcomponents("vevent")).toHaveLength(1);
    expect(calendar.getFirstSubcomponent("vevent")?.getFirstPropertyValue("summary")).toBe(longName);
  });
});
