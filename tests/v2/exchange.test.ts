import { describe, expect, it } from "vitest";
import { decodeTericsFragment, encodeTericsFragment, parseTericsJson, serializeTericsJson } from "../../src/v2/exchange";
import { TericsParseError } from "../../src/core/errors";
import { makeCourseId, makeMeetingId } from "../../src/v2/ids";
import type { NormalizedTimetableV2 } from "../../src/v2/types";

async function sample(): Promise<NormalizedTimetableV2> {
  const courseId = await makeCourseId({ adapterId: "test", sourceCourseId: "C1", fallbackOrdinal: 1 });
  const meetingId = await makeMeetingId({ courseId, sourceMeetingId: "M1", weekday: 2, startPeriod: 1, endPeriod: 2, weeks: [1, 2] });
  return {
    schemaVersion: "2.0",
    source: { kind: "extension", adapterId: "test", adapterVersion: "1.0", extractedAt: "2026-08-01T00:00:00.000Z" },
    term: {
      termId: "T1",
      academicYear: "2026-2027",
      termCode: "1",
      termName: "测试学期",
      semesterStart: "2026-08-31",
      teachingWeeks: 16,
      timezone: "Asia/Shanghai",
      periodSchedules: [
        { id: "p1", label: "默认", effectiveFrom: "2026-08-31", periods: [{ index: 1, start: "08:00", end: "08:45" }] },
      ],
    },
    courses: [
      {
        id: courseId,
        name: "测试课程",
        meetings: [
          {
            id: meetingId,
            teacher: "教师",
            room: "A1",
            weekday: 2,
            startPeriod: 1,
            endPeriod: 2,
            weeks: [1, 2],
            weekRule: "1-2",
          },
        ],
      },
    ],
    overrides: [],
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
        adjustmentDataAvailable: false,
      },
    },
  };
}

describe("terics exchange format", () => {
  it("round-trips JSON and URL fragment imports", async () => {
    const data = await sample();
    const parsed = parseTericsJson(serializeTericsJson(data));
    expect(parsed.term.termId).toBe("T1");
    const fragment = encodeTericsFragment(data);
    expect(decodeTericsFragment(fragment)).toEqual(data);
  });

  it("rejects credentials, wrong schema and malformed data", async () => {
    const data = await sample();
    const withSecret = { ...data, accessToken: "secret" };
    expect(() => parseTericsJson(JSON.stringify(withSecret))).toThrow(/有效的 terics v2/);
    expect(() => parseTericsJson(JSON.stringify({ ...data, schemaVersion: "1.0" }))).toThrow(TericsParseError);
    expect(() => parseTericsJson("{")).toThrow(TericsParseError);
  });
});
