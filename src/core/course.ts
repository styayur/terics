import { assertTime, compactLocalDateTime, dateForClass, isMonday, timeToMinutes, weekdayZh } from "./dates";
import type {
  BuildResult,
  CalendarEvent,
  Conflict,
  ParseIssue,
  PeriodTime,
  RawCourse,
  SemesterConfig,
} from "./types";
import { cleanCellText, cleanCourseName, cleanTeacher, normalizeText } from "./weeks";

function canonicalCourseKey(course: RawCourse): string {
  return [
    cleanCourseName(course.name),
    cleanTeacher(course.teacher),
    cleanCellText(course.location),
    course.weekday,
    course.startPeriod,
    course.endPeriod,
    [...course.weeks].sort((a, b) => a - b).join(","),
    cleanCellText(course.note),
  ].join("\u001f");
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function stableUid(key: string): Promise<string> {
  return `terics-${(await sha256Hex(key)).slice(0, 32)}@terics`;
}

function validatePeriods(periods: PeriodTime[], issues: ParseIssue[]): Map<number, PeriodTime> {
  const map = new Map<number, PeriodTime>();
  periods.forEach((period, index) => {
    if (!Number.isInteger(period.index) || period.index < 1 || period.index > 30) {
      issues.push({
        severity: "error",
        code: "invalid_period_index",
        message: `节次编号必须为 1–30 的整数：${period.index}`,
      });
      return;
    }
    if (map.has(period.index)) {
      issues.push({
        severity: "error",
        code: "duplicate_period_index",
        message: `节次 ${period.index} 重复`,
      });
      return;
    }
    try {
      assertTime(period.start, `第 ${period.index} 节开始时间`);
      assertTime(period.end, `第 ${period.index} 节结束时间`);
      if (timeToMinutes(period.end) <= timeToMinutes(period.start)) {
        issues.push({
          severity: "error",
          code: "period_time_order",
          message: `第 ${period.index} 节结束时间必须晚于开始时间`,
        });
        return;
      }
      map.set(period.index, { ...period });
    } catch (error) {
      issues.push({
        severity: "error",
        code: "invalid_period_time",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const previous = periods[index - 1];
    if (previous && period.index === previous.index + 1) {
      try {
        if (timeToMinutes(period.start) < timeToMinutes(previous.end)) {
          issues.push({
            severity: "warning",
            code: "period_overlap",
            message: `第 ${previous.index} 节与第 ${period.index} 节时间重叠，请确认作息表`,
          });
        }
      } catch {
        // The more specific time-format error is reported above.
      }
    }
  });
  return map;
}

export async function buildEvents(config: SemesterConfig, rawCourses: RawCourse[]): Promise<BuildResult> {
  const issues: ParseIssue[] = [];
  if (!isMonday(config.semesterStart)) {
    issues.push({
      severity: "error",
      code: "semester_start_not_monday",
      message: `学期开始日期必须是第 1 周周一：${config.semesterStart}`,
    });
    return { events: [], conflicts: [], issues };
  }
  if (!Number.isInteger(config.alarmMinutes) || config.alarmMinutes < 0 || config.alarmMinutes > 10080) {
    issues.push({
      severity: "error",
      code: "invalid_alarm",
      message: "提醒时间必须为 0–10080 分钟的整数",
    });
  }

  const periodMap = validatePeriods(config.periods, issues);
  if (issues.some((issue) => issue.severity === "error")) {
    return { events: [], conflicts: [], issues };
  }

  const uniqueCourses = new Map<string, RawCourse>();
  for (const course of rawCourses) {
    const normalized: RawCourse = {
      ...course,
      name: cleanCourseName(course.name),
      teacher: cleanTeacher(course.teacher),
      location: cleanCellText(course.location),
      note: cleanCellText(course.note),
      weekRule: normalizeText(course.weekRule),
      weeks: [...new Set(course.weeks)].sort((a, b) => a - b),
    };
    if (!normalized.name) {
      issues.push({
        severity: "error",
        code: "missing_course_name",
        message: `课程缺少名称：${normalized.sourceRef ?? "未知位置"}`,
      });
      continue;
    }
    if (normalized.weekday < 1 || normalized.weekday > 7) {
      issues.push({
        severity: "error",
        code: "invalid_weekday",
        message: `${normalized.name} 的星期无效：${normalized.weekday}`,
      });
      continue;
    }
    if (normalized.startPeriod > normalized.endPeriod) {
      issues.push({
        severity: "error",
        code: "invalid_section_range",
        message: `${normalized.name} 的节次范围无效：${normalized.startPeriod}-${normalized.endPeriod}`,
      });
      continue;
    }
    uniqueCourses.set(canonicalCourseKey(normalized), normalized);
  }

  const events: CalendarEvent[] = [];
  const seenUids = new Set<string>();
  for (const course of uniqueCourses.values()) {
    const startPeriodTime = periodMap.get(course.startPeriod);
    const endPeriodTime = periodMap.get(course.endPeriod);
    if (!startPeriodTime || !endPeriodTime) {
      issues.push({
        severity: "error",
        code: "missing_period_time",
        message: `${course.name} 引用了未配置的节次 ${course.startPeriod}-${course.endPeriod}`,
      });
      continue;
    }
    for (const week of course.weeks) {
      const date = dateForClass(config.semesterStart, week, course.weekday);
      const start = startPeriodTime.start;
      const end = endPeriodTime.end;
      const startDateTime = compactLocalDateTime(date, start);
      const endDateTime = compactLocalDateTime(date, end);
      const courseAnchor =
        course.sourceRef?.trim() ||
        [course.weekday, course.startPeriod, course.endPeriod, course.weeks.join(",")].join("|");
      const uidKey = [courseAnchor, date, course.startPeriod, course.endPeriod].join("\u001f");
      const uid = await stableUid(uidKey);
      if (seenUids.has(uid)) continue;
      seenUids.add(uid);
      events.push({
        uid,
        title: course.name,
        teacher: course.teacher,
        location: course.location,
        note: course.note,
        weekday: course.weekday,
        startPeriod: course.startPeriod,
        endPeriod: course.endPeriod,
        week,
        date,
        start,
        end,
        startDateTime,
        endDateTime,
        weekRule: course.weekRule || course.weeks.join(","),
      });
    }
  }

  events.sort((a, b) =>
    a.startDateTime.localeCompare(b.startDateTime) || a.title.localeCompare(b.title, "zh-CN"),
  );

  const conflicts: Conflict[] = [];
  for (let i = 0; i < events.length; i += 1) {
    const left = events[i];
    if (!left) continue;
    for (let j = i + 1; j < events.length; j += 1) {
      const right = events[j];
      if (!right || left.date !== right.date) continue;
      if (left.start < right.end && right.start < left.end) {
        const conflict: Conflict = {
          date: left.date,
          start: left.start > right.start ? left.start : right.start,
          end: left.end < right.end ? left.end : right.end,
          eventIndexes: [i, j],
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
    issues.push({
      severity: "error",
      code: "no_events",
      message: "没有生成任何课程事件，请检查周次与节次配置",
    });
  }

  return { events, conflicts, issues };
}
