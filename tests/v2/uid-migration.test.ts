import { describe, expect, it } from "vitest";
import { generateIcsV2 } from "../../src/v2/ics";
import { makeCourseId, makeMeetingId } from "../../src/v2/ids";
import { applyUidMigration, legacyUidForEvent, previewUidMigration } from "../../src/v2/uid-migration";
import type { NormalizedTimetableV2 } from "../../src/v2/types";

async function timetable(): Promise<NormalizedTimetableV2> {
  const courseId = await makeCourseId({ adapterId: "test", sourceCourseId: "C", fallbackOrdinal: 1 });
  const meetingId = await makeMeetingId({ courseId, sourceMeetingId: "M", weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2] });
  return {
    schemaVersion: "2.0",
    source: { kind: "web", adapterId: "test", adapterVersion: "1.0", extractedAt: "2026-08-01T00:00:00Z" },
    term: {
      termId: "UID-TERM",
      academicYear: "2026-2027",
      termCode: "1",
      termName: "UID 测试",
      semesterStart: "2026-08-31",
      teachingWeeks: 2,
      timezone: "Asia/Shanghai",
      periodSchedules: [{ id: "p", label: "默认", effectiveFrom: "2026-08-31", periods: [{ index: 1, start: "08:00", end: "08:45" }, { index: 2, start: "08:55", end: "09:40" }] }],
    },
    courses: [{ id: courseId, name: "迁移课程", meetings: [{ id: meetingId, teacher: "教师", room: "A1", weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2], weekRule: "1-2" }] }],
    overrides: [],
    metadata: { extractedAt: "2026-08-01T00:00:00Z", sourceKind: "web", method: "manual", rawCount: 1, parsedCount: 1, skippedCount: 0, adapterId: "test", adapterVersion: "1.0" },
    validation: { status: "verified", checks: [], completeness: { courseCount: 1, meetingCount: 1, missingTeacher: 0, missingRoom: 0, missingPeriods: 0, unknownWeekRules: 0, adjustmentDataAvailable: false } },
  };
}

async function legacyIcs(data: NormalizedTimetableV2): Promise<{ ics: string; newUids: Set<string>; legacyUids: Set<string> }> {
  const generated = await generateIcsV2(data);
  const legacyByNew = new Map<string, string>();
  for (const event of generated.events) legacyByNew.set(event.uid, await legacyUidForEvent(event));
  const lines = generated.ics.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  for (const line of lines) {
    if (line.startsWith("UID:")) {
      const newUid = line.slice(4);
      output.push(`UID:${legacyByNew.get(newUid) ?? newUid}`);
    } else if (/^(?:X-TERICS-COURSE-ID|X-TERICS-MEETING-ID|X-TERICS-TERM-ID):/i.test(line)) {
      continue;
    } else {
      output.push(line);
    }
  }
  return {
    ics: output.join("\r\n"),
    newUids: new Set(generated.events.map((event) => event.uid)),
    legacyUids: new Set(legacyByNew.values()),
  };
}

describe("legacy UID migration", () => {
  it("previews a complete one-to-one migration and applies only after confirmation", async () => {
    const data = await timetable();
    const legacy = await legacyIcs(data);
    const preview = await previewUidMigration(data, legacy.ics);
    expect(preview).toMatchObject({ legacyEventCount: 2, alreadyMigrated: 0, safeToApply: true });
    expect(preview.unmatched).toHaveLength(0);
    expect(preview.ambiguous).toHaveLength(0);
    expect(() => applyUidMigration(legacy.ics, preview, false)).toThrow(/明确确认/);
    const result = applyUidMigration(legacy.ics, preview, true);
    expect(result.replaced).toBe(2);
    for (const uid of legacy.newUids) expect(result.ics).toContain(`UID:${uid}`);
    for (const uid of legacy.legacyUids) expect(result.ics).not.toContain(`UID:${uid}`);
    expect(result.ics.split("\r\n").some((line) => line.startsWith(" "))).toBe(true);
    expect(result.ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("protects against unmatched events and never batch-deletes", async () => {
    const data = await timetable();
    const legacy = await legacyIcs(data);
    const changed = legacy.ics.replace(/UID:terics-[0-9a-f]{32}@terics/i, "UID:terics-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb@terics");
    const preview = await previewUidMigration(data, changed);
    expect(preview.safeToApply).toBe(false);
    expect(preview.unmatched).toHaveLength(1);
    expect(() => applyUidMigration(changed, preview, true)).toThrow(/未匹配或歧义/);
  });

  it("recognizes already migrated ICS by course identity metadata", async () => {
    const data = await timetable();
    const generated = await generateIcsV2(data);
    const preview = await previewUidMigration(data, generated.ics);
    expect(preview).toMatchObject({ legacyEventCount: 0, alreadyMigrated: generated.events.length, safeToApply: false });
  });
});
