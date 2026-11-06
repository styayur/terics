import { Window } from "happy-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { extractDroppedUrl } from "../../src/connectors/resolver/drop";
import { resolveSchoolUrl } from "../../src/connectors/resolver/resolver";
import {
  PortalUrlValidationError,
  hostMatchesDomain,
  validatePortalUrl,
} from "../../src/connectors/resolver/url-validator";

beforeEach(() => {
  const window = new Window();
  (globalThis as Record<string, unknown>).DOMParser = window.DOMParser;
});

describe("portal URL validator", () => {
  it("accepts HTTP(S), normalizes IDN and strips fragments", () => {
    const result = validatePortalUrl("https://例子.测试:8443/path?x=1#secret");
    expect(result.normalizedHost).toBe("xn--fsqu00a.xn--0zwm56d");
    expect(result.normalizedUrl).not.toContain("#secret");
    expect(result.warnings.some((warning) => warning.includes("非默认端口"))).toBe(true);
  });

  it.each([
    ["javascript:alert(1)", "unsupported_scheme"],
    ["data:text/html,hello", "unsupported_scheme"],
    ["file:///etc/passwd", "unsupported_scheme"],
    ["chrome-extension://abc/popup.html", "unsupported_scheme"],
    ["https://user:pass@example.edu.cn/", "credentials_not_allowed"],
    ["http://localhost:8080/", "localhost_blocked"],
    ["http://127.0.0.1/", "private_network_blocked"],
    ["http://10.1.2.3/", "private_network_blocked"],
    ["http://192.168.1.1/", "private_network_blocked"],
    ["http://[::1]/", "private_network_blocked"],
  ])("rejects unsafe URL %s", (input, code) => {
    expect(() => validatePortalUrl(input)).toThrowError(PortalUrlValidationError);
    try {
      validatePortalUrl(input);
    } catch (error) {
      expect((error as PortalUrlValidationError).code).toBe(code);
    }
  });

  it("uses domain boundary matching rather than substring matching", () => {
    expect(hostMatchesDomain("jwxt.whut.edu.cn", "whut.edu.cn")).toBe(true);
    expect(hostMatchesDomain("jwxt.whut.edu.cn.evil.example", "whut.edu.cn")).toBe(false);
    expect(hostMatchesDomain("notwhut.edu.cn", "whut.edu.cn")).toBe(false);
  });

  it("warns about external redirect parameters without following them", () => {
    const result = validatePortalUrl("https://jw.example.edu.cn/login?next=https://evil.example/steal");
    expect(result.normalizedHost).toBe("jw.example.edu.cn");
    expect(result.warnings.join(" ")).toContain("不会自动跟随");
  });
});

describe("school resolver", () => {
  it("resolves exact WHUT jwapp domains to the verified school adapter", () => {
    const result = resolveSchoolUrl("https://jwxt.whut.edu.cn/jwapp/sys/homeapp/index.do?forceCas=1#x");
    expect(result).toMatchObject({
      schoolId: "whut",
      schoolName: "武汉理工大学",
      connectorId: "whut-wisedu-jwapp",
      status: "verified",
      confidence: 0.99,
    });
    expect(result.evidence.join(" ")).toContain("精确域名匹配");
    expect(result.nextAction).toContain("手动登录");
  });

  it("does not trust lookalike or arbitrary WHUT subdomains", () => {
    for (const host of ["jwxt.whut.edu.cn.evil.example", "evil.jwxt.whut.edu.cn", "notwhut.edu.cn"]) {
      const result = resolveSchoolUrl(`https://${host}/jwapp/sys/homeapp/index.do`);
      expect(result.schoolId).toBeUndefined();
      expect(result.connectorId).toBe("wisedu-jwapp");
      expect(result.status).toBe("experimental");
    }
  });

  it("identifies vendor paths without promoting them to a verified school", () => {
    const zf = resolveSchoolUrl("https://jw.example.edu.cn/jwglxt/xtgl/login_slogin.html");
    expect(zf).toMatchObject({ connectorId: "zf-jwglxt", status: "experimental" });
    expect(zf.schoolId).toBeUndefined();
    const wisedu = resolveSchoolUrl("https://example.edu.cn/jwapp/sys/homeapp/index.do");
    expect(wisedu).toMatchObject({ connectorId: "wisedu-jwapp", status: "experimental" });
    expect(wisedu.warnings.join(" ")).toContain("未验证");
  });

  it("returns an explicit unknown fallback instead of guessing endpoints", () => {
    const result = resolveSchoolUrl("https://portal.example.edu.cn/student");
    expect(result.status).toBe("unknown");
    expect(result.confidence).toBeLessThan(0.3);
    expect(result.manualFallback).toBe(true);
    expect(result.nextAction).toContain("Generic DOM");
    expect(result.warnings.join(" ")).toContain("不会对未知网址发起自动抓取");
  });
});

describe("URL drag payload parser", () => {
  it("reads uri-list first, then plain text and sanitized HTML anchors", () => {
    expect(extractDroppedUrl({ uriList: "# comment\nhttps://jwxt.whut.edu.cn/path\nhttps://other" })).toBe(
      "https://jwxt.whut.edu.cn/path",
    );
    expect(extractDroppedUrl({ plainText: "打开 https://example.edu.cn/jwapp/ 页面" })).toBe(
      "https://example.edu.cn/jwapp/",
    );
    expect(
      extractDroppedUrl({
        html: '<img src=x onerror="alert(1)"><a href="https://example.edu.cn/jwglxt/">portal</a>',
      }),
    ).toBe("https://example.edu.cn/jwglxt/");
    expect(extractDroppedUrl({ plainText: "javascript:alert(1)" })).toBeNull();
  });
});
