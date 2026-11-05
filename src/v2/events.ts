import { compactLocalDateTime, dateForClass, daysBetween, isMonday, parseIsoDate, weekdayZh } from "../core/dates";
import type {
  BuildV2Result,
  CourseMeeting,
  CourseV2,
  NormalizedTimetableV2,
  PeriodSchedule,
  ScheduleOverride,
  TimetableEventV2,
} from "./types";
import { makeEventUid } from "./ids";

interface OccurrenceOptions {
  course: CourseV2;
  meeting: CourseMeeting;
  date: string;
  week: number;
  startPeriod: number;
  endPeriod: number;
  startTime?: string;
  endTime?: string;
  teacher?: string;
  room?: string;
  note?: string;
}

function weekdayFromDate(date: string): number {
  const day = parseIsoDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

function chooseSchedule(timetable: NormalizedTimetableV2, date: string): PeriodSchedule | undefined {
  return [...timetable.term.periodSchedules]
    .filter((schedule) => schedule.effectiveFrom <= date && (!schedule.effectiveTo || date <= schedule.effectiveTo))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .at(-1);
}

function periodTime(schedule: PeriodSchedule, index: number, field: "start" | "end"): string | undefined {
  return schedule.periods.find((period) => period.index === index)?.[field];
}

async function createOccurrence(
  timetable: NormalizedTimetableV2,
  options: OccurrenceOptions,
  issues: BuildV2Result["issues"],
): Promise<TimetableEventV2 | null> {
  const schedule = chooseSchedule(timetable, options.date);
  if (!schedule) {
    issues.push({
      severity: "error",
      code: "missing_period_schedule",
      message: `${options.date} 没有有效的节次时间表`,
    });
    return null;
  }
  const start = options.startTime ?? periodTime(schedule, options.startPeriod, "start");
  const end = options.endTime ?? periodTime(schedule, options.endPeriod, "end");
  if (!start || !end) {
    issues.push({
      severity: "error",
      code: "missing_period_time",
      message: `${options.course.name} 在 ${options.date} 引用了未配置的节次 ${options.startPeriod}-${options.endPeriod}`,
    });
    return null;
  }
  if (end <= start) {
    issues.push({
      severity: "error",
      code: "invalid_event_time",
      message: `${options.course.name} 在 ${options.date} 的结束时间必须晚于开始时间`,
    });
    return null;
  }
  const uid = await makeEventUid({
    termId: timetable.term.termId,
    courseId: options.course.id,
    meetingId: options.meeting.id,
    date: options.date,
    startPeriod: options.startPeriod,
    endPeriod: options.endPeriod,
  });
  return {
    uid,
    courseId: options.course.id,
    meetingId: options.meeting.id,
    title: options.course.name,
    teacher: options.teacher ?? options.meeting.teacher,
    room: options.room ?? options.meeting.room,
    campus: options.meeting.campus ?? timetable.term.campus,
    note: options.note ?? options.meeting.note ?? "",
    weekday: weekdayFromDate(options.date),
    startPeriod: options.startPeriod,
    endPeriod: options.endPeriod,
    week: options.week,
    date: options.date,
    start,
    end,
    startDateTime: compactLocalDateTime(options.date, start),
    endDateTime: compactLocalDateTime(options.date, end),
    weekRule: options.meeting.weekRule || options.meeting.weeks.join(","),
    source: {
      adapterId: timetable.source.adapterId,
      adapterVersion: timetable.source.adapterVersion,
      schoolId: timetable.source.schoolId,
      termId: timetable.term.termId,
    },
  };
}

function weekForDate(timetable: NormalizedTimetableV2, date: string): number {
  return Math.max(1, Math.floor(daysBetween(timetable.term.semesterStart, date) / 7) + 1);
}

function overrideKey(courseId: string, meetingId: string): string {
  return `${courseId}\u001f${meetingId}`;
}

export async function buildV2Events(timetable: NormalizedTimetableV2): Promise<BuildV2Result> {
  const issues: BuildV2Result["issues"] = [];
  if (!isMonday(timetable.term.semesterStart)) {
    issues.push({ severity: "error", code: "not_monday", message: "学期开始日期必须是第 1 周周一" });
    return { events: [], conflicts: [], issues };
  }
  if (!timetable.term.periodSchedules.length) {
    issues.push({ severity: "error", code: "missing_period_schedule", message: "课表没有节次时间表" });
    return { events: [], conflicts: [], issues };
  }

  const courseMap = new Map(timetable.courses.map((course) => [course.id, course]));
  const meetingMap = new Map<string, { course: CourseV2; meeting: CourseMeeting }>();
  for (const course of timetable.courses) {
    for (const meeting of course.meetings) {
      meetingMap.set(overrideKey(course.id, meeting.id), { course, meeting });
    }
  }

  const cancellations = new Map<string, ScheduleOverride>();
  const reschedules = new Map<string, Extract<ScheduleOverride, { type: "reschedule" }>>();
  const modifications = new Map<string, ScheduleOverride[]>();
  const makeups: Extract<ScheduleOverride, { type: "makeup" }>[] = [];
  for (const override of timetable.overrides) {
    if (!override.confirmed) {
      issues.push({
        severity: "warning",
        code: "unconfirmed_override_ignored",
        message: `未确认的调课记录已忽略：${override.id}`,
      });
      continue;
    }
    const key = overrideKey(override.courseId, override.meetingId);
    if (override.type === "cancel") {
      cancellations.set(`${key}\u001f${override.originalDate}`, override);
    } else if (override.type === "reschedule") {
      cancellations.set(`${key}\u001f${override.originalDate}`, override);
      reschedules.set(`${key}\u001f${override.originalDate}`, override);
    } else if (override.type === "makeup") {
      makeups.push(override);
    } else {
      const dateKey = `${key}\u001f${override.originalDate}`;
      modifications.set(dateKey, [...(modifications.get(dateKey) ?? []), override]);
    }
  }

  const events: TimetableEventV2[] = [];
  const seen = new Set<string>();
  for (const course of timetable.courses) {
    for (const meeting of course.meetings) {
      const weeks = [...new Set(meeting.weeks)].sort((a, b) => a - b);
      for (const week of weeks) {
        const originalDate = dateForClass(timetable.term.semesterStart, week, meeting.weekday);
        const key = overrideKey(course.id, meeting.id);
        const dateKey = `${key}\u001f${originalDate}`;
        const reschedule = reschedules.get(dateKey);
        if (reschedule) {
          const moved = await createOccurrence(
            timetable,
            {
              course,
              meeting,
              date: reschedule.newDate,
              week: weekForDate(timetable, reschedule.newDate),
              startPeriod: reschedule.startPeriod ?? meeting.startPeriod,
              endPeriod: reschedule.endPeriod ?? meeting.endPeriod,
              startTime: reschedule.startTime,
              endTime: reschedule.endTime,
              teacher: reschedule.teacher,
              room: reschedule.room,
              note: reschedule.reason,
            },
            issues,
          );
          if (moved && !seen.has(moved.uid)) {
            seen.add(moved.uid);
            events.push(moved);
          }
          continue;
        }
        if (cancellations.has(dateKey)) continue;

        let startPeriod = meeting.startPeriod;
        let endPeriod = meeting.endPeriod;
        let startTime = meeting.startTime;
        let endTime = meeting.endTime;
        let teacher = meeting.teacher;
        let room = meeting.room;
        for (const override of modifications.get(dateKey) ?? []) {
          if (override.type === "room_change" && override.room) room = override.room;
          if (override.type === "teacher_change" && override.teacher) teacher = override.teacher;
          if (override.type === "period_change") {
            startPeriod = override.startPeriod ?? startPeriod;
            endPeriod = override.endPeriod ?? endPeriod;
            startTime = override.startTime ?? startTime;
            endTime = override.endTime ?? endTime;
          }
        }
        const event = await createOccurrence(
          timetable,
          { course, meeting, date: originalDate, week, startPeriod, endPeriod, startTime, endTime, teacher, room },
          issues,
        );
        if (event && !seen.has(event.uid)) {
          seen.add(event.uid);
          events.push(event);
        }
      }
    }
  }

  for (const makeup of makeups) {
    const entry = meetingMap.get(overrideKey(makeup.courseId, makeup.meetingId));
    if (!entry) {
      issues.push({
        severity: "warning",
        code: "orphan_makeup_override",
        message: `补课记录引用了不存在的课程/上课实例：${makeup.id}`,
      });
      continue;
    }
    const event = await createOccurrence(
      timetable,
      {
        course: entry.course,
        meeting: entry.meeting,
        date: makeup.newDate,
        week: weekForDate(timetable, makeup.newDate),
        startPeriod: makeup.startPeriod ?? entry.meeting.startPeriod,
        endPeriod: makeup.endPeriod ?? entry.meeting.endPeriod,
        startTime: makeup.startTime,
        endTime: makeup.endTime,
        teacher: makeup.teacher,
        room: makeup.room,
        note: makeup.reason,
      },
      issues,
    );
    if (event && !seen.has(event.uid)) {
      seen.add(event.uid);
      events.push(event);
    }
  }

  events.sort((a, b) => a.startDateTime.localeCompare(b.startDateTime) || a.title.localeCompare(b.title, "zh-CN"));
  const conflicts: BuildV2Result["conflicts"] = [];
  for (let leftIndex = 0; leftIndex < events.length; leftIndex += 1) {
    const left = events[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < events.length; rightIndex += 1) {
      const right = events[rightIndex];
      if (!right || left.date !== right.date) continue;
      if (left.start < right.end && right.start < left.end) {
        const conflict = {
          date: left.date,
          start: maxClock(left.start, right.start),
          end: minClock(left.end, right.end),
          eventIndexes: [leftIndex, rightIndex],
          labels: [
            `${left.title}（${weekdayZh(left.weekday)} ${left.start}-${left.end}）`,
            `${right.title}（${weekdayZh(right.weekday)} ${right.start}-${right.end}）`,
          ],
        };
        conflicts.push(conflict);
        issues.push({
          severity: "warning",
          code: "course_conflict",
          message: `${left.date} ${conflict.start}-${conflict.end} 课程冲突：${conflict.labels.join(" / ")}`,
        });
      }
    }
  }
  if (events.length === 0) {
    issues.push({ severity: "error", code: "no_events", message: "没有生成任何课程事件" });
  }
  for (const override of timetable.overrides) {
    if (override.type === "cancel" || override.type === "reschedule") {
      const course = courseMap.get(override.courseId);
      if (!course) {
        issues.push({ severity: "warning", code: "orphan_override", message: `调课记录引用不存在的课程：${override.id}` });
      }
    }
  }
  return { events, conflicts, issues };
}

function maxClock(left: string, right: string): string {
  return left > right ? left : right;
}

function minClock(left: string, right: string): string {
  return left < right ? left : right;
}
