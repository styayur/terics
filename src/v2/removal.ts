import { inspectTimetableV2 } from "./validate";
import type { NormalizedTimetableV2, TimetableEventV2 } from "./types";

export interface CourseRemovalPreview {
  courseId: string;
  courseName: string;
  courseCode?: string;
  termId: string;
  teacher: string;
  rooms: string[];
  weekdays: number[];
  weekRange: string;
  meetingCount: number;
  occurrenceCount: number;
  overrideCount: number;
}

export interface TimetableRemovalResult {
  timetable: NormalizedTimetableV2;
  removedCourse: NormalizedTimetableV2["courses"][number];
  removedOverrides: number;
  beforeCourses: number;
  afterCourses: number;
  beforeMeetings: number;
  afterMeetings: number;
}

export interface IcsRemovalResult {
  ics: string;
  removedEvents: number;
  remainingEvents: number;
  skippedWithoutCourseId: number;
}

export function previewCourseRemoval(
  timetable: NormalizedTimetableV2,
  events: TimetableEventV2[],
  courseId: string,
): CourseRemovalPreview {
  const course = timetable.courses.find((item) => item.id === courseId);
  if (!course) throw new Error("未找到指定 courseId，拒绝按标题模糊删除");
  const occurrences = events.filter((event) => event.courseId === courseId);
  const cancelledOccurrences = timetable.overrides.filter(
    (override) => override.courseId === courseId && override.type === "cancel" && override.confirmed,
  ).length;
  const weeks = [...new Set(course.meetings.flatMap((meeting) => meeting.weeks))].sort((left, right) => left - right);
  const weekRange =
    weeks.length === 0
      ? "—"
      : weeks.length === 1
        ? `第 ${weeks[0]} 周`
        : `第 ${weeks[0]}–${weeks.at(-1)} 周（${weeks.join(", ")}）`;
  return {
    courseId,
    courseName: course.name,
    courseCode: course.source?.sourceCourseId,
    termId: timetable.term.termId,
    teacher: [...new Set(course.meetings.map((meeting) => meeting.teacher).filter(Boolean))].join(" / ") || "未提供",
    rooms: [...new Set(course.meetings.map((meeting) => meeting.room).filter(Boolean))],
    weekdays: [...new Set(course.meetings.map((meeting) => meeting.weekday))].sort((left, right) => left - right),
    weekRange,
    meetingCount: course.meetings.length,
    occurrenceCount: occurrences.length + cancelledOccurrences,
    overrideCount: timetable.overrides.filter((override) => override.courseId === courseId).length,
  };
}

export function removeCourseFromTimetable(timetable: NormalizedTimetableV2, courseId: string): TimetableRemovalResult {
  if (!courseId.trim()) throw new Error("courseId 不能为空");
  const course = timetable.courses.find((item) => item.id === courseId);
  if (!course) throw new Error("未找到指定 courseId，拒绝按标题模糊删除");
  if (timetable.courses.length <= 1) throw new Error("移除后将没有课程；为避免误删和生成空日历，已阻止操作");

  const clone = structuredClone(timetable);
  const removedCourse = clone.courses.find((item) => item.id === courseId)!;
  const beforeMeetings = clone.courses.reduce((sum, item) => sum + item.meetings.length, 0);
  clone.courses = clone.courses.filter((item) => item.id !== courseId);
  const beforeOverrides = clone.overrides.length;
  clone.overrides = clone.overrides.filter((override) => override.courseId !== courseId);
  clone.metadata.parsedCount = clone.courses.length;
  clone.metadata.rawCount = Math.min(clone.metadata.rawCount, clone.courses.length);
  clone.validation = inspectTimetableV2(clone).report;
  const afterMeetings = clone.courses.reduce((sum, item) => sum + item.meetings.length, 0);
  if (!inspectTimetableV2(clone).valid) throw new Error("移除课程后的 JSON 未通过 Schema 校验，未生成新文件");
  return {
    timetable: clone,
    removedCourse,
    removedOverrides: beforeOverrides - clone.overrides.length,
    beforeCourses: timetable.courses.length,
    afterCourses: clone.courses.length,
    beforeMeetings,
    afterMeetings,
  };
}

function unfoldIcsLines(ics: string): string[] {
  const physical = ics.replace(/\r\n?/g, "\n").split("\n");
  const logical: string[] = [];
  for (const line of physical) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && logical.length > 0) {
      logical[logical.length - 1] += line.slice(1);
    } else {
      logical.push(line);
    }
  }
  return logical;
}

function icsProperty(block: string[], property: string): string | null {
  for (const line of block) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    const name = left.split(";", 1)[0]!.toUpperCase();
    if (name !== property.toUpperCase()) continue;
    return line
      .slice(colon + 1)
      .replace(/\\n/gi, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\");
  }
  return null;
}

export function removeCourseFromIcs(ics: string, courseId: string): IcsRemovalResult {
  if (!courseId.trim()) throw new Error("courseId 不能为空");
  if (!/BEGIN:VCALENDAR/i.test(ics) || !/END:VCALENDAR/i.test(ics)) throw new Error("输入不是完整的 VCALENDAR");
  const output: string[] = [];
  let rawBlock: string[] | null = null;
  let removedEvents = 0;
  let remainingEvents = 0;
  let skippedWithoutCourseId = 0;
  const physicalLines = ics.replace(/\r\n?/g, "\n").split("\n");

  for (const line of physicalLines) {
    if (!rawBlock && /^BEGIN:VEVENT$/i.test(line.trim())) {
      rawBlock = [line];
      continue;
    }
    if (rawBlock) {
      rawBlock.push(line);
      if (/^END:VEVENT$/i.test(line.trim())) {
        const logicalBlock = unfoldIcsLines(rawBlock.join("\n"));
        const value = icsProperty(logicalBlock, "X-TERICS-COURSE-ID");
        if (value === courseId) {
          removedEvents += 1;
        } else {
          remainingEvents += 1;
          if (!value) skippedWithoutCourseId += 1;
          output.push(...rawBlock);
        }
        rawBlock = null;
      }
      continue;
    }
    output.push(line);
  }
  if (rawBlock) throw new Error("ICS 中 VEVENT 未闭合，已阻止删除");
  if (removedEvents === 0) throw new Error("ICS 中没有匹配该 courseId 的可信事件；不会按课程标题删除");
  if (remainingEvents === 0) throw new Error("删除后 ICS 将为空；为避免空日历误操作，未生成新文件");
  const lineEnding = ics.includes("\r\n") ? "\r\n" : "\n";
  const normalized = output.join(lineEnding).replace(/[\r\n]+$/, "");
  return {
    ics: `${normalized}${lineEnding}`,
    removedEvents,
    remainingEvents,
    skippedWithoutCourseId,
  };
}
