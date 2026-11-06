import {
  HANDOFF_PROTOCOL_VERSION,
  HANDOFF_STORAGE_KEY,
  isAllowedWebUrl,
  validateHandoffEnvelope,
  type HandoffClaimMessage,
  type HandoffClaimResponse,
  type PendingHandoffRecord,
} from "./handoff";

export interface HandoffStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ExternalSender {
  origin?: string;
  url?: string;
  id?: string;
}

const claimsInFlight = new Set<string>();

export async function handleExternalHandoffClaim(
  message: unknown,
  sender: ExternalSender,
  storage: HandoffStorage,
  now = new Date(),
  expectedExtensionId?: string,
): Promise<HandoffClaimResponse> {
  if (!isAllowedWebUrl(sender.url ?? "") || sender.origin !== "https://styayur.github.io") {
    return { ok: false, code: "origin_denied", error: "只有 terics GitHub Pages 可以领取扩展数据" };
  }
  const input = message as Partial<HandoffClaimMessage> | null;
  if (
    !input ||
    input.type !== "terics.handoff.claim" ||
    input.protocolVersion !== HANDOFF_PROTOCOL_VERSION ||
    !input.requestId ||
    !input.nonce ||
    input.targetOrigin !== "https://styayur.github.io"
  ) {
    return { ok: false, code: "invalid_request", error: "扩展 handoff 请求格式无效" };
  }
  if (claimsInFlight.has(input.requestId)) {
    return { ok: false, code: "replay", error: "扩展 handoff 请求正在处理中" };
  }
  claimsInFlight.add(input.requestId);
  try {
    const stored = await storage.get(HANDOFF_STORAGE_KEY);
    const record = stored[HANDOFF_STORAGE_KEY] as PendingHandoffRecord | undefined;
    if (!record?.envelope) return { ok: false, code: "not_found", error: "没有可领取的扩展课表，请重新从扩展打开 Web" };
    const envelope = record.envelope;
    if (expectedExtensionId && envelope.extensionId !== expectedExtensionId) {
      return { ok: false, code: "invalid_request", error: "扩展 handoff 来源与目标扩展不一致" };
    }
    if (record.consumed) return { ok: false, code: "replay", error: "该扩展 handoff 已被使用，请重新从扩展打开 Web" };
    if (envelope.requestId !== input.requestId || envelope.nonce !== input.nonce) {
      return { ok: false, code: "invalid_request", error: "扩展 handoff 请求标识不匹配" };
    }
    const expires = Date.parse(envelope.expiresAt);
    if (!Number.isFinite(expires) || expires <= now.getTime()) {
      await storage.remove(HANDOFF_STORAGE_KEY);
      return { ok: false, code: "expired", error: "扩展 handoff 已过期，请重新从扩展打开 Web" };
    }
    try {
      await validateHandoffEnvelope(envelope, {
        protocolVersion: HANDOFF_PROTOCOL_VERSION,
        requestId: input.requestId,
        nonce: input.nonce,
        extensionId: envelope.extensionId,
        targetOrigin: envelope.targetOrigin,
        expiresAt: envelope.expiresAt,
      }, now);
    } catch (error) {
      return { ok: false, code: "integrity_failed", error: error instanceof Error ? error.message : String(error) };
    }
    await storage.set({ [HANDOFF_STORAGE_KEY]: { ...record, consumed: true } });
    return { ok: true, envelope };
  } finally {
    claimsInFlight.delete(input.requestId);
  }
}

export const chromeHandoffStorage: HandoffStorage = {
  get: async (key) => chrome.storage.local.get(key),
  set: async (items) => chrome.storage.local.set(items),
  remove: async (key) => chrome.storage.local.remove(key),
};
