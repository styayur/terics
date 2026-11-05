import { DEFAULT_PERIODS } from "../../core/types";
import { parsePeriodRange, parseWeeksDetailed } from "../../core/weeks";
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
  SemesterSelection,
  SISAdapter,
  ValidationReport,
} from "../../v2/types";
import { validateTimetableV2 } from "../../v2/validate";
import { extractDomTimetable } from "../generic/dom";
import { postForm } from "../sdk/http";

interface ZfResponse {
  kbList?: ZfRow[];
  sjkList?: ZfRow[];
  xqjmc?: string;
  [key: string]: unknown;
}

export interface ZfRow {
  kcmc?: string;
  kch?: string;
  jxbmc?: string;
  kcb?: string;
  xm?: string;
  jsxm?: string;
  cdmc?: string;
  cd_id?: string;
  xqj?: number | string;
  jcs?: string;
  jc?: string;
  zcd?: string;
  xqmc?: string;
  xf?: number | string;
  kcxzmc?: string;
  kclbmc?: string;
  [key: string]: unknown;
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function zfDescriptor(): ConnectorDescriptor {
  return {
    id: "zf-jwglxt",
    version: "0.5.0",
    vendor: "zf",
    vendorLabel: "正方教务 JWGLXT",
    platformVersion: "V8/V9 compatible",
    status: "experimental",
    capabilities: ["timetable", "semester", "periods", "classroom"],
    verifiedDomains: [],
    methods: ["api", "dom"],
    limitations: [
      "不同学校的新版正方页面、字段与学期代码存在差异。",
      "学期开始日期与节次时间通常需要用户确认。",
      "未完成真实学校端到端验收。",
    ],
  };
}

function parseTermSelectors(context: ConnectorContext, semester: SemesterSelection): { xnm: string; xqm: string; termName: string } {
  const xnmElement = context.document.querySelector<HTMLInputElement | HTMLSelectElement>("#xnm, [name='xnm']");
  const xqmElement = context.document.querySelector<HTMLInputElement | HTMLSelectElement>("#xqm, [name='xqm']");
  const xnm = xnmElement?.value?.trim() || (semester.academicYear?.split("-")[0] ?? semester.semesterStart.slice(0, 4));
  let xqm = xqmElement?.value?.trim() || semester.termCode || "3";
  if (xqm === "1") xqm = "3";
  if (xqm === "2") xqm = "12";
  return { xnm, xqm, termName: semester.termName };
}

export async function normalizeZfRows(
  rows: ZfRow[],
  descriptor: ConnectorDescriptor,
): Promise<{ courses: CourseV2[]; warnings: string[]; skipped: number }> {
  const coursesByKey = new Map<string, CourseV2>();
  const warnings: string[] = [];
  let skipped = 0;
  for (const [index, row] of rows.entries()) {
    const name = str(row.kcmc);
    const weekday = Number(str(row.xqj));
    const jcsRaw = str(row.jcs || row.jc);
    const zcd = str(row.zcd);
    const period = parsePeriodRange(jcsRaw);
    const weekResult = parseWeeksDetailed(zcd);
    if (!name || !Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !period || weekResult.weeks.length === 0) {
      skipped += 1;
      warnings.push(`正方第 ${index + 1} 行字段不完整，已跳过`);
      continue;
    }
    const sourceCourseId = [str(row.kch), str(row.jxbmc), str(row.kcb)].filter(Boolean).join("|") || `row:${index + 1}`;
    const courseId = await makeCourseId({
      adapterId: descriptor.id,
      sourceCourseId,
      sourceRef: `row:${index + 1}`,
      fallbackOrdinal: index + 1,
    });
    const sourceMeetingId = [str(row.kch), str(row.jxbmc), str(row.xqj), str(row.jcs || row.jc), zcd].join("|");
    const meetingId = await makeMeetingId({
      courseId,
      sourceMeetingId,
      weekday,
      startPeriod: period.start,
      endPeriod: period.end,
      weeks: weekResult.weeks,
    });
    const meeting: CourseMeeting = {
      id: meetingId,
      teacher: str(row.xm || row.jsxm),
      room: str(row.cdmc || row.cd_id),
      campus: str(row.xqmc),
      weekday,
      startPeriod: period.start,
      endPeriod: period.end,
      weeks: weekResult.weeks,
      weekRule: zcd,
      source: {
        adapterId: descriptor.id,
        adapterVersion: descriptor.version,
        sourceCourseId,
        sourceRef: `row:${index + 1}`,
      },
    };
    const existing = coursesByKey.get(courseId);
    if (existing) {
      existing.meetings.push(meeting);
    } else {
      const credits = Number(str(row.xf));
      coursesByKey.set(courseId, {
        id: courseId,
        name,
        category: str(row.kcxzmc || row.kclbmc),
        credits: Number.isFinite(credits) && credits > 0 ? credits : undefined,
        teachingClass: str(row.jxbmc),
        source: {
          adapterId: descriptor.id,
          adapterVersion: descriptor.version,
          sourceCourseId,
          sourceRef: `row:${index + 1}`,
        },
        meetings: [meeting],
      });
    }
  }
  return { courses: [...coursesByKey.values()], warnings, skipped };
}

export function createZfAdapter(): SISAdapter {
  const descriptor = zfDescriptor();
  return {
    descriptor,
    async detect(context: ConnectorContext): Promise<DetectionResult> {
      const evidence: string[] = [];
      if (context.url.pathname.includes("/jwglxt/") || context.url.pathname.includes("/kbcx/")) evidence.push("jwglxt/kbcx 路径");
      const text = context.document.documentElement?.textContent ?? "";
      if (text.includes("正方") || /zftal|jwglxt/i.test(context.document.documentElement?.innerHTML ?? "")) evidence.push("正方页面特征");
      const confidence = evidence.length >= 2 ? 0.92 : evidence.length === 1 ? 0.68 : 0;
      return {
        detected: confidence > 0,
        adapterId: descriptor.id,
        confidence,
        vendor: "zf",
        evidence,
        reason: confidence > 0 ? undefined : "未发现正方教务特征",
      };
    },
    async extract(context, semester): Promise<ConnectorExtraction> {
      const term = parseTermSelectors(context, semester);
      const endpoints = [
        `${context.url.origin}/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N253508`,
        `${context.url.origin}/jwglxt/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151`,
      ];
      let response: ZfResponse | null = null;
      for (const endpoint of endpoints) {
        try {
          response = await postForm<ZfResponse>(
            endpoint,
            { xnm: term.xnm, xqm: term.xqm, kzlx: "ck" },
            context.fetchImpl,
          );
          if (Array.isArray(response.kbList) && response.kbList.length > 0) break;
        } catch {
          // Try the next known read-only layout before falling back to DOM.
        }
      }
      const rows = [...(response?.kbList ?? []), ...(response?.sjkList ?? [])];
      if (rows.length > 0) {
        const normalized = await normalizeZfRows(rows, descriptor);
        if (normalized.courses.length === 0) {
          throw new Error("正方接口返回了数据，但没有可解析的课程；字段结构可能已变化");
        }
        const parsedCount = normalized.courses.reduce((sum, course) => sum + course.meetings.length, 0);
        const draft: ExtractionDraft = {
          descriptor,
          term: {
            termId: `${term.xnm}-${term.xqm}`,
            academicYear: semester.academicYear ?? `${term.xnm}-${Number(term.xnm) + 1}`,
            termCode: term.xqm,
            termName: term.termName,
            semesterStart: semester.semesterStart,
            teachingWeeks: semester.teachingWeeks ?? Math.max(1, ...rows.flatMap((row) => parseWeeksDetailed(str(row.zcd)).weeks)),
            timezone: semester.timezone ?? "Asia/Shanghai",
            campus: semester.campus,
            periodSchedules: [
              {
                id: `zf-periods-${semester.semesterStart}`,
                label: "正方默认/用户确认作息",
                effectiveFrom: semester.semesterStart,
                periods: DEFAULT_PERIODS.map((period) => ({ ...period })),
              },
            ],
          },
          courses: normalized.courses,
          overrides: [],
          metadata: {
            method: "api",
            sourceUrl: `${context.url.origin}/jwglxt/kbcx/`,
            rawCount: rows.length,
            parsedCount,
            skippedCount: normalized.skipped,
            platform: descriptor.vendorLabel,
            userNote: "仅调用正方只读课表查询接口",
          },
          warnings: normalized.warnings,
        };
        return {
          draft,
          rawRows: rows.length,
          parsedRows: parsedCount,
          skippedRows: normalized.skipped,
          evidence: ["zf-jwglxt", "kbList/sjkList"],
        };
      }
      const fallback = await extractDomTimetable(context, semester, descriptor);
      fallback.draft.warnings.unshift("正方结构化接口不可用，已回退 DOM；调课与学期信息可能不完整");
      return fallback;
    },
    validate(timetable: NormalizedTimetableV2): ValidationReport {
      return validateTimetableV2(timetable);
    },
  };
}
