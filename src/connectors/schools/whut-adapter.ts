import { addDaysIso, isMonday, parseIsoDate } from "../../core/dates";
import { makeCourseId, makeMeetingId } from "../../v2/ids";
import type {
  ConnectorContext,
  ConnectorDescriptor,
  ConnectorExtraction,
  CourseMeeting,
  CourseV2,
  DetectionResult,
  ExtractionDraft,
  NormalizedTimetableV2,
  PeriodSchedule,
  SemesterSelection,
  SISAdapter,
  ValidationReport,
} from "../../v2/types";
import { validateTimetableV2 } from "../../v2/validate";
import { ConnectorHttpError, fetchJson, postForm } from "../sdk/http";
import { WHUT_PROFILE } from "./whut";

const WHUT_API = "/jwapp/sys/homeapp/api/home";
const CURRENT_USER_URL = `${WHUT_API}/currentUser.do`;
const SECTIONS_URL = `${WHUT_API}/student/getSections.do`;
const SCHEDULE_URL = `${WHUT_API}/student/getMyScheduleDetail.do`;
const EXPECTED_WEEK_PERIODS = 13;

export interface WhutEnvelope<T> {
  msg?: string | null;
  code?: string | number;
  datas?: T;
}

export interface WhutWelcomeInfo {
  xnxqdm?: string;
  xnxqmc?: string;
  classWeek?: number | string;
  date?: string;
  [key: string]: unknown;
}

export interface WhutCurrentUserData {
  userId?: string;
  userName?: string;
  userType?: string;
  welcomeInfo?: WhutWelcomeInfo;
  [key: string]: unknown;
}

export interface WhutSectionRow {
  enable?: boolean;
  sort?: number | string;
  code?: number | string;
  name?: string;
  endTime?: string | null;
  startTime?: string | null;
  campus?: string | null;
  [key: string]: unknown;
}

export interface WhutCellDetail {
  color?: string | null;
  text?: string;
}

export interface WhutScheduleRow {
  week?: string;
  endTime?: string | null;
  color?: string;
  courseName?: string;
  courseCode?: string;
  credit?: number | string;
  beginSection?: number | string;
  beginTime?: string | null;
  endSection?: number | string;
  courseSerialNo?: string;
  teachClassName?: string;
  teachingTarget?: string;
  weeksAndTeachers?: string;
  placeName?: string;
  teachClassId?: string;
  cellDetail?: WhutCellDetail[];
  titleDetail?: string[];
  byCode?: string;
  tags?: unknown[];
  multiCourse?: unknown;
  dayOfWeek?: number | string;
  [key: string]: unknown;
}

export interface WhutScheduleData {
  arrangedList?: WhutScheduleRow[];
  notArrangeList?: WhutScheduleRow[];
  practiceList?: WhutScheduleRow[];
  code?: string;
  name?: string;
  [key: string]: unknown;
}

export interface WhutTermContext {
  termId: string;
  academicYear: string;
  termCode: string;
  termName: string;
  currentWeek: number;
  currentDate: string;
  currentWeekday: number;
  firstTeachingMonday: string;
  timezone: "Asia/Shanghai";
  weekStartsOn: 1;
  warnings: string[];
}

export interface WhutWeekBitmapResult {
  weeks: number[];
  weekRule: string;
  error?: string;
}

export class WhutConnectorError extends Error {
  readonly code:
    | "login_expired"
    | "current_user_unavailable"
    | "term_unavailable"
    | "invalid_api_response"
    | "missing_period_schedule"
    | "empty_timetable"
    | "partial_extraction";

