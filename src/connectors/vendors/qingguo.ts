import type {
  ConnectorDescriptor,
  ConnectorExtraction,
  ConnectorContext,
  DetectionResult,
  NormalizedTimetableV2,
  SISAdapter,
  ValidationReport,
} from "../../v2/types";
import { validateTimetableV2 } from "../../v2/validate";
import { extractDomTimetable } from "../generic/dom";

function descriptor(): ConnectorDescriptor {
  return {
    id: "qingguo-dom",
    version: "0.5.0",
    vendor: "qingguo",
    vendorLabel: "青果教务",
    platformVersion: "DOM list/grid",
    status: "experimental",
    capabilities: ["timetable", "classroom"],
    verifiedDomains: [],
    methods: ["dom", "export"],
    limitations: [
      "当前版本优先解析已渲染表格或官方导出 HTML。",
      "调课、停课与校历信息可能不可获得。",
      "未完成真实学校端到端验收。",
    ],
  };
}

export function createQingguoAdapter(): SISAdapter {
  const info = descriptor();
  return {
    descriptor: info,
    async detect(context: ConnectorContext): Promise<DetectionResult> {
      const evidence: string[] = [];
      const text = context.document.documentElement?.textContent ?? "";
      if (text.includes("青果")) evidence.push("青果页面文字");
      if (text.includes("上课时间地点")) evidence.push("青果列表字段");
      const tables = context.document.querySelectorAll("table").length;
      if (tables > 0 && (text.includes("周次") || text.includes("节次"))) evidence.push("课表表格结构");
      const confidence = evidence.length >= 2 ? 0.88 : evidence.length === 1 ? 0.6 : 0;
      return {
        detected: confidence > 0,
        adapterId: info.id,
        confidence,
        vendor: "qingguo",
        evidence,
        reason: confidence > 0 ? undefined : "未发现青果教务特征",
      };
    },
    async extract(context, semester): Promise<ConnectorExtraction> {
      return extractDomTimetable(context, semester, info);
    },
    validate(timetable: NormalizedTimetableV2): ValidationReport {
      return validateTimetableV2(timetable);
    },
  };
}
