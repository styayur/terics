export const APP_VERSION = "0.5.0-rc.1";
export const TIMEZONE = "Asia/Shanghai" as const;
export const DEFAULT_MAX_WEEK = 30;

export type InputFormat = "csv" | "html" | "xlsx";
export type IssueSeverity = "error" | "warning" | "info";

export interface ParseIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  row?: number;
  hint?: string;
}

export interface RawCourse {
  name: string;
  teacher: string;
  location: string;
  weekday: number;
  startPeriod: number;
  endPeriod: number;
  weeks: number[];
  weekRule: string;
  note: string;
  sourceRef?: string;
}

export interface ParseInput {
  fileName: string;
  bytes: Uint8Array;
}

export interface ParseResult {
  format: InputFormat;
  formatLabel: string;
  confidence: number;
  courses: RawCourse[];
  issues: ParseIssue[];
  metadata: {
    sheetName?: string;
    tableCount?: number;
    detectedEncoding?: string;
    sourceRows?: number;
  };
}

export interface PeriodTime {
  index: number;
  start: string;
  end: string;
  label?: string;
}

export interface SemesterConfig {
  title: string;
  semesterStart: string;
  timezone: typeof TIMEZONE;
  periods: PeriodTime[];
  alarmMinutes: number;
  teachingWeeks?: number;
}

export interface CalendarEvent {
  uid: string;
  title: string;
  teacher: string;
  location: string;
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
}

export interface Conflict {
  date: string;
  start: string;
  end: string;
  eventIndexes: number[];
  labels: string[];
}

export interface BuildResult {
  events: CalendarEvent[];
  conflicts: Conflict[];
  issues: ParseIssue[];
}

export interface IcsOptions {
  now?: Date;
}

export const FORMAT_LABELS: Record<InputFormat, string> = {
  csv: "CSV 课程清单",
  html: "HTML 教务课表",
  xlsx: "XLSX 网格课表",
};

export const DEFAULT_PERIODS: PeriodTime[] = [
  { index: 1, start: "08:00", end: "08:45" },
  { index: 2, start: "08:55", end: "09:40" },
  { index: 3, start: "10:00", end: "10:45" },
  { index: 4, start: "10:55", end: "11:40" },
  { index: 5, start: "14:00", end: "14:45" },
  { index: 6, start: "14:55", end: "15:40" },
  { index: 7, start: "16:00", end: "16:45" },
  { index: 8, start: "16:55", end: "17:40" },
  { index: 9, start: "19:00", end: "19:45" },
  { index: 10, start: "19:55", end: "20:40" },
  { index: 11, start: "20:50", end: "21:35" },
  { index: 12, start: "21:45", end: "22:30" },
];
