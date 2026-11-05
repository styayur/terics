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
    id: "qiangzhi-dom",
    version: "0.5.0",
    vendor: "qiangzhi",
    vendorLabel: "强智教务",
    platformVersion: "DOM generic",
    status: "experimental",
    capabilities: ["timetable", "classroom"],
    verifiedDomains: [],
    methods: ["dom"],
    limitations: [
      "当前版本使用 DOM 表格提取，无法保证获得官方调课数据。",
      "不同强智部署的单元格结构可能不同。",
      "未完成真实学校端到端验收。",
    ],
  };
}

export function createQiangzhiAdapter(): SISAdapter {
  const info = descriptor();
  return {
    descriptor: info,
    async detect(context: ConnectorContext): Promise<DetectionResult> {
      const evidence: string[] = [];
      if (context.url.pathname.includes("/jsxsd/") || context.url.pathname.includes("/quanxue/")) evidence.push("jsxsd/quanxue 路径");
      if (context.document.querySelector("#kbtable, .Nsb_r_list, #kblist")) evidence.push("课表表格元素");
      const text = context.document.documentElement?.textContent ?? "";
      if (text.includes("强智")) evidence.push("强智页面文字");
      const confidence = evidence.length >= 2 ? 0.9 : evidence.length === 1 ? 0.62 : 0;
      return {
        detected: confidence > 0,
        adapterId: info.id,
        confidence,
        vendor: "qiangzhi",
        evidence,
        reason: confidence > 0 ? undefined : "未发现强智教务特征",
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
