import { validatePortalUrl, type SchoolResolution } from "./url-validator";
import { listSchoolEntries } from "./schools";

import { connectorRegistryEntries } from "./connector-registry";

export function resolveSchoolUrl(raw: string): SchoolResolution {
  const validated = validatePortalUrl(raw);
  const host = validated.normalizedHost;
  const warnings = [...validated.warnings];
  const school = listSchoolEntries().find((entry) => entry.domains.some((domain) => host === domain.toLowerCase().replace(/\.$/, "")));
  if (school) {
    const isUnifiedAuth = /zhlgd/i.test(host);
    if (isUnifiedAuth) {
      warnings.push("该地址是学校统一认证入口；登录完成后请返回教务系统 jwapp 页面再点击 terics 扩展");
    }
    return {
      inputUrl: validated.original,
      normalizedUrl: validated.normalizedUrl,
      normalizedHost: host,
      schoolId: school.id,
      schoolName: school.name,
      vendor: school.vendor,
      connectorId: school.connectorId,
      vendorLabel: school.vendorLabel,
      confidence: isUnifiedAuth ? 0.91 : 0.99,
      status: school.status === "verified" ? "verified" : school.status === "experimental" ? "experimental" : "unknown",
      evidence: [
        ...school.domains.filter((domain) => host === domain.toLowerCase().replace(/\.$/, "")).map((domain) => `精确域名匹配 ${domain}`),
        school.platformVersion,
        school.versionCompatibility,
      ],
      warnings,
      nextAction: isUnifiedAuth
        ? "完成学校登录后打开 WHUT 学生课表，再点击 terics 扩展提取课表"
        : "打开网址并手动登录，进入学生课表后点击 terics 扩展提取课表",
      requiresLogin: true,
      requiresExtension: true,
      manualFallback: true,
    };
  }

  const vendor = connectorRegistryEntries().find(
    (entry) => entry.connectorId !== "generic-dom" && entry.urlRules.some((rule) => rule.test(validated.normalizedUrl)),
  );
  if (vendor) {
    const confidence =
      vendor.connectorId === "zf-jwglxt"
        ? 0.72
        : vendor.connectorId === "wisedu-jwapp"
          ? 0.66
          : vendor.connectorId === "qiangzhi-dom"
            ? 0.62
            : 0.55;
    return {
      inputUrl: validated.original,
      normalizedUrl: validated.normalizedUrl,
      normalizedHost: host,
      vendor: vendor.vendor,
      connectorId: vendor.connectorId,
      vendorLabel: vendor.vendorLabel,
      confidence,
      status: vendor.status === "verified" ? "verified" : "experimental",
      evidence: [`Connector Registry URL rule matched ${vendor.connectorId}`, ...vendor.evidence],
      warnings: [...warnings, "仅识别到系统供应商特征，未验证该学校的页面、接口或字段兼容性"],
      nextAction: "在已登录页面尝试 Experimental Connector；若失败，请使用官方课表导出或文件导入",
      requiresLogin: vendor.requiredUserInteraction === "manual-login",
      requiresExtension: true,
      manualFallback: true,
    };
  }

  return {
    inputUrl: validated.original,
    normalizedUrl: validated.normalizedUrl,
    normalizedHost: host,
    confidence: 0.15,
    status: "unknown",
    evidence: ["未匹配已登记学校域名或已确认的供应商 URL 指纹"],
    warnings: [...warnings, "terics 不会对未知网址发起自动抓取，也不会猜测教务接口"],
    nextAction: "使用已登录页面的 Generic DOM 提取，或下载学校课表文件后导入",
    requiresLogin: true,
    requiresExtension: true,
    manualFallback: true,
  };
}
