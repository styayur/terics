import { describe, expect, it } from "vitest";
import { connectorManifests } from "../../src/connectors/registry";
import { handleExtractMessage } from "../../src/extension/messages";
import { makeCourseId, makeMeetingId } from "../../src/v2/ids";
import type { NormalizedTimetableV2, SemesterSelection } from "../../src/v2/types";
import { readFileSync } from "node:fs";

async function sample(): Promise<NormalizedTimetableV2> {
  const courseId = await makeCourseId({ adapterId: "test", sourceCourseId: "C1", fallbackOrdinal: 1 });
  const meetingId = await makeMeetingId({ courseId, sourceMeetingId: "M1", weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1] });
  return {
    schemaVersion: "2.0",
    source: { kind: "extension", adapterId: "test", adapterVersion: "1.0", extractedAt: "2026-08-01T00:00:00Z" },
    term: { termId: "T1", academicYear: "2026-2027", termCode: "1", termName: "测试", semesterStart: "2026-08-31", teachingWeeks: 20, timezone: "Asia/Shanghai", periodSchedules: [{ id: "p", label: "默认", effectiveFrom: "2026-08-31", periods: [{ index: 1, start: "08:00", end: "08:45" }, { index: 2, start: "08:55", end: "09:40" }] }] },
    courses: [{ id: courseId, name: "课程", meetings: [{ id: meetingId, teacher: "教师", room: "A1", weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1], weekRule: "1" }] }],
    overrides: [],
    metadata: { extractedAt: "2026-08-01T00:00:00Z", sourceKind: "extension", method: "api", rawCount: 1, parsedCount: 1, skippedCount: 0, adapterId: "test", adapterVersion: "1.0" },
    validation: { status: "verified", checks: [], completeness: { courseCount: 1, meetingCount: 1, missingTeacher: 0, missingRoom: 0, missingPeriods: 0, unknownWeekRules: 0, adjustmentDataAvailable: false } },
  };
}

const semester: SemesterSelection = { termName: "测试", semesterStart: "2026-08-31", teachingWeeks: 20 };

describe("extension message contract", () => {
  it("returns a normalized timetable for a valid extraction message", async () => {
    const timetable = await sample();
    const response = await handleExtractMessage(
      { type: "terics.extract", semester },
      async () => ({ timetable, detection: { detected: true, adapterId: "test", confidence: 1, vendor: "test", evidence: ["fixture"] }, evidence: ["fixture"] }),
    );
    expect(response.ok).toBe(true);
    if (response.ok) expect(response.timetable).toMatchObject({ schemaVersion: "2.0" });
  });

  it("rejects malformed messages and exposes no raw HTML or credentials", async () => {
    const bad = await handleExtractMessage({ type: "other" });
    expect(bad).toMatchObject({ ok: false, code: "invalid_message" });
    const failed = await handleExtractMessage(
      { type: "terics.extract", semester },
      async () => {
        throw new Error("login expired");
      },
    );
    expect(failed).toMatchObject({ ok: false, code: "extract_failed" });
    expect(JSON.stringify(failed)).not.toMatch(/cookie|password|token/i);
  });

  it("declares multiple protocol adapters without broad host permissions", () => {
    const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage"]);
    expect(manifest.host_permissions).toBeUndefined();
    const vendors = new Set(connectorManifests().map((item) => item.vendor));
    expect([...vendors]).toEqual(expect.arrayContaining(["wisedu", "zf", "qiangzhi", "qingguo"]));
  });
});
