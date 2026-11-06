import { describe, expect, it } from "vitest";
import { generateIcsV2 } from "../../src/v2/ics";
import { makeCourseId, makeMeetingId } from "../../src/v2/ids";
import { previewCourseRemoval, removeCourseFromIcs, removeCourseFromTimetable } from "../../src/v2/removal";
import type { NormalizedTimetableV2 } from "../../src/v2/types";
import { buildV2Events } from "../../src/v2/events";

async function timetable(): Promise<NormalizedTimetableV2> {
  const courseA = await makeCourseId({ adapterId: "test", sourceCourseId: "A", fallbackOrdinal: 1 });
  const courseB = await makeCourseId({ adapterId: "test", sourceCourseId: "B", fallbackOrdinal: 2 });
  const meetingA = await makeMeetingId({ courseId: courseA, sourceMeetingId: "MA", weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2, 3] });
  const meetingB = await makeMeetingId({ courseId: courseB, sourceMeetingId: "MB", weekday: 2, startPeriod: 3, endPeriod: 4, weeks: [1, 3] });
  return {
    schemaVersion: "2.0",
    source: { kind: "web", adapterId: "test", adapterVersion: "1.0", extractedAt: "2026-08-01T00:00:00.000Z" },
    term: {
      termId: "TERM-REMOVE",
      academicYear: "2026-2027",
      termCode: "1",
      termName: "删除测试",
      semesterStart: "2026-08-31",
      teachingWeeks: 3,
      timezone: "Asia/Shanghai",
      periodSchedules: [
        {
          id: "p",
          label: "默认",
          effectiveFrom: "2026-08-31",
          periods: [
            { index: 1, start: "08:00", end: "08:45" },
            { index: 2, start: "08:55", end: "09:40" },
            { index: 3, start: "10:00", end: "10:45" },
            { index: 4, start: "10:55", end: "11:40" },
          ],
        },
      ],
    },
    courses: [
      {
        id: courseA,
        name: "同名课程",
        source: { sourceCourseId: "A" },
        meetings: [{ id: meetingA, teacher: "共享教师", room: "A101", weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2, 3], weekRule: "1-3" }],
      },
      {
        id: courseB,
        name: "同名课程",
        source: { sourceCourseId: "B" },
        meetings: [{ id: meetingB, teacher: "共享教师", room: "B202", weekday: 2, startPeriod: 3, endPeriod: 4, weeks: [1, 3], weekRule: "1,3" }],
      },
    ],
    overrides: [
      { id: "cancel-a", type: "cancel", courseId: courseA, meetingId: meetingA, originalDate: "2026-09-14", reason: "测试", confirmed: true },
      { id: "makeup-b", type: "makeup", courseId: courseB, meetingId: meetingB, newDate: "2026-09-19", startPeriod: 3, endPeriod: 4, room: "B202", confirmed: true },
    ],
    metadata: {
      extractedAt: "2026-08-01T00:00:00.000Z",
      sourceKind: "web",
      method: "manual",
      rawCount: 2,
      parsedCount: 2,
      skippedCount: 0,
      adapterId: "test",
      adapterVersion: "1.0",
    },
    validation: {
      status: "verified",
      checks: [],
      completeness: {
        courseCount: 2,
        meetingCount: 2,
        missingTeacher: 0,
        missingRoom: 0,
        missingPeriods: 0,
        unknownWeekRules: 0,
        adjustmentDataAvailable: true,
      },
    },
  };
}

describe("whole-course removal", () => {
  it("removes only the exact courseId and related overrides", async () => {
    const data = await timetable();
    const target = data.courses[0]!;
    const kept = data.courses[1]!;
    const events = (await buildV2Events(data)).events;
    const preview = previewCourseRemoval(data, events, target.id);
    expect(preview).toMatchObject({ courseName: "同名课程", meetingCount: 1, occurrenceCount: 3, overrideCount: 1 });
    const result = removeCourseFromTimetable(data, target.id);
    expect(result.timetable.courses.map((course) => course.id)).toEqual([kept.id]);
    expect(result.timetable.overrides.map((override) => override.courseId)).toEqual([kept.id]);
    expect(result.removedOverrides).toBe(1);
    expect(result.beforeMeetings - result.afterMeetings).toBe(1);
    expect(data.courses).toHaveLength(2);
  });

  it("never falls back to title matching and refuses an empty result", async () => {
    const data = await timetable();
    expect(() => removeCourseFromTimetable(data, "course-not-real")).toThrow(/courseId/);
    const one = structuredClone(data);
    one.courses = one.courses.slice(0, 1);
    one.overrides = one.overrides.filter((override) => override.courseId === one.courses[0]!.id);
    expect(() => removeCourseFromTimetable(one, one.courses[0]!.id)).toThrow(/没有课程/);
  });

  it("removes matching VEVENTs from ICS while preserving other courses and VTIMEZONE", async () => {
    const data = await timetable();
    const generated = await generateIcsV2(data);
    const targetId = data.courses[0]!.id;
    const keptUids = generated.events.filter((event) => event.courseId !== targetId).map((event) => event.uid);
    const removed = removeCourseFromIcs(generated.ics, targetId);
    expect(removed.removedEvents).toBe(generated.events.filter((event) => event.courseId === targetId).length);
    expect(removed.remainingEvents).toBe(keptUids.length);
    expect(removed.ics).toContain("BEGIN:VTIMEZONE");
    expect(removed.ics.split("\r\n").some((line) => line.startsWith(" "))).toBe(true);
    expect(removed.ics.replace(/\r\n/g, "")).not.toContain("\n");
    expect(removed.ics).not.toContain(`X-TERICS-COURSE-ID:${targetId}`);
    for (const uid of keptUids) expect(removed.ics).toContain(`UID:${uid}`);
    expect(removed.skippedWithoutCourseId).toBe(0);
  });

  it("rejects title-only legacy ICS and empty ICS results", () => {
    const legacy = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:terics-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@terics",
      "SUMMARY:同名课程",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(() => removeCourseFromIcs(legacy, "course-1")).toThrow(/不会按课程标题删除/);
    const oneCourse = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:one",
      "X-TERICS-COURSE-ID:course-1",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(() => removeCourseFromIcs(oneCourse, "course-1")).toThrow(/ICS 将为空/);
  });
});
