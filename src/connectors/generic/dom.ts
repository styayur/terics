import { parseHtml } from "../../core/parsers/html";
import { DEFAULT_PERIODS } from "../../core/types";
import { rawCoursesToV2, } from "../../v2/convert";
import type {
  ConnectorDescriptor,
  ConnectorExtraction,
  ConnectorContext,
  ExtractionDraft,
  SemesterSelection,
} from "../../v2/types";

export async function extractDomTimetable(
  context: ConnectorContext,
  semester: SemesterSelection,
  descriptor: ConnectorDescriptor,
): Promise<ConnectorExtraction> {
  const html = context.document.documentElement?.outerHTML ?? "";
  const parsed = parseHtml(html, context.url.hostname);
  const normalized = await rawCoursesToV2(parsed, {
    sourceKind: "web",
    adapterId: descriptor.id,
    adapterVersion: descriptor.version,
    schoolId: descriptor.schoolId,
    schoolName: descriptor.schoolName,
    sourceUrl: `${context.url.origin}${context.url.pathname}`,
    title: semester.termName,
    semesterStart: semester.semesterStart,
    periods: DEFAULT_PERIODS,
    teachingWeeks: semester.teachingWeeks,
    timezone: semester.timezone,
  });
  normalized.source.adapterId = descriptor.id;
  normalized.source.adapterVersion = descriptor.version;
  normalized.source.platform = descriptor.vendorLabel;
  normalized.source.schoolId = descriptor.schoolId;
  normalized.source.schoolName = descriptor.schoolName;
  normalized.metadata.method = "dom";
  normalized.metadata.adapterId = descriptor.id;
  normalized.metadata.adapterVersion = descriptor.version;
  normalized.metadata.platform = descriptor.vendorLabel;
  normalized.metadata.schoolId = descriptor.schoolId;
  normalized.metadata.schoolName = descriptor.schoolName;
  const draft: ExtractionDraft = {
    descriptor,
    term: {
      ...normalized.term,
      academicYear: semester.academicYear ?? normalized.term.academicYear,
      termCode: semester.termCode ?? normalized.term.termCode,
      termName: semester.termName,
    },
    courses: normalized.courses,
    overrides: normalized.overrides,
    metadata: {
      method: "dom",
      sourceUrl: normalized.source.sourceUrl,
      rawCount: normalized.metadata.rawCount,
      parsedCount: normalized.metadata.parsedCount,
      skippedCount: normalized.metadata.skippedCount,
      schoolId: descriptor.schoolId,
      schoolName: descriptor.schoolName,
      platform: descriptor.vendorLabel,
      userNote: "DOM 回退提取；未执行页面脚本，未上传页面内容",
    },
    warnings: [
      "DOM 回退无法保证获得官方调课/停课数据，请在教务页面核对后再导出。",
      ...parsed.issues.filter((issue) => issue.severity !== "info").map((issue) => issue.message),
    ],
  };
  return {
    draft,
    rawRows: normalized.metadata.rawCount,
    parsedRows: normalized.metadata.parsedCount,
    skippedRows: normalized.metadata.skippedCount,
    evidence: ["dom-table", descriptor.id],
  };
}
