import { describe, expect, it } from "vitest";
import { buildV2Events } from "../../src/v2/events";
import { makeCourseId, makeMeetingId } from "../../src/v2/ids";
import type { NormalizedTimetableV2, PeriodSchedule } from "../../src/v2/types";
import { validateTimetableV2 } from "../../src/v2/validate";

const semesterStart = "2026-08-31";

function schedules(): PeriodSchedule[] {
  return [
    {
      id: "s1",
      label: "第一套",
      effectiveFrom: semesterStart,
      effectiveTo: "2026-10-31",
      periods: [
        { index: 1, start: "08:00", end: "08:45" },
        { index: 2, start: "08:55", end: "09:40" },
        { index: 3, start: "10:00", end: "10:45" },
        { index: 4, start: "10:55", end: "11:40" },
      ],
    },
    {
      id: "s2",
      label: "第二套",
      effectiveFrom: "2026-11-01",
      periods: [
        { index: 1, start: "08:30", end: "09:15" },
        { index: 2, start: "09:25", end: "10:10" },
        { index: 3, start: "10:30", end: "11:15" },
        { index: 4, start: "11:25", end: "12:10" },
      ],
    },
  ];
}

async function timetable(): Promise<NormalizedTimetableV2> {
  const courseId = await makeCourseId({ adapterId: "test", sourceCourseId: "CS101", fallbackOrdinal: 1 });
  const meetingId = await makeMeetingId({
    courseId,
    sourceMeetingId: "CS101-M1",
    weekday: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeks: Array.from({ length: 12 }, (_, index) => index + 1),
  });
  return {
    schemaVersion: "2.0",
    source: {
      kind: "extension",
      adapterId: "test",
      adapterVersion: "1.0",
      schoolId: "school-test",
      schoolName: "测试大学",
      platform: "test",
      extractedAt: "2026-08-01T00:00:00.000Z",
    },
    term: {
      termId: "2026-2027-1",
      academicYear: "2026-2027",
      termCode: "1",
      termName: "2026 秋季",
      semesterStart,
      teachingWeeks: 12,
      timezone: "Asia/Shanghai",
      periodSchedules: schedules(),
    },
    courses: [
      {
        id: courseId,
        name: "数据结构",
        teachingClass: "01班",
        meetings: [
          {
            id: meetingId,
            teacher: "张老师",
            room: "A101",
            weekday: 1,
            startPeriod: 1,
            endPeriod: 2,
            weeks: Array.from({ length: 12 }, (_, index) => index + 1),
            weekRule: "1-12",
            source: { sourceCourseId: "CS101", sourceRef: "row:1" },
          },
        ],
      },
    ],
    overrides: [
      {
        id: "cancel-2",
        type: "cancel",
        courseId,
        meetingId,
        originalDate: "2026-09-07",
        confirmed: true,
        reason: "停课",
      },
      {
        id: "move-3",
        type: "reschedule",
        courseId,
        meetingId,
        originalDate: "2026-09-14",
        newDate: "2026-09-19",
        startPeriod: 3,
        endPeriod: 4,
        room: "B202",
        confirmed: true,
        reason: "调课",
      },
      {
        id: "makeup-4",
        type: "makeup",
        courseId,
        meetingId,
        newDate: "2026-09-25",
        startPeriod: 3,
        endPeriod: 4,
        confirmed: true,
        reason: "补课",
      },
      {
        id: "unconfirmed",
        type: "cancel",
        courseId,
        meetingId,
        originalDate: "2026-09-21",
        confirmed: false,
      },
    ],
    metadata: {
      extractedAt: "2026-08-01T00:00:00.000Z",
      sourceKind: "extension",
      method: "api",
      rawCount: 1,
      parsedCount: 1,
      skippedCount: 0,
      adapterId: "test",
      adapterVersion: "1.0",
    },
    validation: {
      status: "partial",
      checks: [],
      completeness: {
        courseCount: 1,
        meetingCount: 1,
        missingTeacher: 0,
        missingRoom: 0,
        missingPeriods: 0,
        unknownWeekRules: 0,
        adjustmentDataAvailable: true,
      },
    },
  };
}

describe("v2 event engine", () => {
  it("applies effective period schedules and confirmed overrides", async () => {
    const result = await buildV2Events(await timetable());
    const dates = result.events.map((event) => event.date);
    expect(dates).not.toContain("2026-09-07");
    expect(dates).not.toContain("2026-09-14");
    expect(dates).toContain("2026-09-19");
    expect(dates).toContain("2026-09-25");
    const late = result.events.find((event) => event.date === "2026-11-02");
    expect(late).toMatchObject({ start: "08:30", end: "10:10" });
    const moved = result.events.find((event) => event.date === "2026-09-19");
    expect(moved).toMatchObject({ startPeriod: 3, endPeriod: 4, room: "B202" });
    expect(result.issues.some((issue) => issue.code === "unconfirmed_override_ignored")).toBe(true);
  });

  it("keeps UID independent of title, teacher and room changes", async () => {
    const before = await buildV2Events(await timetable());
    const changed = await timetable();
    changed.courses[0]!.name = "改名后的课程";
    changed.courses[0]!.meetings[0]!.teacher = "李老师";
    changed.courses[0]!.meetings[0]!.room = "C303";
    const after = await buildV2Events(changed);
    expect(after.events.map((event) => event.uid).sort()).toEqual(before.events.map((event) => event.uid).sort());
  });

  it("validates the normalized exchange model", async () => {
    const report = validateTimetableV2(await timetable());
    expect(report.status).toBe("verified");
    expect(report.completeness.courseCount).toBe(1);
    expect(report.completeness.adjustmentDataAvailable).toBe(true);
  });
});
