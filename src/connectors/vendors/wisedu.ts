import { DEFAULT_PERIODS } from "../../core/types";
import { parseWeeksDetailed } from "../../core/weeks";
import { makeCourseId, makeMeetingId } from "../../v2/ids";
import type {
  ConnectorDescriptor,
  ConnectorExtraction,
  ConnectorContext,
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
import { fetchJson, postForm, postFormText } from "../sdk/http";

export const WISEDU_SECTION_FALLBACK: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  8: 6,
  9: 7,
  10: 8,
  11: 9,
  12: 10,
  14: 11,
  15: 12,
  16: 13,
};

interface JwAppRowsResponse {
  datas?: Record<string, { rows?: WiseduRow[] }>;
}

export interface WiseduRow {
  KCM?: string;
  KCH?: string;
  KXH?: string;
  SKJS?: string;
  JASMC?: string;
  SKXQ?: number | string;
  KSJC?: number | string;
  JSJC?: number | string;
  SKZC?: string;
  ZCMC?: string;
  KBID?: string;
  WID?: string;
  XNXQDM?: string;
  XNXQDM_DISPLAY?: string;
  KSSJ?: string;
  JSSJ?: string;
  YPSJDD?: string;
  XXXQMC?: string;
  XXXQDM_DISPLAY?: string;
  KCXZDM_DISPLAY?: string;
  KCLBDM_DISPLAY?: string;
  JXBID?: string;
  SKBJ?: string;
  XF?: number | string;
  ISTK?: number | string;
  KBLB?: string;
  [key: string]: unknown;
}