  constructor(code: WhutConnectorError["code"], message: string) {
    super(message);
    this.name = "WhutConnectorError";
    this.code = code;
  }
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function integer(value: unknown): number | null {
  const parsed = Number(str(value));
  return Number.isInteger(parsed) ? parsed : null;
}

function assertSuccess<T>(response: WhutEnvelope<T>, operation: string): T {
  if (String(response.code) !== "0") {
    throw new WhutConnectorError(
      "invalid_api_response",
      `${operation}失败：${response.msg || `code=${str(response.code) || "missing"}`}`,
    );
  }
  return response.datas as T;
}

function mapRequestError(error: unknown, operation: string): never {
  if (error instanceof WhutConnectorError) throw error;
  if (error instanceof ConnectorHttpError) {
    if (error.status === 401 || error.status === 403 || /未返回 JSON/.test(error.message)) {
      throw new WhutConnectorError("login_expired", `${operation}失败：登录状态可能已过期，请在当前浏览器重新登录`);
    }
    throw new WhutConnectorError("current_user_unavailable", `${operation}失败：${error.message}`);
  }
  throw new WhutConnectorError(
    "invalid_api_response",
    `${operation}失败：${error instanceof Error ? error.message : String(error)}`,
  );
}

export function parseWhutTermCode(value: string): {
  termId: string;
  academicYear: string;
  termCode: string;
  startYear: number;
  endYear: number;
  termName: string;
} | null {
  const match = value.trim().match(/^(\d{4})-(\d{4})-([1-3])$/);
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  const termCode = match[3] ?? "1";
  const ordinal = termCode === "1" ? "一" : termCode === "2" ? "二" : "三";
  return {
    termId: value.trim(),
    academicYear: `${match[1]}-${match[2]}`,
    termCode,
    startYear,
    endYear,
    termName: `${match[1]}-${match[2]} 第${ordinal}学期`,
  };
}

function chineseWeekday(value: string): number | null {
  const index = "一二三四五六日天".indexOf(value);
  if (index < 0) return null;
  return index === 7 ? 7 : index + 1;
}

export function resolveWhutDisplayDate(
  raw: string,
  termCode: string,
  now: Date,
): { date: string; weekday: number } {
  const full = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:\s*星期([一二三四五六日天]))?$/);
  if (full) {
    const value = `${full[1]}-${full[2]}-${full[3]}`;
    const date = parseIsoDate(value);
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    if (full[4] && chineseWeekday(full[4]) !== weekday) {
      throw new WhutConnectorError("term_unavailable", `currentUser 日期星期不一致：${raw}`);
    }
    return { date: value, weekday };
  }

  const match = raw.match(/(\d{1,2})月(\d{1,2})日.*?星期([一二三四五六日天])/);
  if (!match) {
    throw new WhutConnectorError("term_unavailable", `currentUser 未返回可解析的教学日期：${raw || "空值"}`);
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const expectedWeekday = chineseWeekday(match[3] ?? "");
  if (expectedWeekday === null) {
    throw new WhutConnectorError("term_unavailable", `currentUser 日期缺少有效星期：${raw}`);
  }

  const term = parseWhutTermCode(termCode);
  const nowYear = now.getFullYear();
  const candidates = [...new Set([
    term?.startYear,
    term?.endYear,
    nowYear - 1,
    nowYear,
    nowYear + 1,
  ].filter((year): year is number => Number.isInteger(year)))];

  const valid = candidates
    .map((year) => {
      const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      try {
        const date = parseIsoDate(value);
        const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
        return { value, weekday, distance: Math.abs(date.getTime() - now.getTime()) };
      } catch {
        return null;
      }
    })
    .filter((item): item is { value: string; weekday: number; distance: number } => item !== null)
    .filter((item) => item.weekday === expectedWeekday)
    .sort((left, right) => left.distance - right.distance);

  const selected = valid[0];
  if (!selected) {
    throw new WhutConnectorError("term_unavailable", `无法为缺失年份的日期匹配星期：${raw}`);
  }
  return { date: selected.value, weekday: selected.weekday };
}

