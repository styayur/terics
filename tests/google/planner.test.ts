import { describe, expect, it } from "vitest";
import { buildGoogleEvent, computeScheduleHash, executeSyncPlan, planGoogleSync, type GoogleCalendarClient } from "../../src/google/planner";
import { buildV2Events } from "../../src/v2/events";
import { makeCourseId, makeMeetingId } from "../../src/v2/ids";
import type { NormalizedTimetableV2 } from "../../src/v2/types";

async function timetable(): Promise<NormalizedTimetableV2> {
  const courseId = await makeCourseId({ adapterId: "test", sourceCourseId: "C1", fallbackOrdinal: 1 });
  const meetingId = await makeMeetingId({ courseId, sourceMeetingId: "M1", weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2] });
  return {
    schemaVersion: "2.0",
    source: { kind: "web", adapterId: "test", adapterVersion: "1.0", extractedAt: "2026-08-01T00:00:00.000Z" },
    term: {
      termId: "TERM1",
      academicYear: "2026-2027",
      termCode: "1",
      termName: "测试学期",
      semesterStart: "2026-08-31",
      teachingWeeks: 2,
      timezone: "Asia/Shanghai",
      periodSchedules: [{ id: "p", label: "默认", effectiveFrom: "2026-08-31", periods: [{ index: 1, start: "08:00", end: "08:45" }, { index: 2, start: "08:55", end: "09:40" }] }],
    },
    courses: [
      { id: courseId, name: "课程", meetings: [{ id: meetingId, teacher: "教师", room: "A1", weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2], weekRule: "1-2" }] },
    ],
    overrides: [],
    metadata: { extractedAt: "2026-08-01T00:00:00.000Z", sourceKind: "web", method: "manual", rawCount: 1, parsedCount: 1, skippedCount: 0, adapterId: "test", adapterVersion: "1.0" },
    validation: { status: "verified", checks: [], completeness: { courseCount: 1, meetingCount: 1, missingTeacher: 0, missingRoom: 0, missingPeriods: 0, unknownWeekRules: 0, adjustmentDataAvailable: false } },
  };
}

class FakeClient implements GoogleCalendarClient {
  created = 0;
  updated = 0;
  deleted = 0;
  async listManagedEvents() { return []; }
  async insertEvent() { this.created += 1; return {}; }
  async patchEvent() { this.updated += 1; return {}; }
  async deleteEvent() { this.deleted += 1; }
}

describe("Google Calendar sync planner", () => {
  it("creates, updates, skips and only deletes managed terics events when complete", async () => {
    const data = await timetable();
    const build = await buildV2Events(data);
    const first = build.events[0]!;
    const second = build.events[1]!;
    const sameHash = await computeScheduleHash(first);
    const existingSame = { ...(await buildGoogleEvent(data, first, sameHash)), id: "g-same" };
    const existingChanged = { ...(await buildGoogleEvent(data, second, "old-hash")), id: "g-change" };
    const managedStale = {
      id: "g-stale",
      summary: "旧课程",
      extendedProperties: { private: { terics_source: "terics", terics_term_id: "TERM1", terics_event_uid: "old" } },
    };
    const foreign = { id: "foreign", summary: "其他应用", extendedProperties: { private: { other_source: "x" } } };
    const plan = await planGoogleSync(data, [first, second], [existingSame, existingChanged, managedStale, foreign], "cal1", false);
    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
    expect(plan.skips).toHaveLength(1);
    expect(plan.deletes).toHaveLength(0);
    expect(plan.warnings.some((warning) => warning.includes("删除需要"))).toBe(true);
    const confirmPlan = await planGoogleSync(data, [first, second], [existingSame, existingChanged, managedStale, foreign], "cal1", true);
    expect(confirmPlan.deletes).toHaveLength(1);
    expect(confirmPlan.deletes[0]?.existing?.id).toBe("g-stale");
    expect(confirmPlan.deletes.some((action) => action.existing?.id === "foreign")).toBe(false);
    const client = new FakeClient();
    const result = await executeSyncPlan(client, confirmPlan, true);
    expect(result).toMatchObject({ updated: 1, skipped: 1, deleted: 1 });
    expect(client.deleted).toBe(1);
  });

  it("blocks deletes and sync when extracted data is empty", async () => {
    const data = await timetable();
    const managed = { id: "g1", extendedProperties: { private: { terics_source: "terics", terics_term_id: "TERM1", terics_event_uid: "old" } } };
    const plan = await planGoogleSync(data, [], [managed], "cal1", true);
    expect(plan.blocked).toBe(true);
    expect(plan.deletes).toHaveLength(0);
    const client = new FakeClient();
    await expect(executeSyncPlan(client, plan, true)).rejects.toThrow(/阻止/);
    expect(client.deleted).toBe(0);
  });
});
