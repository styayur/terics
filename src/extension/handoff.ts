import type { NormalizedTimetableV2 } from "../v2/types";
import { inspectTimetableV2 } from "../v2/validate";

export const HANDOFF_PROTOCOL_VERSION = 1 as const;
export const HANDOFF_PROTOCOL_KEY = "terics-handoff";
export const HANDOFF_TTL_MS = 5 * 60 * 1000;
export const HANDOFF_MAX_AGE_MS = 10 * 60 * 1000;
export const HANDOFF_MAX_BYTES = 2 * 1024 * 1024;
export const HANDOFF_STORAGE_KEY = "tericsPendingHandoff";
export const TERICS_WEB_ORIGIN = "https://styayur.github.io";
export const TERICS_WEB_PATH = "/terics/";

export interface HandoffLinkParams {
  protocolVersion: typeof HANDOFF_PROTOCOL_VERSION;
  requestId: string;
  nonce: string;
  extensionId: string;
  targetOrigin: string;
  expiresAt: string;
}

export interface HandoffEnvelope {
  protocolVersion: typeof HANDOFF_PROTOCOL_VERSION;
  requestId: string;
  nonce: string;
  extensionId: string;
  sourceConnectorId: string;
  targetOrigin: string;
  schemaVersion: "2.0";
  createdAt: string;
  expiresAt: string;
  payloadHash: string;
  payloadSize: number;
  payload: NormalizedTimetableV2;
}

export interface PendingHandoffRecord {
  envelope: HandoffEnvelope;
  consumed: boolean;
}

export interface HandoffClaimMessage {
  type: "terics.handoff.claim";
  protocolVersion: typeof HANDOFF_PROTOCOL_VERSION;
  requestId: string;
  nonce: string;
  targetOrigin: string;
}

export type HandoffClaimResponse =
  | { ok: true; envelope: HandoffEnvelope }
  | { ok: false; code: "invalid_request" | "expired" | "replay" | "not_found" | "origin_denied" | "integrity_failed"; error: string };

export async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
}

export function canonicalHandoffJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export async function handoffPayloadIntegrity(payload: NormalizedTimetableV2): Promise<{ json: string; hash: string; size: number }> {
  const json = canonicalHandoffJson(payload);
  const size = new TextEncoder().encode(json).byteLength;
  return { json, hash: await sha256Hex(json), size };
}

export function isExtensionId(value: string): boolean {
  return /^[a-p]{32}$/.test(value);
}

export function isAllowedWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === TERICS_WEB_ORIGIN && url.pathname.startsWith(TERICS_WEB_PATH);
  } catch {
    return false;
  }
}

export async function createPendingHandoff(input: {
  timetable: NormalizedTimetableV2;
  extensionId: string;
  targetOrigin?: string;
  now?: Date;
  requestId?: string;
  nonce?: string;
}): Promise<{ record: PendingHandoffRecord; params: HandoffLinkParams; url: string }> {
  const now = input.now ?? new Date();
  const targetOrigin = input.targetOrigin ?? TERICS_WEB_ORIGIN;
  if (targetOrigin !== TERICS_WEB_ORIGIN) throw new Error("不允许的 Web handoff 目标来源");
  if (!isExtensionId(input.extensionId)) throw new Error("扩展 ID 无效");
  const requestId = input.requestId ?? crypto.randomUUID();
  const nonce = input.nonce ?? `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) throw new Error("handoff requestId 无效");
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(nonce)) throw new Error("handoff nonce 无效");
  const inspected = inspectTimetableV2(input.timetable);
  if (!inspected.valid) throw new Error("课表数据未通过 Schema 校验，不能创建 handoff");
  const expiresAt = new Date(now.getTime() + HANDOFF_TTL_MS).toISOString();
  const integrity = await handoffPayloadIntegrity(input.timetable);
  if (integrity.size > HANDOFF_MAX_BYTES) throw new Error("课表数据超过扩展 handoff 大小限制，请下载 .terics.json");
  const envelope: HandoffEnvelope = {
    protocolVersion: HANDOFF_PROTOCOL_VERSION,
    requestId,
    nonce,
    extensionId: input.extensionId,
    sourceConnectorId: input.timetable.source.adapterId,
    targetOrigin,
    schemaVersion: "2.0",
    createdAt: now.toISOString(),
    expiresAt,
    payloadHash: integrity.hash,
    payloadSize: integrity.size,
    payload: input.timetable,
  };
  const params: HandoffLinkParams = {
    protocolVersion: HANDOFF_PROTOCOL_VERSION,
    requestId,
    nonce,
    extensionId: input.extensionId,
    targetOrigin,
    expiresAt,
  };
  return { record: { envelope, consumed: false }, params, url: buildHandoffUrl(params) };
}

export function buildHandoffUrl(params: HandoffLinkParams): string {
  const query = new URLSearchParams({
    [HANDOFF_PROTOCOL_KEY]: String(params.protocolVersion),
    requestId: params.requestId,
    nonce: params.nonce,
    extensionId: params.extensionId,
    targetOrigin: params.targetOrigin,
    expiresAt: params.expiresAt,
  });
  return `${TERICS_WEB_ORIGIN}${TERICS_WEB_PATH}#${query.toString()}`;
}