export function resolveWhutTermContext(
  currentUser: WhutCurrentUserData,
  now: Date,
): WhutTermContext {
  const welcome = currentUser.welcomeInfo;
  if (!welcome) {
    throw new WhutConnectorError("term_unavailable", "currentUser.do 未返回 welcomeInfo，无法确定当前学期");
  }
  const termRaw = str(welcome.xnxqdm);
  const term = parseWhutTermCode(termRaw);
  if (!term) {
    throw new WhutConnectorError("term_unavailable", `无法识别当前学期代码：${termRaw || "空值"}`);
  }
  const currentWeek = integer(welcome.classWeek);
  if (currentWeek === null || currentWeek < 1) {
    throw new WhutConnectorError("term_unavailable", `当前教学周无效：${str(welcome.classWeek) || "空值"}`);
  }
  const displayDate = resolveWhutDisplayDate(str(welcome.date), termRaw, now);
  const firstTeachingMonday = addDaysIso(
    displayDate.date,
    -((currentWeek - 1) * 7 + (displayDate.weekday - 1)),
  );
  if (!isMonday(firstTeachingMonday)) {
    throw new WhutConnectorError("term_unavailable", `推导出的第 1 周周一不是周一：${firstTeachingMonday}`);
  }
  const warnings: string[] = [];
  const termName = str(welcome.xnxqmc) || term.termName;
  return {
    termId: term.termId,
    academicYear: term.academicYear,
    termCode: term.termCode,
    termName,
    currentWeek,
    currentDate: displayDate.date,
    currentWeekday: displayDate.weekday,
    firstTeachingMonday,
    timezone: "Asia/Shanghai",
    weekStartsOn: 1,
    warnings,
  };
}

export function formatWeekRanges(weeks: number[]): string {
  const sorted = [...new Set(weeks)].sort((left, right) => left - right);
  if (sorted.length === 0) return "";
  const ranges: string[] = [];
  let start = sorted[0]!;
  let end = start;
  for (const week of sorted.slice(1)) {
    if (week === end + 1) {
      end = week;
    } else {
      ranges.push(start === end ? String(start) : `${start}-${end}`);
      start = week;
      end = week;
    }
  }
  ranges.push(start === end ? String(start) : `${start}-${end}`);
  return ranges.join(",");
}

export function parseWhutWeekBitmap(value: unknown): WhutWeekBitmapResult {
  const bitmap = str(value);
  if (!bitmap) {
    return { weeks: [], weekRule: "", error: "周次位图为空" };
  }
  if (!/^[01]+$/.test(bitmap)) {
    return { weeks: [], weekRule: "", error: `周次位图包含非 0/1 字符：${bitmap}` };
  }
  const weeks = Array.from(bitmap)
    .map((character, index) => (character === "1" ? index + 1 : 0))
    .filter((week) => week > 0);
  if (weeks.length === 0) {
    return { weeks: [], weekRule: "", error: "周次位图未标记任何教学周" };
  }
  return { weeks, weekRule: formatWeekRanges(weeks) };
}

export function parseWhutSections(
  response: WhutEnvelope<WhutSectionRow[]>,
  termCode: string,
  campusCode: string,
  effectiveFrom: string,
): { schedule: PeriodSchedule; warnings: string[] } {
  const rows = assertSuccess(response, "getSections.do");
  if (!Array.isArray(rows)) {
    throw new WhutConnectorError("invalid_api_response", "getSections.do 的 datas 不是数组");
  }
  const warnings: string[] = [];
  const periods: PeriodSchedule["periods"] = [];
  const seen = new Set<number>();
  for (const [index, row] of rows.entries()) {
    if (row.enable === false) continue;
    const periodIndex = integer(row.code);
    if (periodIndex === null || periodIndex < 1) {
      warnings.push(`getSections.do 第 ${index + 1} 条节次缺少有效 code，已忽略`);
      continue;
    }
    if (seen.has(periodIndex)) {
      warnings.push(`getSections.do 节次 ${periodIndex} 重复，保留首条有效记录`);
      continue;
    }
    const start = str(row.startTime);
    const end = str(row.endTime);
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end)) {
      warnings.push(`getSections.do 第 ${periodIndex} 节时间无效：${start || "空"}–${end || "空"}`);
      continue;
    }
    seen.add(periodIndex);
    periods.push({ index: periodIndex, start, end, label: str(row.name) || `第${periodIndex}节` });
  }
  periods.sort((left, right) => left.index - right.index);
  if (periods.length === 0) {
    throw new WhutConnectorError("missing_period_schedule", "getSections.do 未返回可用节次时间");
  }
  for (let index = 1; index <= EXPECTED_WEEK_PERIODS; index += 1) {
    if (!seen.has(index)) warnings.push(`getSections.do 缺少第 ${index} 节`);
  }
  return {
    schedule: {
      id: `whut-periods-${termCode}-${campusCode || "all"}`,
      label: "WHUT getSections.do 实际作息",
      effectiveFrom,
      periods,
    },
    warnings,
  };
}

