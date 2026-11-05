import type { NormalizedTimetableV2, TimetableEventV2 } from "../v2/types";
import { sha256Hex } from "../v2/ids";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;

export interface GoogleEventDateTime {
  dateTime: string;
  timeZone: string;
}

export interface GoogleCalendarEvent {
  id?: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  extendedProperties?: { private?: Record<string, string> };
}

export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  timeZone?: string;
}

export type SyncActionType = "create" | "update" | "skip" | "delete";

export interface SyncAction {
  type: SyncActionType;
  reason: string;
  event?: TimetableEventV2;
  existing?: GoogleCalendarEvent;
  requestBody?: GoogleCalendarEvent;
  scheduleHash?: string;
}

export interface SyncPlan {
  calendarId: string;
  termId: string;
  creates: SyncAction[];
  updates: SyncAction[];
  skips: SyncAction[];
  deletes: SyncAction[];
  warnings: string[];
  blocked: boolean;
  dataComplete: boolean;
}

export async function computeScheduleHash(event: TimetableEventV2): Promise<string> {
  return sha256Hex(
    [
      event.uid,
      event.courseId,
      event.meetingId,
      event.title,
      event.teacher,
      event.room,
      event.date,
      event.start,
      event.end,
      event.startPeriod,
      event.endPeriod,
    ].join("\u001f"),
  );
}

export async function buildGoogleEvent(
  timetable: NormalizedTimetableV2,
  event: TimetableEventV2,
  scheduleHash: string,
): Promise<GoogleCalendarEvent> {
  const description = [
    `教师：${event.teacher || "未提供"}`,
    `地点：${event.room || "未提供"}`,
    `节次：第 ${event.startPeriod}-${event.endPeriod} 节`,
    `周次：${event.weekRule}`,
    `terics courseId：${event.courseId}`,
    `terics meetingId：${event.meetingId}`,
  ].join("\n");
  return {
    summary: event.title,
    location: event.room,
    description,
    start: { dateTime: event.startDateTime, timeZone: timetable.term.timezone || "Asia/Shanghai" },
    end: { dateTime: event.endDateTime, timeZone: timetable.term.timezone || "Asia/Shanghai" },
    extendedProperties: {
      private: {
        terics_source: "terics",
        terics_course_id: event.courseId,
        terics_meeting_id: event.meetingId,
        terics_event_uid: event.uid,
        terics_schedule_hash: scheduleHash,
        terics_adapter_version: timetable.source.adapterVersion,
        terics_term_id: timetable.term.termId,
      },
    },
  };
}

export function isManagedGoogleEvent(event: GoogleCalendarEvent, termId: string): boolean {
  const properties = event.extendedProperties?.private;
  return properties?.terics_source === "terics" && properties.terics_term_id === termId;
}

export async function planGoogleSync(
  timetable: NormalizedTimetableV2,
  events: TimetableEventV2[],
  existingEvents: GoogleCalendarEvent[],
  calendarId: string,
  allowDeletes = false,
): Promise<SyncPlan> {
  const warning: string[] = [];
  const creates: SyncAction[] = [];
  const updates: SyncAction[] = [];
  const skips: SyncAction[] = [];
  const deletes: SyncAction[] = [];
  const dataComplete = timetable.validation.status !== "failed";
  const safeEmpty = events.length > 0;
  if (!safeEmpty) warning.push("新课表为空；为避免误删，禁止生成任何删除操作");
  const managed = existingEvents.filter((event) => isManagedGoogleEvent(event, timetable.term.termId));
  const existingByUid = new Map(
    managed
      .map((event) => [event.extendedProperties?.private?.terics_event_uid ?? event.iCalUID, event] as const)
      .filter((entry): entry is readonly [string, GoogleCalendarEvent] => Boolean(entry[0])),
  );
  const desiredUids = new Set(events.map((event) => event.uid));
  for (const event of events) {
    const scheduleHash = await computeScheduleHash(event);
    const requestBody = await buildGoogleEvent(timetable, event, scheduleHash);
    const existing = existingByUid.get(event.uid);
    if (!existing) {
      creates.push({ type: "create", reason: "新事件", event, requestBody, scheduleHash });
      continue;
    }
    const oldHash = existing.extendedProperties?.private?.terics_schedule_hash;
    if (oldHash === scheduleHash) {
      skips.push({ type: "skip", reason: "内容未变化", event, existing, requestBody, scheduleHash });
    } else {
      updates.push({ type: "update", reason: "课表内容或时间变化", event, existing, requestBody, scheduleHash });
    }
  }
  if (allowDeletes && safeEmpty && dataComplete) {
    for (const existing of managed) {
      const uid = existing.extendedProperties?.private?.terics_event_uid ?? existing.iCalUID;
      if (uid && !desiredUids.has(uid)) {
        deletes.push({ type: "delete", reason: "该事件已不在新课表中", existing });
      }
    }
  } else if (managed.length > 0) {
    const missing = managed.filter((event) => {
      const uid = event.extendedProperties?.private?.terics_event_uid ?? event.iCalUID;
      return uid && !desiredUids.has(uid);
    });
    if (missing.length > 0) {
      warning.push(`${missing.length} 个旧事件可能已取消；删除需要完整数据与用户明确确认`);
    }
  }
  const blocked = !dataComplete || !safeEmpty;
  return {
    calendarId,
    termId: timetable.term.termId,
    creates,
    updates,
    skips,
    deletes,
    warnings: warning,
    blocked,
    dataComplete,
  };
}

export interface GoogleCalendarClient {
  listManagedEvents(calendarId: string, termId: string): Promise<GoogleCalendarEvent[]>;
  insertEvent(calendarId: string, event: GoogleCalendarEvent): Promise<GoogleCalendarEvent>;
  patchEvent(calendarId: string, eventId: string, event: GoogleCalendarEvent): Promise<GoogleCalendarEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

export interface SyncExecutionResult {
  created: number;
  updated: number;
  skipped: number;
  deleted: number;
  errors: string[];
}

export async function executeSyncPlan(
  client: GoogleCalendarClient,
  plan: SyncPlan,
  confirmDeletes: boolean,
): Promise<SyncExecutionResult> {
  if (plan.blocked) throw new Error("同步计划未通过数据完整性检查，已阻止执行");
  const result: SyncExecutionResult = { created: 0, updated: 0, skipped: 0, deleted: 0, errors: [] };
  for (const action of plan.creates) {
    try {
      if (!action.requestBody) continue;
      await client.insertEvent(plan.calendarId, action.requestBody);
      result.created += 1;
    } catch (error) {
      result.errors.push(`创建失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const action of plan.updates) {
    try {
      const id = action.existing?.id;
      if (!action.requestBody || !id) continue;
      await client.patchEvent(plan.calendarId, id, action.requestBody);
      result.updated += 1;
    } catch (error) {
      result.errors.push(`更新失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  result.skipped = plan.skips.length;
  if (confirmDeletes) {
    for (const action of plan.deletes) {
      try {
        const id = action.existing?.id;
        if (!id) continue;
        await client.deleteEvent(plan.calendarId, id);
        result.deleted += 1;
      } catch (error) {
        result.errors.push(`删除失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return result;
}
