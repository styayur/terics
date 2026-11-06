import type { AdapterSupportLevel, ConnectorCapability, ExtractionMethod } from "../../v2/types";
import { connectorManifests } from "../registry";

export interface ConnectorRegistryEntry {
  connectorId: string;
  vendor: string;
  vendorLabel: string;
  version: string;
  status: AdapterSupportLevel;
  supportedDomains: string[];
  urlRules: RegExp[];
  supportedPageTypes: string[];
  requiredUserInteraction: "manual-login" | "none";
  extractionMethod: ExtractionMethod[];
  requiredBrowserCapabilities: string[];
  supportedFields: ConnectorCapability[] | string[];
  versionCompatibility: string;
  evidence: string[];
  limitations: string[];
}

const METADATA: Record<string, Omit<ConnectorRegistryEntry, "connectorId" | "vendor" | "vendorLabel" | "version" | "status" | "limitations">> = {
  "whut-wisedu-jwapp": {
    supportedDomains: ["jwxt.whut.edu.cn", "zhlgd.whut.edu.cn"],
    urlRules: [/^https:\/\/jwxt\.whut\.edu\.cn\/jwapp\//i, /^https:\/\/zhlgd\.whut\.edu\.cn\//i],
    supportedPageTypes: ["student-home", "student-timetable"],
    requiredUserInteraction: "manual-login",
    extractionMethod: ["api"],
    requiredBrowserCapabilities: ["activeTab", "scripting", "storage"],
    supportedFields: ["timetable", "semester", "periods", "classroom"],
    versionCompatibility: "Verified for the WHUT 2026-2027-1 student timetable layout",
    evidence: ["42/42 live course blocks matched", "13/13 periods matched", "242 events independently parsed"],
  },
  "zf-jwglxt": {
    supportedDomains: [],
    urlRules: [/\/jwglxt(?:\/|$)/i, /\/kbcx(?:\/|$)/i],
    supportedPageTypes: ["login", "student-timetable"],
    requiredUserInteraction: "manual-login",
    extractionMethod: ["api", "dom"],
    requiredBrowserCapabilities: ["activeTab", "scripting", "storage"],
    supportedFields: ["timetable", "semester", "periods", "classroom"],
    versionCompatibility: "Zhengfang V8/V9 compatible; school variants unverified",
    evidence: ["Synthetic kbList and DOM fixtures"],
  },
  "qiangzhi-dom": {
    supportedDomains: [],
    urlRules: [/\/jsxsd(?:\/|$)/i, /qiangzhi/i],
    supportedPageTypes: ["student-timetable"],
    requiredUserInteraction: "manual-login",
    extractionMethod: ["dom"],
    requiredBrowserCapabilities: ["activeTab", "scripting", "storage"],
    supportedFields: ["timetable", "classroom"],
    versionCompatibility: "Rendered DOM only; vendor variants unverified",
    evidence: ["Public grid fixture"],
  },
  "qingguo-dom": {
    supportedDomains: [],
    urlRules: [/qingguo/i, /\/jwweb(?:\/|$)/i, /\/eams(?:\/|$)/i],
    supportedPageTypes: ["student-timetable", "official-export"],
    requiredUserInteraction: "manual-login",
    extractionMethod: ["dom", "export"],
    requiredBrowserCapabilities: ["activeTab", "scripting", "storage"],
    supportedFields: ["timetable", "classroom"],
    versionCompatibility: "DOM/list/export variants unverified",
    evidence: ["Qingguo-style HTML fixture"],
  },
  "wisedu-jwapp": {
    supportedDomains: [],
    urlRules: [/\/jwapp(?:\/|$)/i],
    supportedPageTypes: ["student-timetable"],
    requiredUserInteraction: "manual-login",
    extractionMethod: ["api", "dom"],
    requiredBrowserCapabilities: ["activeTab", "scripting", "storage"],
    supportedFields: ["timetable", "semester", "periods", "classroom"],
    versionCompatibility: "Generic Wisedu only; does not inherit WHUT verification",
    evidence: ["Synthetic generic Wisedu fixture"],
  },
  "generic-dom": {
    supportedDomains: [],
    urlRules: [],
    supportedPageTypes: ["rendered-timetable"],
    requiredUserInteraction: "manual-login",
    extractionMethod: ["dom"],
    requiredBrowserCapabilities: ["activeTab", "scripting", "storage"],
    supportedFields: ["timetable"],
    versionCompatibility: "Low-confidence fallback for rendered HTML tables",
    evidence: ["DOM structural detection only"],
  },
};

export function connectorRegistryEntries(): ConnectorRegistryEntry[] {
  return connectorManifests().map((descriptor) => {
    const metadata = METADATA[descriptor.id];
    if (!metadata) throw new Error(`Connector registry metadata missing for ${descriptor.id}`);
    return {
      connectorId: descriptor.id,
      vendor: descriptor.vendor,
      vendorLabel: descriptor.vendorLabel,
      version: descriptor.version,
      status: descriptor.status,
      limitations: [...descriptor.limitations],
      supportedDomains: [...metadata.supportedDomains],
      urlRules: metadata.urlRules.map((rule) => new RegExp(rule.source, rule.flags)),
      supportedPageTypes: [...metadata.supportedPageTypes],
      requiredUserInteraction: metadata.requiredUserInteraction,
      extractionMethod: [...metadata.extractionMethod],
      requiredBrowserCapabilities: [...metadata.requiredBrowserCapabilities],
      supportedFields: [...metadata.supportedFields],
      versionCompatibility: metadata.versionCompatibility,
      evidence: [...metadata.evidence],
    };
  });
}

export function connectorRegistryEntry(connectorId: string): ConnectorRegistryEntry | undefined {
  return connectorRegistryEntries().find((entry) => entry.connectorId === connectorId);
}