function inferCampus(room: string): string | undefined {
  const first = room.split("-")[0]?.trim();
  return first && first !== room && /(?:校区|区|院)$/.test(first) ? first : undefined;
}

function roomFromDetails(row: WhutScheduleRow): string {
  const direct = str(row.placeName);
  if (direct) return direct;
  const detail = str(row.cellDetail?.[3]?.text || row.titleDetail?.[3]);
  const parts = detail.split(",");
  return parts.length >= 3 ? parts.slice(2).join(",").trim() : "";
}

function teacherFromDetails(row: WhutScheduleRow): string {
  return str(row.titleDetail?.[1]) || str(row.weeksAndTeachers) || str(row.cellDetail?.[2]?.text);
}

export interface WhutNormalizationResult {
  courses: CourseV2[];
  warnings: string[];
  parsedRows: number;
  skippedRows: number;
  rawCollectionCounts: Record<"arrangedList" | "notArrangeList" | "practiceList", number>;
}

export async function normalizeWhutScheduleDetail(
  data: WhutScheduleData,
  descriptor: ConnectorDescriptor,
  term: WhutTermContext,
  schedule: PeriodSchedule,
): Promise<WhutNormalizationResult> {
  const collections = {
    arrangedList: Array.isArray(data.arrangedList) ? data.arrangedList : [],
    notArrangeList: Array.isArray(data.notArrangeList) ? data.notArrangeList : [],
    practiceList: Array.isArray(data.practiceList) ? data.practiceList : [],
  };
  const warnings: string[] = [];
  if (!Array.isArray(data.arrangedList)) warnings.push("getMyScheduleDetail.do 缺少 arrangedList 数组");
  if (!Array.isArray(data.notArrangeList)) warnings.push("getMyScheduleDetail.do 缺少 notArrangeList 数组");
  if (!Array.isArray(data.practiceList)) warnings.push("getMyScheduleDetail.do 缺少 practiceList 数组");

  const periodIndexes = new Set(schedule.periods.map((period) => period.index));
  const coursesByKey = new Map<string, CourseV2>();
  const meetingIds = new Set<string>();
  let parsedRows = 0;
  let skippedRows = 0;

  for (const [collectionName, rows] of Object.entries(collections) as Array<
    [keyof typeof collections, WhutScheduleRow[]]
  >) {
    if (rows.length === 0) continue;
    let collectionParsed = 0;
    for (const [index, row] of rows.entries()) {
      const name = str(row.courseName) || str(row.titleDetail?.[0]);
      const weekday = integer(row.dayOfWeek);
      const startPeriod = integer(row.beginSection);
      const endPeriod = integer(row.endSection) ?? startPeriod;
      if (!name) {
        warnings.push(`${collectionName} 第 ${index + 1} 条缺少课程名称，已跳过`);
        skippedRows += 1;
        continue;
      }
      if (weekday === null || weekday < 1 || weekday > 7) {
        warnings.push(`${collectionName} 第 ${index + 1} 条课程 ${name} 的星期无效，已保留为未排课警告`);
        skippedRows += 1;
        continue;
      }
      if (startPeriod === null || endPeriod === null || startPeriod < 1 || endPeriod < startPeriod) {
        warnings.push(`${collectionName} 第 ${index + 1} 条课程 ${name} 的节次范围无效，已保留为未排课警告`);
        skippedRows += 1;
        continue;
      }
      if (!periodIndexes.has(startPeriod) || !periodIndexes.has(endPeriod)) {
        warnings.push(
          `${collectionName} 第 ${index + 1} 条课程 ${name} 引用了 getSections.do 中不存在的节次 ${startPeriod}-${endPeriod}，已跳过`,
        );
        skippedRows += 1;
        continue;
      }
      const weekResult = parseWhutWeekBitmap(row.week);
      if (weekResult.error) {
        warnings.push(`${collectionName} 第 ${index + 1} 条课程 ${name}：${weekResult.error}`);
        skippedRows += 1;
        continue;
      }
      const courseCode = str(row.courseCode);
      const teachClassId = str(row.teachClassId);
      const courseSerialNo = str(row.courseSerialNo);
      const sourceCourseId = [courseCode, teachClassId].filter(Boolean).join("|");
      if (!sourceCourseId) {
        warnings.push(`${collectionName} 第 ${index + 1} 条课程 ${name} 缺少 courseCode/teachClassId，无法生成稳定课程 ID，已跳过`);
        skippedRows += 1;
        continue;
      }
      const courseId = await makeCourseId({
        adapterId: descriptor.id,
        sourceCourseId,
        sourceRef: courseSerialNo || `${collectionName}:${index + 1}`,
        fallbackOrdinal: parsedRows + skippedRows + 1,
      });
      const sourceMeetingId = [
        courseCode,
        teachClassId,
        courseSerialNo,
        weekday,
        startPeriod,
        endPeriod,
        str(row.week),
      ].join("|");
      const meetingId = await makeMeetingId({
        courseId,
        sourceMeetingId,
        weekday,
        startPeriod,
        endPeriod,
        weeks: weekResult.weeks,
      });
      if (meetingIds.has(meetingId)) {
        warnings.push(`${collectionName} 第 ${index + 1} 条课程 ${name} 与其他记录生成相同 meeting ID，已跳过重复记录`);
        skippedRows += 1;
        continue;
      }
      meetingIds.add(meetingId);
      const room = roomFromDetails(row);
      const teacher = teacherFromDetails(row);
      const meeting: CourseMeeting = {
        id: meetingId,
        teacher,
        room,
        campus: inferCampus(room),
        weekday,
        startPeriod,
        endPeriod,
        weeks: weekResult.weeks,
        weekRule: weekResult.weekRule,
        note: collectionName === "practiceList" ? "实践课记录" : undefined,
        source: {
          adapterId: descriptor.id,
          adapterVersion: descriptor.version,
          schoolId: descriptor.schoolId,
          sourceCourseId,
          sourceRef: courseSerialNo || `${collectionName}:${index + 1}`,
        },
      };
      const existing = coursesByKey.get(courseId);
      if (existing) {
        existing.meetings.push(meeting);
      } else {
        const credits = Number(str(row.credit));
        coursesByKey.set(courseId, {
          id: courseId,
          name,
          credits: Number.isFinite(credits) && credits > 0 ? credits : undefined,
          teachingClass: str(row.teachClassName) || str(row.titleDetail?.[2]),
          source: {
            adapterId: descriptor.id,
            adapterVersion: descriptor.version,
            schoolId: descriptor.schoolId,
            sourceCourseId,
            sourceRef: courseSerialNo || `${collectionName}:${index + 1}`,
          },
          meetings: [meeting],
        });
      }
      parsedRows += 1;
      collectionParsed += 1;
    }
    if (collectionName !== "arrangedList" && rows.length > 0 && collectionParsed === 0) {
      warnings.push(`${collectionName} 包含 ${rows.length} 条当前无法排入日历的记录；计数已保留，未静默丢弃`);
    }
  }

  return {
    courses: [...coursesByKey.values()],
    warnings: [...term.warnings, ...warnings],
    parsedRows,
    skippedRows,
    rawCollectionCounts: {
      arrangedList: collections.arrangedList.length,
      notArrangeList: collections.notArrangeList.length,
      practiceList: collections.practiceList.length,
    },
  };
}

