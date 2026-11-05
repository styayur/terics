import { assertTime, isMonday, parseIsoDate } from "../core/dates";
import type { NormalizedTimetableV2, ValidationCheck, ValidationReport } from "./types";

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
  report: ValidationReport;
}

function pushIssue(issues: ValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

export function validateTimetableV2(value: unknown): ValidationReport {
  return inspectTimetableV2(value).report;
}

export function inspectTimetableV2(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (!value || typeof value !== "object") {
    pushIssue(issues, "$", "not_object", "课表 JSON 必须是对象");
    return emptyResult(issues, warnings);
  }
  const timetable = value as Partial<NormalizedTimetableV2>;
  for (const forbidden of findForbiddenKeys(value)) {
    pushIssue(issues, forbidden, "forbidden_credential_field", "terics 交换文件禁止包含密码、Cookie、Token 或 CSRF 凭证");
  }
  if (timetable.schemaVersion !== "2.0") {
    pushIssue(issues, "$.schemaVersion", "unsupported_schema", "仅支持 .terics.json schemaVersion 2.0");
  }
  if (!timetable.source || typeof timetable.source !== "object") {
    pushIssue(issues, "$.source", "missing_source", "缺少来源元数据");
  }
  if (!timetable.term || typeof timetable.term !== "object") {
    pushIssue(issues, "$.term", "missing_term", "缺少学期上下文");
  }
  if (!Array.isArray(timetable.courses) || timetable.courses.length === 0) {
    pushIssue(issues, "$.courses", "missing_courses", "课表没有课程");
  }
  if (!Array.isArray(timetable.overrides)) {
    pushIssue(issues, "$.overrides", "missing_overrides", "schedule overrides 必须是数组");
  }

  let meetingCount = 0;
  let missingTeacher = 0;
  let missingRoom = 0;
  let missingPeriods = 0;
  let unknownWeekRules = 0;
  const courseIds = new Set<string>();
  const meetingIds = new Set<string>();

  if (timetable.term) {
    try {
      parseIsoDate(timetable.term.semesterStart);
      if (!isMonday(timetable.term.semesterStart)) {
        pushIssue(issues, "$.term.semesterStart", "not_monday", "semesterStart 必须是第 1 周周一");
      }
    } catch {
      pushIssue(issues, "$.term.semesterStart", "invalid_date", "semesterStart 无效");
    }
    if (!Number.isInteger(timetable.term.teachingWeeks) || timetable.term.teachingWeeks < 1 || timetable.term.teachingWeeks > 30) {
      pushIssue(issues, "$.term.teachingWeeks", "invalid_weeks", "teachingWeeks 必须在 1–30");
    }
    if (!Array.isArray(timetable.term.periodSchedules) || timetable.term.periodSchedules.length === 0) {
      pushIssue(issues, "$.term.periodSchedules", "missing_periods", "至少需要一套节次时间表");
    } else {
      for (const [scheduleIndex, schedule] of timetable.term.periodSchedules.entries()) {
        const path = `$.term.periodSchedules[${scheduleIndex}]`;
        try {
          parseIsoDate(schedule.effectiveFrom);
          if (schedule.effectiveTo) parseIsoDate(schedule.effectiveTo);
        } catch {
          pushIssue(issues, `${path}.effectiveFrom`, "invalid_date", "节次表生效日期无效");
        }
        if (!Array.isArray(schedule.periods) || schedule.periods.length === 0) {
          pushIssue(issues, `${path}.periods`, "missing_periods", "节次表为空");
        } else {
          for (const period of schedule.periods) {
            try {
              assertTime(period.start, "开始时间");
              assertTime(period.end, "结束时间");
            } catch {
              pushIssue(issues, path, "invalid_clock", `节次 ${period.index} 时间无效`);
            }
          }
        }
      }
    }
  }

  if (Array.isArray(timetable.courses)) {
    for (const [courseIndex, course] of timetable.courses.entries()) {
      const path = `$.courses[${courseIndex}]`;
      if (!course || typeof course !== "object") {
        pushIssue(issues, path, "invalid_course", "课程必须是对象");
        continue;
      }
      if (!course.id || typeof course.id !== "string") {
        pushIssue(issues, `${path}.id`, "missing_course_id", "课程缺少稳定 ID");
      } else if (courseIds.has(course.id)) {
        pushIssue(issues, `${path}.id`, "duplicate_course_id", `课程 ID 重复：${course.id}`);
      } else {
        courseIds.add(course.id);
      }
      if (!course.name || typeof course.name !== "string") {
        pushIssue(issues, `${path}.name`, "missing_course_name", "课程缺少名称");
      }
      if (!Array.isArray(course.meetings) || course.meetings.length === 0) {
        pushIssue(issues, `${path}.meetings`, "missing_meetings", "课程没有上课实例");
        continue;
      }
      for (const [meetingIndex, meeting] of course.meetings.entries()) {
        meetingCount += 1;
        const meetingPath = `${path}.meetings[${meetingIndex}]`;
        if (!meeting.id || typeof meeting.id !== "string") {
          pushIssue(issues, `${meetingPath}.id`, "missing_meeting_id", "上课实例缺少稳定 ID");
        } else if (meetingIds.has(meeting.id)) {
          pushIssue(issues, `${meetingPath}.id`, "duplicate_meeting_id", `上课实例 ID 重复：${meeting.id}`);
        } else {
          meetingIds.add(meeting.id);
        }
        if (!Number.isInteger(meeting.weekday) || meeting.weekday < 1 || meeting.weekday > 7) {
          pushIssue(issues, `${meetingPath}.weekday`, "invalid_weekday", "星期必须为 1–7");
        }
        if (
          !Number.isInteger(meeting.startPeriod) ||
          !Number.isInteger(meeting.endPeriod) ||
          meeting.startPeriod < 1 ||
          meeting.endPeriod < meeting.startPeriod
        ) {
          pushIssue(issues, `${meetingPath}.periods`, "invalid_periods", "节次范围无效");
        }
        if (!Array.isArray(meeting.weeks) || meeting.weeks.length === 0) {
          missingPeriods += 1;
          pushIssue(issues, `${meetingPath}.weeks`, "missing_weeks", "上课实例没有周次");
        } else if (meeting.weeks.some((week) => !Number.isInteger(week) || week < 1 || week > 30)) {
          unknownWeekRules += 1;
          pushIssue(issues, `${meetingPath}.weeks`, "invalid_weeks", "周次必须在 1–30");
        }
        if (!meeting.teacher) missingTeacher += 1;
        if (!meeting.room) missingRoom += 1;
      }
    }
  }

  if (missingTeacher > 0) warnings.push({ path: "$.courses", code: "missing_teacher", message: `${missingTeacher} 个上课实例缺少教师` });
  if (missingRoom > 0) warnings.push({ path: "$.courses", code: "missing_room", message: `${missingRoom} 个上课实例缺少教室` });

  const checks: ValidationCheck[] = [
    { id: "schema", status: issues.some((issue) => issue.code === "unsupported_schema") ? "fail" : "pass", message: "数据 Schema" },
    { id: "term", status: issues.some((issue) => issue.code.includes("date") || issue.code === "not_monday") ? "fail" : "pass", message: "学期上下文" },
    { id: "courses", status: (timetable.courses?.length ?? 0) > 0 ? "pass" : "fail", message: "课程数量" },
    { id: "ids", status: issues.some((issue) => issue.code.includes("id")) ? "fail" : "pass", message: "稳定 ID" },
    { id: "periods", status: issues.some((issue) => issue.code.includes("period")) ? "fail" : "pass", message: "节次数据" },
    {
      id: "adjustments",
      status: Array.isArray(timetable.overrides) && timetable.overrides.length > 0 ? "pass" : "warn",
      message: "调课数据是否可获得",
    },
  ];
  const report: ValidationReport = {
    status: issues.length > 0 ? "failed" : warnings.length > 0 ? "partial" : "verified",
    checks,
    completeness: {
      courseCount: timetable.courses?.length ?? 0,
      meetingCount,
      missingTeacher,
      missingRoom,
      missingPeriods,
      unknownWeekRules,
      adjustmentDataAvailable: Array.isArray(timetable.overrides) && timetable.overrides.length > 0,
    },
  };
  return { valid: issues.length === 0, issues, warnings, report };
}

function findForbiddenKeys(value: unknown, path = "$"): string[] {
  const forbidden = /^(password|passwd|cookie|cookies|access_?token|refresh_?token|session_?token|csrf|xsrf|authorization|credential|credentials)$/i;
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => found.push(...findForbiddenKeys(item, `${path}[${index}]`)));
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (forbidden.test(key)) found.push(`${path}.${key}`);
      found.push(...findForbiddenKeys(nested, `${path}.${key}`));
    }
  }
  return found;
}

function emptyResult(issues: ValidationIssue[], warnings: ValidationIssue[]): ValidationResult {
  return {
    valid: false,
    issues,
    warnings,
    report: {
      status: "failed",
      checks: [{ id: "schema", status: "fail", message: "输入不是对象" }],
      completeness: {
        courseCount: 0,
        meetingCount: 0,
        missingTeacher: 0,
        missingRoom: 0,
        missingPeriods: 0,
        unknownWeekRules: 0,
        adjustmentDataAvailable: false,
      },
    },
  };
}