interface CurrentUserResponse {
  datas?: {
    userId?: string;
    xh?: string;
    username?: string;
    welcomeInfo?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

interface SectionMapRow {
  DM?: number | string;
  MC?: string;
  KSSJ?: string;
  JSSJ?: string;
  [key: string]: unknown;
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function num(value: unknown): number | null {
  const parsed = Number(str(value));
  return Number.isInteger(parsed) ? parsed : null;
}

export function weeksFromBitmap(bitmap: string): number[] {
  return Array.from(bitmap)
    .map((value, index) => (value === "1" ? index + 1 : 0))
    .filter((week) => week > 0);
}

function defaultDescriptor(): ConnectorDescriptor {
  return {
    id: "wisedu-jwapp",
    version: "0.5.1",
    vendor: "wisedu",
    vendorLabel: "金智 Wisedu jwapp（通用）",
    platformVersion: "jwapp",
    status: "experimental",
    capabilities: ["timetable", "semester", "periods", "classroom"],
    verifiedDomains: [],
    methods: ["api", "dom"],
    limitations: ["通用金智适配器不能继承 WHUT 的学校级验证结论。"],
  };
}

function parseTermCode(value: string, semester: SemesterSelection): { termId: string; academicYear: string; termCode: string; termName: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{4})-(\d)$/);
  if (match) {
    const academicYear = `${match[1]}-${match[2]}`;
    const termCode = match[3] ?? "1";
    const termName = `${academicYear} 第${termCode === "1" ? "一" : termCode === "2" ? "二" : termCode}学期`;
    return { termId: trimmed, academicYear, termCode, termName };
  }
  return {
    termId: trimmed || semester.termCode || "unknown",
    academicYear: semester.academicYear ?? "unknown",
    termCode: semester.termCode ?? "unknown",
    termName: semester.termName,
  };
}

function sectionMapFromRows(rows: SectionMapRow[]): Record<number, number> {
  const map: Record<number, number> = {};
  let physical = 0;
  for (const row of rows) {
    const dm = num(row.DM);
    const mc = str(row.MC);
    if (dm !== null && mc.includes("节")) {
      physical += 1;
      map[dm] = physical;
    }
  }
  return Object.keys(map).length >= 10 ? map : { ...WISEDU_SECTION_FALLBACK };
}

function periodScheduleFromRows(rows: WiseduRow[], sectionMap: Record<number, number>, semesterStart: string): PeriodSchedule {
  const periods = DEFAULT_PERIODS.map((period) => ({ ...period }));
  for (const row of rows) {
    const rawStart = num(row.KSJC);
    const rawEnd = num(row.JSJC);
    const start = rawStart !== null ? sectionMap[rawStart] ?? rawStart : null;
    const end = rawEnd !== null ? sectionMap[rawEnd] ?? rawEnd : start;
    if (start !== null && row.KSSJ) {
      const match = periods.find((period) => period.index === start);
      if (match) match.start = str(row.KSSJ);
      else if (row.JSSJ) periods.push({ index: start, start: str(row.KSSJ), end: str(row.JSSJ) });
    }
    if (end !== null && row.JSSJ) {
      const match = periods.find((period) => period.index === end);
      if (match) match.end = str(row.JSSJ);
      else if (row.KSSJ) periods.push({ index: end, start: str(row.KSSJ), end: str(row.JSSJ) });
    }
  }
  periods.sort((left, right) => left.index - right.index);
  return {
    id: `whut-periods-${semesterStart}`,
    label: "WHUT 教务接口/默认节次",
    effectiveFrom: semesterStart,
    periods,
  };
}

function extractRows(response: JwAppRowsResponse, preferredKeys: string[]): WiseduRow[] {
  const datas = response.datas ?? {};
  for (const key of preferredKeys) {
    const rows = datas[key]?.rows;
    if (Array.isArray(rows)) return rows;
  }
  return [];
}

export async function normalizeWiseduRows(
  rows: WiseduRow[],
  descriptor: ConnectorDescriptor,
  semester: SemesterSelection,
  sectionMap: Record<number, number> = WISEDU_SECTION_FALLBACK,
): Promise<{ courses: CourseV2[]; warnings: string[]; periodSchedule: PeriodSchedule }> {
  const warnings: string[] = [];
  const coursesByKey = new Map<string, CourseV2>();
  const seenMeetingIds = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const name = str(row.KCM || row.KCM_DISPLAY);
    const weekday = num(row.SKXQ);
    const rawStart = num(row.KSJC);
    const rawEnd = num(row.JSJC) ?? rawStart;
    if (!name || weekday === null || rawStart === null) continue;
    const startPeriod = sectionMap[rawStart] ?? rawStart;
    const endPeriod = rawEnd !== null ? sectionMap[rawEnd] ?? rawEnd : startPeriod;
    const bitmapWeeks = weeksFromBitmap(str(row.SKZC));
    const parsedWeeks = bitmapWeeks.length > 0 ? bitmapWeeks : parseWeeksDetailed(str(row.ZCMC)).weeks;
    if (parsedWeeks.length === 0) {
      warnings.push(`第 ${index + 1} 行 ${name} 周次为空，已跳过`);
      continue;
    }
    const sourceCourseId = [str(row.KCH), str(row.JXBID), str(row.KXH)].filter(Boolean).join("|") || str(row.KBID) || str(row.WID);
    const courseId = await makeCourseId({
      adapterId: descriptor.id,
      sourceCourseId,
      sourceRef: str(row.KBID || row.WID) || `row:${index + 1}`,
      fallbackOrdinal: index + 1,
    });
    const sourceMeetingId = [str(row.KBID), str(row.WID), str(row.SKZC), str(row.SKXQ), str(row.KSJC), str(row.JSJC)].filter(Boolean).join("|");
    const meetingId = await makeMeetingId({
      courseId,
      sourceMeetingId,
      weekday,
      startPeriod,
      endPeriod,
      weeks: parsedWeeks,
    });
    if (seenMeetingIds.has(meetingId)) continue;
    seenMeetingIds.add(meetingId);
    const meeting: CourseMeeting = {
      id: meetingId,
      teacher: str(row.SKJS),
      room: str(row.JASMC),
      campus: str(row.XXXQDM_DISPLAY || row.XXXQMC),
      weekday,
      startPeriod,
      endPeriod,
      weeks: parsedWeeks,
      weekRule: str(row.ZCMC) || parsedWeeks.join(","),
      startTime: str(row.KSSJ) || undefined,
      endTime: str(row.JSSJ) || undefined,
      source: {
        adapterId: descriptor.id,
        adapterVersion: descriptor.version,
        schoolId: descriptor.schoolId,
        sourceCourseId,
        sourceRef: str(row.KBID || row.WID),
      },
    };
    const existing = coursesByKey.get(courseId);
    if (existing) {
      existing.meetings.push(meeting);
    } else {
      const credits = Number(str(row.XF));
      coursesByKey.set(courseId, {
        id: courseId,
        name,
        category: str(row.KCXZDM_DISPLAY),
        credits: Number.isFinite(credits) && credits > 0 ? credits : undefined,
        teachingClass: str(row.SKBJ),
        source: {
          adapterId: descriptor.id,
          adapterVersion: descriptor.version,
          schoolId: descriptor.schoolId,
          sourceCourseId,
          sourceRef: str(row.KBID || row.WID),
        },
        meetings: [meeting],
      });
    }
  }
  if (rows.length > 0 && coursesByKey.size === 0) {
    throw new Error("已获取教务数据，但没有可解析的课程行；页面结构可能已变化");
  }
  return {
    courses: [...coursesByKey.values()],
    warnings,
    periodSchedule: periodScheduleFromRows(rows, sectionMap, semester.semesterStart),
  };
}

