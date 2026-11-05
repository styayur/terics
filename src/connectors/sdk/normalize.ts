import { DEFAULT_PERIODS } from "../../core/types";
import { isMonday } from "../../core/dates";
import { inferAcademicYear, } from "../../v2/convert";
import { sanitizeSourceUrl } from "../../v2/ids";
import type {
  ConnectorDescriptor,
  ConnectorExtraction,
  ExtractionDraft,
  NormalizedTimetableV2,
  PeriodSchedule,
  SemesterSelection,
} from "../../v2/types";
import { EXCHANGE_SCHEMA_VERSION } from "../../v2/types";
import { validateTimetableV2 } from "../../v2/validate";

export interface FinalizeOptions {
  sourceKind: "extension" | "desktop" | "web";
  sourceUrl?: string;
  fallbackPeriods?: PeriodSchedule["periods"];
  /** Fixed timestamp for reproducible fixtures and exports. */
  extractedAt?: string;
}

export function finalizeConnectorExtraction(
  extraction: ConnectorExtraction,
  descriptor: ConnectorDescriptor,
  semester: SemesterSelection,
  options: FinalizeOptions,
): NormalizedTimetableV2 {
  const draft: ExtractionDraft = extraction.draft;
  const authoritativeTerm = draft.termSource === "adapter";
  const semesterStart = authoritativeTerm ? draft.term.semesterStart : semester.semesterStart;
  if (!isMonday(semesterStart)) {
    throw new Error("学期开始日期必须是第 1 周周一");
  }
  const periodSchedules =
    draft.term.periodSchedules && draft.term.periodSchedules.length > 0
      ? draft.term.periodSchedules
      : [
          {
            id: `periods-${semesterStart}`,
            label: "用户确认的默认作息",
            effectiveFrom: semesterStart,
            periods: (options.fallbackPeriods ?? DEFAULT_PERIODS).map((period) => ({ ...period })),
          },
        ];
  const maxWeek = Math.max(1, ...draft.courses.flatMap((course) => course.meetings.flatMap((meeting) => meeting.weeks)));
  const now = options.extractedAt ?? new Date().toISOString();
  const sourceUrl = options.sourceUrl ? sanitizeSourceUrl(options.sourceUrl) : undefined;
  const timetable: NormalizedTimetableV2 = {
    schemaVersion: EXCHANGE_SCHEMA_VERSION,
    source: {
      kind: options.sourceKind,
      adapterId: descriptor.id,
      adapterVersion: descriptor.version,
      schoolId: descriptor.schoolId,
      schoolName: descriptor.schoolName,
      platform: descriptor.vendorLabel,
      sourceUrl,
      extractedAt: now,
    },
    term: {
      ...draft.term,
      academicYear: authoritativeTerm
        ? draft.term.academicYear
        : semester.academicYear ?? draft.term.academicYear ?? inferAcademicYear(semesterStart),
      termCode: draft.term.termCode && draft.term.termCode !== "unknown" ? draft.term.termCode : semester.termCode ?? "unknown",
      termName: authoritativeTerm ? draft.term.termName : semester.termName || draft.term.termName,
      semesterStart,
      teachingWeeks: authoritativeTerm
        ? draft.term.teachingWeeks ?? maxWeek
        : semester.teachingWeeks ?? draft.term.teachingWeeks ?? maxWeek,
      timezone: authoritativeTerm ? draft.term.timezone : semester.timezone ?? draft.term.timezone ?? "Asia/Shanghai",
      campus: authoritativeTerm ? draft.term.campus ?? semester.campus : semester.campus ?? draft.term.campus,
      periodSchedules,
    },
    courses: draft.courses,
    overrides: draft.overrides,
    metadata: {
      ...draft.metadata,
      extractedAt: now,
      sourceKind: options.sourceKind,
      sourceUrl,
      rawCount: extraction.rawRows,
      parsedCount: extraction.parsedRows,
      skippedCount: extraction.skippedRows,
      adapterId: descriptor.id,
      adapterVersion: descriptor.version,
      schoolId: descriptor.schoolId,
      schoolName: descriptor.schoolName,
      platform: descriptor.vendorLabel,
    },
    warnings: [...draft.warnings],
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
  timetable.validation = validateTimetableV2(timetable);
  return timetable;
}
