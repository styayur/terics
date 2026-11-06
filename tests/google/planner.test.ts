import { describe, expect, it } from "vitest";
import {
  buildGoogleEvent,
  computeScheduleHash,
  executeSyncPlan,
  planGoogleSync,
  removeCourseFromGoogleCalendar,
  type GoogleCalendarClient,
  type GoogleCalendarEvent,
} from "../../src/google/planner";
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

class RemovalClient implements GoogleCalendarClient {
  deleted: string[] = [];
  constructor(private readonly events: GoogleCalendarEvent[], private readonly failId?: string) {}
  async listManagedEvents() { return this.events; }
  async insertEvent() { return {}; }
  async patchEvent() { return {}; }
  async deleteEvent(_calendarId: string, eventId: string) {
    if (eventId === this.failId) throw Object.assign(new Error("HTTP 500"), { status: 500 });
    this.deleted.push(eventId);
  }
}

describe("Google Calendar sync planner", () => {
  it("writes camelCase identity with legacy compatibility fields", async () => {
    const data = await timetable();
    const event = (await buildV2Events(data)).events[0]!;
    const body = await buildGoogleEvent(data, event, await computeScheduleHash(event));
    expect(body.id).toMatch(/^terics[0-9a-f]{48}$/);
    expect(body.iCalUID).toBe(event.uid);
    expect(body.extendedProperties?.private).toMatchObject({
      tericsManaged: "true",
      tericsSchemaVersion: "2.0",
      tericsCourseId: event.courseId,
      tericsMeetingId: event.meetingId,
      tericsSource: "terics",
      tericsUid: event.uid,
      tericsTermId: "TERM1",
      terics_source: "terics",
      terics_course_id: event.courseId,
    });
    expect(body.extendedProperties?.private?.tericsRenderedHash).toMatch(/^[a-f0-9]{64}$/);
  });

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

  it("detects duplicate managed events and protects manually edited terics events", async () => {
    const data = await timetable();
    const build = await buildV2Events(data);
    const first = build.events[0]!;
    const hash = await computeScheduleHash(first);
    const managed = await buildGoogleEvent(data, first, hash);
    const duplicateA = { ...managed, id: "duplicate-a" };
    const duplicateB = { ...managed, id: "duplicate-b" };
    const duplicatePlan = await planGoogleSync(data, build.events, [duplicateA, duplicateB], "cal1", true);
    expect(duplicatePlan.conflicts).toHaveLength(1);
    expect(duplicatePlan.conflicts[0]?.reason).toContain("重复");
    expect(duplicatePlan.deletes).toHaveLength(0);

    const edited = { ...managed, id: "edited", summary: "用户手动修改后的课程" };
    const editedPlan = await planGoogleSync(data, build.events, [edited], "cal1", false);
    expect(editedPlan.conflicts).toHaveLength(1);
    expect(editedPlan.conflicts[0]?.reason).toContain("手动修改");
    expect(editedPlan.updates).toHaveLength(0);
  });

  it("removes whole courses only by exact managed courseId and reports partial failures", async () => {
    const events: GoogleCalendarEvent[] = [
      { id: "camel-a", summary: "课程一", extendedProperties: { private: { tericsManaged: "true", tericsTermId: "TERM1", tericsCourseId: "COURSE-A" } } },
      { id: "snake-a", summary: "课程一", extendedProperties: { private: { terics_source: "terics", terics_term_id: "TERM1", terics_course_id: "COURSE-A" } } },
      { id: "course-b", summary: "课程一", extendedProperties: { private: { tericsManaged: "true", tericsTermId: "TERM1", tericsCourseId: "COURSE-B" } } },
      { id: "title-only", summary: "课程一", extendedProperties: { private: { tericsManaged: "true", tericsTermId: "TERM1" } } },
      { id: "foreign", summary: "课程一", extendedProperties: { private: { other: "1" } } },
    ];
    const client = new RemovalClient(events, "snake-a");
    const result = await removeCourseFromGoogleCalendar(client, "target-calendar", "TERM1", "COURSE-A", "课程一");
    expect(result).toMatchObject({ calendarId: "target-calendar", courseId: "COURSE-A", candidates: 2, deleted: 1, skipped: 1 });
    expect(result.failures).toHaveLength(1);
    expect(client.deleted).toEqual(["camel-a"]);
    expect(client.deleted).not.toContain("course-b");
    expect(client.deleted).not.toContain("title-only");
    expect(client.deleted).not.toContain("foreign");
  });

  it("rejects empty course identity and wrong target identifiers before deleting", async () => {
    const client = new RemovalClient([]);
    await expect(removeCourseFromGoogleCalendar(client, "", "TERM1", "COURSE-A")).rejects.toThrow(/calendarId/);
    await expect(removeCourseFromGoogleCalendar(client, "cal", "TERM1", "")).rejects.toThrow(/courseId/);
  });
});