export function parseHandoffHash(hash: string): HandoffLinkParams | null {
  const cleaned = hash.replace(/^#/, "");
  const query = new URLSearchParams(cleaned);
  if (query.get(HANDOFF_PROTOCOL_KEY) !== String(HANDOFF_PROTOCOL_VERSION)) return null;
  const requestId = query.get("requestId") ?? "";
  const nonce = query.get("nonce") ?? "";
  const extensionId = query.get("extensionId") ?? "";
  const targetOrigin = query.get("targetOrigin") ?? "";
  const expiresAt = query.get("expiresAt") ?? "";
  if (
    !/^[A-Za-z0-9_-]{16,128}$/.test(requestId) ||
    !/^[A-Za-z0-9_-]{16,256}$/.test(nonce) ||
    !isExtensionId(extensionId) ||
    !targetOrigin ||
    !expiresAt
  ) {
    return null;
  }
  return { protocolVersion: HANDOFF_PROTOCOL_VERSION, requestId, nonce, extensionId, targetOrigin, expiresAt };
}

export function validateHandoffParams(params: HandoffLinkParams, now = new Date()): void {
  if (params.protocolVersion !== HANDOFF_PROTOCOL_VERSION) throw new Error("不支持的扩展 handoff 协议版本");
  if (!isExtensionId(params.extensionId)) throw new Error("扩展 ID 无效");
  if (params.targetOrigin !== TERICS_WEB_ORIGIN) throw new Error("扩展 handoff 目标来源无效");
  const expires = Date.parse(params.expiresAt);
  if (!Number.isFinite(expires)) throw new Error("扩展 handoff 过期时间无效");
  if (expires <= now.getTime()) throw new Error("扩展 handoff 已过期，请重新从扩展打开 Web");
  if (expires > now.getTime() + HANDOFF_MAX_AGE_MS) throw new Error("扩展 handoff 过期时间超出允许范围");
}

export async function validateHandoffEnvelope(
  envelope: HandoffEnvelope,
  params: HandoffLinkParams,
  now = new Date(),
): Promise<void> {
  validateHandoffParams(params, now);
  if (
    envelope.protocolVersion !== HANDOFF_PROTOCOL_VERSION ||
    envelope.requestId !== params.requestId ||
    envelope.nonce !== params.nonce ||
    envelope.extensionId !== params.extensionId ||
    envelope.targetOrigin !== params.targetOrigin ||
    envelope.expiresAt !== params.expiresAt
  ) {
    throw new Error("扩展 handoff 请求标识不一致");
  }
  if (envelope.schemaVersion !== "2.0" || envelope.payload.schemaVersion !== "2.0") {
    throw new Error("扩展 handoff Schema 版本不兼容");
  }
  const inspected = inspectTimetableV2(envelope.payload);
  if (!inspected.valid) throw new Error("扩展 handoff 课表未通过 Schema 校验");
  const created = Date.parse(envelope.createdAt);
  const expires = Date.parse(envelope.expiresAt);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || created > now.getTime() + 60_000) {
    throw new Error("扩展 handoff 创建时间无效");
  }
  if (expires - created > HANDOFF_TTL_MS || now.getTime() - created > HANDOFF_MAX_AGE_MS) {
    throw new Error("扩展 handoff 超出有效时间窗口");
  }
  const integrity = await handoffPayloadIntegrity(envelope.payload);
  if (integrity.size !== envelope.payloadSize || integrity.size > HANDOFF_MAX_BYTES) {
    throw new Error(`扩展 handoff 大小校验失败（${integrity.size}/${envelope.payloadSize} bytes）`);
  }
  if (integrity.hash !== envelope.payloadHash) {
    throw new Error(`扩展 handoff 完整性校验失败（${integrity.hash.slice(0, 12)}/${envelope.payloadHash.slice(0, 12)}）`);
  }
}
