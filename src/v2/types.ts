export const EXCHANGE_SCHEMA_VERSION = "2.0";
export const CONNECTOR_SDK_VERSION = "1.0";
export const DEFAULT_TIMEZONE = "Asia/Shanghai" as const;

export type ConnectorCapability =
  | "timetable"
  | "semester"
  | "periods"
  | "classroom"
  | "adjustments"
  | "exams";

export type AdapterSupportLevel =
  | "verified"
  | "fixture-tested"
  | "experimental"
  | "community"
  | "unsupported";

export type ExtractionMethod = "api" | "export" | "dom" | "file" | "manual";
export type ValidationStatus = "verified" | "partial" | "failed";

export interface ConnectorDescriptor {
  id: string;
  version: string;
  vendor: string;
  vendorLabel: string;
  schoolId?: string;
  schoolName?: string;
  platformVersion?: string;
  status: AdapterSupportLevel;
  capabilities: ConnectorCapability[];
  verifiedDomains: string[];
  methods: ExtractionMethod[];
  lastVerifiedAt?: string;
  evidenceUrls?: string[];
  limitations: string[];
}

export interface ConnectorContext {
  url: URL;
  document: Document;
  fetchImpl: typeof fetch;
  now: () => Date;
}

export interface SemesterSelection {
  academicYear?: string;
  termCode?: string;
  termName: string;
  semesterStart: string;
  teachingWeeks?: number;
  campus?: string;
  timezone?: string;
}

export interface DetectionResult {
  detected: boolean;
  adapterId: string;
  schoolId?: string;
  confidence: number;
  vendor: string;
  evidence: string[];
  reason?: string;
}

export interface PeriodSchedule {
  id: string;
  label: string;
  effectiveFrom: string;
  effectiveTo?: string;
  periods: Array<{
    index: number;
    start: string;
    end: string;
    label?: string;
  }>;
}

export interface TermContext {
  termId: string;
  academicYear: string;
  termCode: string;
  termName: string;
  semesterStart: string;
  teachingWeeks: number;
  timezone: string;
  campus?: string;
  periodSchedules: PeriodSchedule[];
}

export interface CourseSource {
  adapterId?: string;
  adapterVersion?: string;
  schoolId?: string;
  sourceCourseId?: string;
  sourceRef?: string;
}

export interface CourseMeeting {
  id: string;
  teacher: string;
  room: string;
  campus?: string;
  weekday: number;
  startPeriod: number;
  endPeriod: number;
  weeks: number[];
  weekRule: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  note?: string;
  source?: CourseSource;
}

export interface CourseV2 {
  id: string;
  name: string;
  category?: string;
  credits?: number;
  teachingClass?: string;
  source?: CourseSource;
  meetings: CourseMeeting[];
}

export type ScheduleOverride =
  | {
      id: string;
      type: "cancel";
      courseId: string;
      meetingId: string;
      originalDate: string;
      reason?: string;
      confirmed: boolean;
    }
  | {
      id: string;
      type: "reschedule";
      courseId: string;
      meetingId: string;
      originalDate: string;
      newDate: string;
      startPeriod?: number;
      endPeriod?: number;
      startTime?: string;
      endTime?: string;
      room?: string;
      teacher?: string;
      reason?: string;
      confirmed: boolean;
    }
  | {
      id: string;
      type: "makeup";
      courseId: string;
      meetingId: string;
      newDate: string;
      startPeriod?: number;
      endPeriod?: number;
      startTime?: string;
      endTime?: string;
      room?: string;
      teacher?: string;
      reason?: string;
      confirmed: boolean;
    }
  | {
      id: string;
      type: "room_change" | "teacher_change" | "period_change";
      courseId: string;
      meetingId: string;
      originalDate: string;
      room?: string;
      teacher?: string;
      startPeriod?: number;
      endPeriod?: number;
      startTime?: string;
      endTime?: string;
      reason?: string;
      confirmed: boolean;
    };

export interface ExtractionMetadata {
  extractedAt: string;
  sourceKind: "extension" | "desktop" | "file" | "web";
  method: ExtractionMethod;
  sourceUrl?: string;
  rawCount: number;
  parsedCount: number;
  skippedCount: number;
  adapterId: string;
  adapterVersion: string;
  schoolId?: string;
  schoolName?: string;
  platform?: string;
  userNote?: string;
}

export interface ValidationCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface ValidationReport {
  status: ValidationStatus;
  checks: ValidationCheck[];
  completeness: {
    courseCount: number;
    meetingCount: number;
    missingTeacher: number;
    missingRoom: number;
    missingPeriods: number;
    unknownWeekRules: number;
    adjustmentDataAvailable: boolean;
  };
}

export interface NormalizedTimetableV2 {
  schemaVersion: typeof EXCHANGE_SCHEMA_VERSION;
  source: {
    kind: "extension" | "desktop" | "file" | "web";
    adapterId: string;
    adapterVersion: string;
    schoolId?: string;
    schoolName?: string;
    platform?: string;
    sourceUrl?: string;
    extractedAt: string;
  };
  term: TermContext;
  courses: CourseV2[];
  overrides: ScheduleOverride[];
  metadata: ExtractionMetadata;
  validation: ValidationReport;
  warnings?: string[];
}

export interface ExtractionDraft {
  descriptor: ConnectorDescriptor;
  /** Adapter-derived term context is authoritative and is accompanied by an explicit warning on mismatch. */
  termSource?: "adapter" | "user";
  term: Omit<TermContext, "periodSchedules"> & { periodSchedules?: PeriodSchedule[] };
  courses: CourseV2[];
  overrides: ScheduleOverride[];
  metadata: Omit<ExtractionMetadata, "adapterId" | "adapterVersion" | "extractedAt" | "sourceKind">;
  warnings: string[];
}

export interface ConnectorExtraction {
  draft: ExtractionDraft;
  rawRows: number;
  parsedRows: number;
  skippedRows: number;
  evidence: string[];
}

export interface SISAdapter {
  descriptor: ConnectorDescriptor;
  detect(context: ConnectorContext): Promise<DetectionResult>;
  extract(context: ConnectorContext, semester: SemesterSelection): Promise<ConnectorExtraction>;
  validate(timetable: NormalizedTimetableV2): ValidationReport;
}

export interface TimetableEventV2 {
  uid: string;
  courseId: string;
  meetingId: string;
  title: string;
  teacher: string;
  room: string;
  campus?: string;
  note: string;
  weekday: number;
  startPeriod: number;
  endPeriod: number;
  week: number;
  date: string;
  start: string;
  end: string;
  startDateTime: string;
  endDateTime: string;
  weekRule: string;
  source: {
    adapterId: string;
    adapterVersion: string;
    schoolId?: string;
    termId: string;
  };
}

export interface BuildV2Result {
  events: TimetableEventV2[];
  conflicts: Array<{
    date: string;
    start: string;
    end: string;
    eventIndexes: number[];
    labels: string[];
  }>;
  issues: Array<{
    severity: "error" | "warning" | "info";
    code: string;
    message: string;
  }>;
}
