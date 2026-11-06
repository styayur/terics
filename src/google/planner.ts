import type { NormalizedTimetableV2, TimetableEventV2 } from "../v2/types";
import { sha256Hex } from "../v2/ids";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
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
  conflicts: SyncAction[];
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

function renderedFields(event: GoogleCalendarEvent): string {
  return [
    event.summary ?? "",
    event.description ?? "",
    event.location ?? "",
    event.start?.dateTime ?? "",
    event.start?.timeZone ?? "",
    event.end?.dateTime ?? "",
    event.end?.timeZone ?? "",
  ].join("\u001f");
}

export async function computeRenderedHash(event: GoogleCalendarEvent): Promise<string> {
  return sha256Hex(renderedFields(event));
}

export function googlePrivateProperty(event: GoogleCalendarEvent, camelCase: string, legacy: string): string | undefined {
  const properties = event.extendedProperties?.private;
  return properties?.[camelCase] ?? properties?.[legacy];
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
  const body: GoogleCalendarEvent = {
    id: `terics${(await sha256Hex(event.uid)).slice(0, 48)}`,
    iCalUID: event.uid,
    summary: event.title,
    location: event.room,
    description,
    start: { dateTime: event.startDateTime, timeZone: timetable.term.timezone || "Asia/Shanghai" },
    end: { dateTime: event.endDateTime, timeZone: timetable.term.timezone || "Asia/Shanghai" },
    extendedProperties: {
      private: {
        tericsManaged: "true",
        tericsSchemaVersion: "2.0",
        tericsCourseId: event.courseId,
        tericsMeetingId: event.meetingId,
        tericsSource: "terics",
        tericsUid: event.uid,
        tericsTermId: timetable.term.termId,
        tericsScheduleHash: scheduleHash,
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
  body.extendedProperties!.private!.tericsRenderedHash = await computeRenderedHash(body);
  return body;
}

export function isManagedGoogleEvent(event: GoogleCalendarEvent, termId: string): boolean {
  const properties = event.extendedProperties?.private;
  const managed = properties?.tericsManaged === "true" || properties?.terics_source === "terics";
  const eventTerm = properties?.tericsTermId ?? properties?.terics_term_id;
  return managed && eventTerm === termId;
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
  const conflicts: SyncAction[] = [];
  const dataComplete = timetable.validation.status !== "failed";
  const safeEmpty = events.length > 0;
  if (!safeEmpty) warning.push("新课表为空；为避免误删，禁止生成任何删除操作");
  const managed = existingEvents.filter((event) => isManagedGoogleEvent(event, timetable.term.termId));
  const byUid = new Map<string, GoogleCalendarEvent[]>();
  for (const event of managed) {
    const uid = googlePrivateProperty(event, "tericsUid", "terics_event_uid") ?? event.iCalUID;
    if (!uid) {
      conflicts.push({ type: "skip", reason: "托管事件缺少 UID，无法安全匹配", existing: event });
      continue;
    }
    byUid.set(uid, [...(byUid.get(uid) ?? []), event]);
  }
  const existingByUid = new Map<string, GoogleCalendarEvent>();
  for (const [uid, matches] of byUid) {
    if (matches.length === 1) {
      existingByUid.set(uid, matches[0]!);
    } else {
      conflicts.push({ type: "skip", reason: `检测到 ${matches.length} 个重复托管事件（${uid}），不会自动合并或删除`, existing: matches[0] });
    }
  }
  const desiredUids = new Set(events.map((event) => event.uid));
  for (const event of events) {
    const scheduleHash = await computeScheduleHash(event);
    const requestBody = await buildGoogleEvent(timetable, event, scheduleHash);
    const existing = existingByUid.get(event.uid);
    if (!existing) {
      creates.push({ type: "create", reason: "新事件", event, requestBody, scheduleHash });
      continue;
    }
    const oldHash = googlePrivateProperty(existing, "tericsScheduleHash", "terics_schedule_hash");
    const expectedRenderedHash = existing.extendedProperties?.private?.tericsRenderedHash;
    if (expectedRenderedHash && (await computeRenderedHash(existing)) !== expectedRenderedHash) {
      conflicts.push({ type: "skip", reason: "检测到 Google Calendar 中 terics 事件被手动修改；为避免覆盖非 terics 字段，已跳过", event, existing, requestBody, scheduleHash });
      continue;
    }
    if (oldHash === scheduleHash) {
      skips.push({ type: "skip", reason: "内容未变化", event, existing, requestBody, scheduleHash });
    } else if (!expectedRenderedHash) {
      conflicts.push({ type: "skip", reason: "旧版 terics 事件缺少远程字段哈希；为避免覆盖手工修改，已跳过自动更新", event, existing, requestBody, scheduleHash });
    } else {
      updates.push({ type: "update", reason: "课表内容或时间变化", event, existing, requestBody, scheduleHash });
    }
  }
  if (allowDeletes && safeEmpty && dataComplete && conflicts.length === 0) {
    for (const existing of managed) {
      const uid = googlePrivateProperty(existing, "tericsUid", "terics_event_uid") ?? existing.iCalUID;
      if (uid && !desiredUids.has(uid)) {
        deletes.push({ type: "delete", reason: "该事件已不在新课表中", existing });
      }
    }
  } else if (managed.length > 0) {
    const missing = managed.filter((event) => {
      const uid = googlePrivateProperty(event, "tericsUid", "terics_event_uid") ?? event.iCalUID;
      return uid && !desiredUids.has(uid);
    });
    if (missing.length > 0) {
      warning.push(`${missing.length} 个旧事件可能已取消；删除需要完整数据与用户明确确认`);
    }
  }
  if (conflicts.length > 0 && managed.some((event) => {
    const uid = googlePrivateProperty(event, "tericsUid", "terics_event_uid") ?? event.iCalUID;
    return uid && !desiredUids.has(uid);
  })) {
    warning.push("存在冲突或重复事件；已禁止生成删除计划，避免误删其他课程");
  }
  const blocked = !dataComplete || !safeEmpty;
  return {
    calendarId,
    termId: timetable.term.termId,
    creates,
    updates,
    skips,
    deletes,
    conflicts,
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
  conflicted: number;
  errors: string[];
}

export async function executeSyncPlan(
  client: GoogleCalendarClient,
  plan: SyncPlan,
  confirmDeletes: boolean,
): Promise<SyncExecutionResult> {
  if (plan.blocked) throw new Error("同步计划未通过数据完整性检查，已阻止执行");
  const result: SyncExecutionResult = { created: 0, updated: 0, skipped: 0, deleted: 0, conflicted: plan.conflicts.length, errors: [] };
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
      const patchBody = structuredClone(action.requestBody);
      delete patchBody.id;
      delete patchBody.iCalUID;
      await client.patchEvent(plan.calendarId, id, patchBody);
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

export interface GoogleCourseRemovalResult {
  calendarId: string;
  courseId: string;
  candidates: number;
  deleted: number;
  alreadyMissing: number;
  skipped: number;
  failures: Array<{ eventId?: string; error: string }>;
}

export async function removeCourseFromGoogleCalendar(
  client: GoogleCalendarClient,
  calendarId: string,
  termId: string,
  courseId: string,
  courseTitle?: string,
): Promise<GoogleCourseRemovalResult> {
  if (!calendarId.trim()) throw new Error("必须指定目标 calendarId");
  if (!termId.trim()) throw new Error("必须指定 termId");
  if (!courseId.trim()) throw new Error("必须指定精确 courseId；禁止按标题删除");
  const events = await client.listManagedEvents(calendarId, termId);
  const candidates = events.filter((event) => isManagedGoogleEvent(event, termId));
  const matched = candidates.filter((event) => googlePrivateProperty(event, "tericsCourseId", "terics_course_id") === courseId);
  const skipped = candidates.filter((event) => {
    const eventCourseId = googlePrivateProperty(event, "tericsCourseId", "terics_course_id");
    return !eventCourseId && Boolean(courseTitle) && event.summary === courseTitle;
  }).length;
  const seen = new Set<string>();
  const result: GoogleCourseRemovalResult = {
    calendarId,
    courseId,
    candidates: matched.length,
    deleted: 0,
    alreadyMissing: 0,
    skipped,
    failures: [],
  };
  for (const event of matched) {
    if (!event.id) {
      result.skipped += 1;
      continue;
    }
    if (seen.has(event.id)) {
      result.skipped += 1;
      continue;
    }
    seen.add(event.id);
    try {
      await client.deleteEvent(calendarId, event.id);
      result.deleted += 1;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 404 || status === 410) result.alreadyMissing += 1;
      else result.failures.push({ eventId: event.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
