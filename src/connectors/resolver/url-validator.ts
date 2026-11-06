export type ResolutionStatus = "verified" | "experimental" | "unknown" | "unsupported";

export interface SchoolResolution {
  inputUrl: string;
  normalizedUrl: string;
  normalizedHost: string;
  schoolId?: string;
  schoolName?: string;
  vendor?: string;
  connectorId?: string;
  vendorLabel?: string;
  confidence: number;
  status: ResolutionStatus;
  evidence: string[];
  warnings: string[];
  nextAction: string;
  requiresLogin: boolean;
  requiresExtension: boolean;
  manualFallback: boolean;
}

export type UrlValidationCode =
  | "empty"
  | "invalid_url"
  | "unsupported_scheme"
  | "credentials_not_allowed"
  | "private_network_blocked"
  | "localhost_blocked"
  | "invalid_port";

export class PortalUrlValidationError extends Error {
  readonly code: UrlValidationCode;

  constructor(code: UrlValidationCode, message: string) {
    super(message);
    this.name = "PortalUrlValidationError";
    this.code = code;
  }
}

export interface ValidatedPortalUrl {
  original: string;
  url: URL;
  normalizedUrl: string;
  normalizedHost: string;
  warnings: string[];
}

const REDIRECT_PARAMS = /^(url|redirect|redirect_uri|continue|next|target|return|returnurl)$/i;

function normalizedHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function ipv4Parts(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const values = parts.map(Number);
  return values.every((value) => value >= 0 && value <= 255) ? values : null;
}

function isPrivateIpv4(host: string): boolean {
  const parts = ipv4Parts(host);
  if (!parts) return false;
  const a = parts[0]!;
  const b = parts[1]!;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(host: string): boolean {
  const value = host.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    value === "::1" ||
    value === "::" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("ff") ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.")
  );
}

function hostIsLocalOrPrivate(host: string): boolean {
  const value = normalizedHost(host).replace(/^\[|\]$/g, "");
  return (
    value === "localhost" ||
    value.endsWith(".localhost") ||
    value.endsWith(".local") ||
    isPrivateIpv4(value) ||
    isPrivateIpv6(value)
  );
}

export function hostMatchesDomain(host: string, domain: string): boolean {
  const normalized = normalizedHost(host).replace(/^\[|\]$/g, "");
  const expected = normalizedHost(domain).replace(/^\[|\]$/g, "");
  return normalized === expected || normalized.endsWith(`.${expected}`);
}

export function validatePortalUrl(raw: string): ValidatedPortalUrl {
  const original = raw.trim();
  if (!original) throw new PortalUrlValidationError("empty", "请输入教务系统网址");
  let url: URL;
  try {
    url = new URL(original);
  } catch {
    throw new PortalUrlValidationError("invalid_url", "网址格式无效，请包含 http:// 或 https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PortalUrlValidationError("unsupported_scheme", "仅允许 HTTP 或 HTTPS 教务系统网址");
  }
  if (url.username || url.password) {
    throw new PortalUrlValidationError("credentials_not_allowed", "网址不能包含用户名或密码");
  }
  const host = normalizedHost(url.hostname);
  if (!host) throw new PortalUrlValidationError("invalid_url", "网址缺少有效主机名");
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new PortalUrlValidationError("localhost_blocked", "不允许 localhost 或本地主机地址");
  }
  if (hostIsLocalOrPrivate(host)) {
    throw new PortalUrlValidationError("private_network_blocked", "不允许 localhost、私有网络或保留 IP 地址");
  }
  if (url.port && (!/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535)) {
    throw new PortalUrlValidationError("invalid_port", "网址端口无效");
  }

  url.hostname = host;
  url.hash = "";
  const warnings: string[] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (!REDIRECT_PARAMS.test(key)) continue;
    try {
      const target = new URL(value, url);
      if (target.hostname && normalizedHost(target.hostname) !== host) {
        warnings.push(`参数 ${key} 指向其他主机；terics 不会自动跟随该重定向`);
      }
    } catch {
      // Non-URL redirect-like parameters are harmless for local resolution.
    }
  }
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    warnings.push(`使用非默认端口 ${url.port}，请确认网址来源可信`);
  }
  return {
    original,
    url,
    normalizedUrl: url.toString(),
    normalizedHost: host,
    warnings,
  };
}
