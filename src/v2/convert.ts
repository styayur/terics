import { DEFAULT_PERIODS, type ParseResult, type PeriodTime, type RawCourse } from "../core/types";
import { makeCourseId, makeMeetingId, normalizeSemesterStart, sanitizeSourceUrl } from "./ids";
import type {
  CourseMeeting,
  CourseV2,
  ExtractionMetadata,
  NormalizedTimetableV2,
  PeriodSchedule,
  TermContext,
  TimetableEventV2,
  ValidationReport,
} from "./types";
import { validateTimetableV2 } from "./validate";

export interface ConvertRawOptions {
  sourceKind: "file" | "web";
  adapterId: string;
  adapterVersion: string;
  schoolId?: string;
  schoolName?: string;
  sourceUrl?: string;
  title: string;
  semesterStart: string;
  periods?: PeriodTime[];
  teachingWeeks?: number;
  timezone?: string;
}

export async function rawCoursesToV2(parsed: ParseResult, options: ConvertRawOptions): Promise<NormalizedTimetableV2> {
  const semesterStart = normalizeSemesterStart(options.semesterStart);
  const periodSource = options.periods ?? DEFAULT_PERIODS;
  const schedule: PeriodSchedule = {
    id: `periods-${semesterStart}`,
    label: "学期默认作息",
    effectiveFrom: semesterStart,
    periods: periodSource.map((period) => ({ ...period })),
  };
  const groups = new Map<string, RawCourse[]>();
  parsed.courses.forEach((course, index) => {
    const groupKey = course.sourceRef?.trim() || `row:${index + 1}`;
    const existing = groups.get(groupKey) ?? [];
    existing.push(course);
    groups.set(groupKey, existing);
  });

  const courses: CourseV2[] = [];
  let groupIndex = 0;
  for (const [sourceRef, group] of groups) {
    groupIndex += 1;
    const first = group[0];
    if (!first) continue;
    const courseId = await makeCourseId({
      adapterId: options.adapterId,
      sourceRef,
      fallbackOrdinal: groupIndex,
    });
    const meetings: CourseMeeting[] = [];
    for (const raw of group) {
      const meetingId = await makeMeetingId({
        courseId,
        sourceMeetingId: raw.sourceRef ? `${raw.sourceRef}|${raw.weekday}|${raw.startPeriod}|${raw.endPeriod}` : undefined,
        weekday: raw.weekday,
        startPeriod: raw.startPeriod,
        endPeriod: raw.endPeriod,
        weeks: raw.weeks,
      });
      meetings.push({
        id: meetingId,
        teacher: raw.teacher,
        room: raw.location,
        weekday: raw.weekday,
        startPeriod: raw.startPeriod,
        endPeriod: raw.endPeriod,
        weeks: [...raw.weeks],
        weekRule: raw.weekRule,
        note: raw.note,
        source: {
          adapterId: options.adapterId,
          adapterVersion: options.adapterVersion,
          sourceRef,
        },
      });
    }
    courses.push({
      id: courseId,
      name: first.name,
      source: {
        adapterId: options.adapterId,
        adapterVersion: options.adapterVersion,
        sourceRef,
      },
      meetings,
    });
  }

  const now = new Date().toISOString();
  const term: TermContext = {
    termId: `file:${semesterStart}`,
    academicYear: inferAcademicYear(semesterStart),
    termCode: "custom",
    termName: options.title,
    semesterStart,
    teachingWeeks: options.teachingWeeks ?? Math.max(1, ...parsed.courses.flatMap((course) => course.weeks)),
    timezone: options.timezone ?? "Asia/Shanghai",
    periodSchedules: [schedule],
  };
  const metadata: ExtractionMetadata = {
    extractedAt: now,
    sourceKind: options.sourceKind,
    method: "file",
    sourceUrl: options.sourceUrl ? sanitizeSourceUrl(options.sourceUrl) : undefined,
    rawCount: parsed.courses.length,
    parsedCount: courses.reduce((sum, course) => sum + course.meetings.length, 0),
    skippedCount: 0,
    adapterId: options.adapterId,
    adapterVersion: options.adapterVersion,
    schoolId: options.schoolId,
    schoolName: options.schoolName,
    platform: parsed.formatLabel,
  };
  const draft: NormalizedTimetableV2 = {
    schemaVersion: "2.0",
    source: {
      kind: options.sourceKind,
      adapterId: options.adapterId,
      adapterVersion: options.adapterVersion,
      schoolId: options.schoolId,
      schoolName: options.schoolName,
      platform: parsed.formatLabel,
      sourceUrl: metadata.sourceUrl,
      extractedAt: now,
    },
    term,
    courses,
    overrides: [],
    metadata,
    validation: {
      status: "partial",
      checks: [],
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
  draft.validation = validateTimetableV2(draft);
  return draft;
}

export function inferAcademicYear(semesterStart: string): string {
  const year = Number(semesterStart.slice(0, 4));
  const month = Number(semesterStart.slice(5, 7));
  const start = month < 7 ? year - 1 : year;
  return `${start}-${start + 1}`;
}

export function eventsToCalendarPreview(events: TimetableEventV2[]) {
  return events.map((event) => ({
    uid: event.uid,
    title: event.title,
    teacher: event.teacher,
    location: event.room,
    note: event.note,
    weekday: event.weekday,
    startPeriod: event.startPeriod,
    endPeriod: event.endPeriod,
    week: event.week,
    date: event.date,
    start: event.start,
    end: event.end,
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    weekRule: event.weekRule,
  }));
}

export function validationSummary(report: ValidationReport): string {
  return `${report.status}: ${report.checks.filter((check) => check.status === "pass").length}/${report.checks.length} checks passed`;
}