function whutDescriptor(): ConnectorDescriptor {
  return {
    id: "whut-wisedu-jwapp",
    version: "0.5.1",
    vendor: "wisedu",
    vendorLabel: "金智 Wisedu jwapp / WHUT",
    schoolId: WHUT_PROFILE.id,
    schoolName: WHUT_PROFILE.name,
    platformVersion: WHUT_PROFILE.platformVersion,
    status: WHUT_PROFILE.status,
    capabilities: WHUT_PROFILE.capabilities,
    verifiedDomains: WHUT_PROFILE.domains,
    methods: ["api"],
    lastVerifiedAt: WHUT_PROFILE.lastVerifiedAt,
    evidenceUrls: WHUT_PROFILE.evidenceUrls,
    limitations: WHUT_PROFILE.limitations,
  };
}

export function createWhutAdapter(): SISAdapter {
  const descriptor = whutDescriptor();
  return {
    descriptor,
    async detect(context: ConnectorContext): Promise<DetectionResult> {
      const host = context.url.hostname.toLowerCase();
      const path = context.url.pathname;
      const text = context.document.documentElement?.textContent ?? "";
      const evidence: string[] = [];
      if (host === "jwxt.whut.edu.cn" || host.endsWith(".whut.edu.cn")) evidence.push("whut.edu.cn 域名");
      if (path.includes("/jwapp/")) evidence.push("/jwapp/ 路径");
      if (text.includes("我的课表") || text.includes("教学管理系统")) evidence.push("WHUT 教务页面特征");
      const confidence = evidence.length >= 2 ? 0.99 : evidence.length === 1 ? 0.82 : 0;
      return {
        detected: confidence > 0,
        adapterId: descriptor.id,
        schoolId: descriptor.schoolId,
        confidence,
        vendor: descriptor.vendor,
        evidence,
        reason: confidence > 0 ? undefined : "未发现武汉理工 WHUT jwapp 特征",
      };
    },
    async extract(context, semester: SemesterSelection): Promise<ConnectorExtraction> {
      const origin = context.url.origin;
      let currentUser: WhutEnvelope<WhutCurrentUserData>;
      try {
        currentUser = await fetchJson<WhutEnvelope<WhutCurrentUserData>>(
          `${origin}${CURRENT_USER_URL}`,
          { method: "GET", cache: "no-store" },
          context.fetchImpl,
        );
      } catch (error) {
        mapRequestError(error, "currentUser.do");
      }
      const userData = assertSuccess(currentUser, "currentUser.do");
      if (!userData || typeof userData !== "object") {
        throw new WhutConnectorError("current_user_unavailable", "currentUser.do 未返回用户数据");
      }
      const term = resolveWhutTermContext(userData, context.now());
      const campusCode = semester.campus ?? "";
      let sectionResponse: WhutEnvelope<WhutSectionRow[]>;
      try {
        const sectionsUrl = new URL(`${origin}${SECTIONS_URL}`);
        sectionsUrl.searchParams.set("termCode", term.termId);
        sectionsUrl.searchParams.set("campusCode", campusCode);
        sectionResponse = await fetchJson<WhutEnvelope<WhutSectionRow[]>>(
          sectionsUrl.toString(),
          { method: "GET", cache: "no-store" },
          context.fetchImpl,
        );
      } catch (error) {
        mapRequestError(error, "getSections.do");
      }
      const parsedSections = parseWhutSections(sectionResponse, term.termId, campusCode, term.firstTeachingMonday);
      const warnings = [...term.warnings, ...parsedSections.warnings];
      if (semester.semesterStart && semester.semesterStart !== term.firstTeachingMonday) {
        warnings.push(
          `界面填写第 1 周周一为 ${semester.semesterStart}，教务 currentUser.do 推导为 ${term.firstTeachingMonday}；已采用教务值。`,
        );
      }

      let detailResponse: WhutEnvelope<WhutScheduleData>;
      try {
        detailResponse = await postForm<WhutEnvelope<WhutScheduleData>>(
          `${origin}${SCHEDULE_URL}`,
          {
            termCode: term.termId,
            campusCode,
            type: "week",
            week: String(term.currentWeek),
          },
          context.fetchImpl,
        );
      } catch (error) {
        mapRequestError(error, "getMyScheduleDetail.do");
      }
      const scheduleData = assertSuccess(detailResponse, "getMyScheduleDetail.do");
      if (!scheduleData || typeof scheduleData !== "object") {
        throw new WhutConnectorError("invalid_api_response", "getMyScheduleDetail.do 未返回课表数据");
      }
      const rawTotal =
        (scheduleData.arrangedList?.length ?? 0) +
        (scheduleData.notArrangeList?.length ?? 0) +
        (scheduleData.practiceList?.length ?? 0);
      if (rawTotal === 0) {
        throw new WhutConnectorError("empty_timetable", "教务返回空课表；当前学期或学生课表可能尚未生成");
      }
      const normalized = await normalizeWhutScheduleDetail(
        scheduleData,
        descriptor,
        term,
        parsedSections.schedule,
      );
      if (normalized.courses.length === 0) {
        throw new WhutConnectorError(
          "partial_extraction",
          `教务返回 ${rawTotal} 条记录，但没有可生成的课程事件。请查看解析警告并核对接口字段。`,
        );
      }
      const maxWeek = Math.max(1, ...normalized.courses.flatMap((course) => course.meetings.flatMap((meeting) => meeting.weeks)));
      const draft: ExtractionDraft = {
        descriptor,
        termSource: "adapter",
        term: {
          termId: term.termId,
          academicYear: term.academicYear,
          termCode: term.termCode,
          termName: term.termName,
          semesterStart: term.firstTeachingMonday,
          teachingWeeks: maxWeek,
          timezone: "Asia/Shanghai",
          campus: campusCode || undefined,
          periodSchedules: [parsedSections.schedule],
        },
        courses: normalized.courses,
        overrides: [],
        metadata: {
          method: "api",
          sourceUrl: `${context.url.origin}${context.url.pathname}`,
          rawCount: rawTotal,
          parsedCount: normalized.parsedRows,
          skippedCount: normalized.skippedRows,
          schoolId: descriptor.schoolId,
          schoolName: descriptor.schoolName,
          platform: descriptor.vendorLabel,
          userNote: [
            `currentUser.do week=${term.currentWeek}`,
            `collections=${normalized.rawCollectionCounts.arrangedList}/${normalized.rawCollectionCounts.notArrangeList}/${normalized.rawCollectionCounts.practiceList}`,
            "只读提取；未持久化 Cookie、CSRF 或学号",
          ].join("; "),
        },
        warnings: [
          ...warnings,
          ...normalized.warnings,
          `getMyScheduleDetail.do: arrangedList=${normalized.rawCollectionCounts.arrangedList}, notArrangeList=${normalized.rawCollectionCounts.notArrangeList}, practiceList=${normalized.rawCollectionCounts.practiceList}`,
        ],
      };
      return {
        draft,
        rawRows: rawTotal,
        parsedRows: normalized.parsedRows,
        skippedRows: normalized.skippedRows,
        evidence: [
          "GET currentUser.do",
          "GET getSections.do",
          "POST getMyScheduleDetail.do form: termCode,campusCode,type=week,week",
          `arrangedList=${normalized.rawCollectionCounts.arrangedList}`,
        ],
      };
    },
    validate(timetable: NormalizedTimetableV2): ValidationReport {
      return validateTimetableV2(timetable);
    },
  };
}