export function createWiseduAdapter(): SISAdapter {
  const descriptor = defaultDescriptor();
  return {
    descriptor,
    async detect(context: ConnectorContext): Promise<DetectionResult> {
      const path = context.url.pathname;
      const evidence: string[] = [];
      if (path.includes("/jwapp/")) evidence.push("/jwapp/ 路径");
      const text = context.document.documentElement?.textContent ?? "";
      if (text.includes("EMAP") || text.includes("jwapp")) evidence.push("EMAP/jwapp 页面特征");
      const confidence = evidence.length >= 2 ? 0.9 : evidence.length === 1 ? 0.68 : 0;
      return {
        detected: confidence > 0,
        adapterId: descriptor.id,
        confidence,
        vendor: "wisedu",
        evidence,
        reason: confidence > 0 ? undefined : "未发现金智 jwapp 特征",
      };
    },
    async extract(context, semester): Promise<ConnectorExtraction> {
      const origin = context.url.origin;
      const warnings: string[] = [];
      let currentUser: CurrentUserResponse = {};
      try {
        currentUser = await fetchJson<CurrentUserResponse>(
          `${origin}/jwapp/sys/homeapp/api/home/currentUser.do`,
          {},
          context.fetchImpl,
        );
      } catch {
        warnings.push("未获取到当前用户信息，将使用用户填写的学期信息");
      }
      const userDatas = currentUser.datas ?? {};
      const welcome = (userDatas.welcomeInfo ?? {}) as Record<string, unknown>;
      const termRaw =
        str(welcome.xnxqdm) ||
        str(welcome.xnxq) ||
        str(userDatas.xnxqdm) ||
        semester.termCode ||
        "unknown";
      const termInfo = parseTermCode(termRaw, semester);
      let sectionMap: Record<number, number> = { ...WISEDU_SECTION_FALLBACK };
      const sectionRows: SectionMapRow[] = [];
      try {
        const sectionResponse = await postFormText<{ datas?: { jcjcx?: { rows?: SectionMapRow[] } } }>(
          `${origin}/jwapp/sys/wdkbby/modules/dzkz/jcjcx.do`,
          "",
          context.fetchImpl,
        );
        sectionRows.push(...(sectionResponse.datas?.jcjcx?.rows ?? []));
        sectionMap = sectionMapFromRows(sectionRows);
      } catch {
        warnings.push("通用金智节次映射接口不可用，使用已知兼容映射与用户确认作息");
      }

      const response = await postForm<JwAppRowsResponse>(
        `${origin}/jwapp/sys/wdkb/modules/xskcb/xskcb.do`,
        { XNXQDM: termRaw },
        context.fetchImpl,
      ).catch(() => ({ datas: {} }));
      const rows = extractRows(response, ["xskcb", "cxxszhxqkb", "cxxskcb"]);
      if (rows.length === 0) {
        throw new Error("教务返回空课表。请确认已登录、已进入学生课表页，并选择正确学期");
      }
      const normalized = await normalizeWiseduRows(rows, descriptor, semester, sectionMap);
      const parsedCount = normalized.courses.reduce((sum, course) => sum + course.meetings.length, 0);
      const draft: ExtractionDraft = {
        descriptor,
        term: {
          termId: termInfo.termId,
          academicYear: termInfo.academicYear,
          termCode: termInfo.termCode,
          termName: termInfo.termName,
          semesterStart: semester.semesterStart,
          teachingWeeks: semester.teachingWeeks ?? 20,
          timezone: semester.timezone ?? "Asia/Shanghai",
          campus: semester.campus,
          periodSchedules: [normalized.periodSchedule],
        },
        courses: normalized.courses,
        overrides: [],
        metadata: {
          method: "api",
          sourceUrl: `${context.url.origin}${context.url.pathname}`,
          rawCount: rows.length,
          parsedCount,
          skippedCount: Math.max(0, rows.length - parsedCount),
          platform: descriptor.vendorLabel,
          userNote: "只读提取；未持久化 Cookie 或 CSRF 参数",
        },
        warnings: [...warnings, ...normalized.warnings],
      };
      return {
        draft,
        rawRows: rows.length,
        parsedRows: parsedCount,
        skippedRows: Math.max(0, rows.length - parsedCount),
        evidence: ["jwapp", "student-timetable", "generic-wisedu"],
      };
    },
    validate(timetable: NormalizedTimetableV2): ValidationReport {
      return validateTimetableV2(timetable);
    },
  };
}
