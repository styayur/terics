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
import { extractDomTimetable } from "./dom";

function descriptor(): ConnectorDescriptor {
  return {
    id: "generic-dom",
    version: "0.5.0",
    vendor: "generic",
    vendorLabel: "通用 HTML 表格",
    status: "experimental",
    capabilities: ["timetable"],
    verifiedDomains: [],
    methods: ["dom"],
    limitations: [
      "仅在用户主动点击提取时运行。",
      "不保证获得调课、校历、学分或课程性质。",
      "格式复杂时请使用文件导出并导入 Web/Python。",
    ],
  };
}

export function createGenericDomAdapter(): SISAdapter {
  const info = descriptor();
  return {
    descriptor: info,
    async detect(context: ConnectorContext): Promise<DetectionResult> {
      const tables = context.document.querySelectorAll("table").length;
      const text = context.document.documentElement?.textContent ?? "";
      const evidence = tables > 0 && (text.includes("星期一") || text.includes("周一")) ? ["HTML 星期表头"] : [];
      return {
        detected: evidence.length > 0,
        adapterId: info.id,
        confidence: evidence.length > 0 ? 0.45 : 0,
        vendor: "generic",
        evidence,
        reason: evidence.length > 0 ? undefined : "当前页面没有可识别的课表表格",
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
