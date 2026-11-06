import {
  HANDOFF_MAX_BYTES,
  parseHandoffHash,
  validateHandoffEnvelope,
  validateHandoffParams,
  type HandoffClaimMessage,
  type HandoffClaimResponse,
} from "./handoff";
import type { NormalizedTimetableV2 } from "../v2/types";

interface RuntimeWithMessage {
  sendMessage(extensionId: string, message: HandoffClaimMessage, callback: (response: unknown) => void): void;
  lastError?: { message?: string };
}

export interface ClaimDependencies {
  hash: string;
  href: string;
  runtime?: RuntimeWithMessage;
  session?: Pick<Storage, "getItem" | "setItem">;
  now?: Date;
}

const USED_HANDOFFS_KEY = "terics.handoff.used.v1";

function runtimeFromPage(): RuntimeWithMessage | undefined {
  return (globalThis as unknown as { chrome?: { runtime?: RuntimeWithMessage } }).chrome?.runtime;
}

export async function claimHandoffFromLocation(deps: ClaimDependencies): Promise<NormalizedTimetableV2 | null> {
  const params = parseHandoffHash(deps.hash);
  if (!params) return null;
  validateHandoffParams(params, deps.now ?? new Date());
  const runtime = deps.runtime ?? runtimeFromPage();
  if (!runtime?.sendMessage) {
    throw new Error("未检测到 terics 扩展。请先安装扩展，或下载 .terics.json 后导入");
  }
  const session = deps.session ?? window.sessionStorage;
  let storedReplayKeys: string[] = [];
  try {
    const parsed = JSON.parse(session.getItem(USED_HANDOFFS_KEY) ?? "[]") as unknown;
    if (Array.isArray(parsed)) storedReplayKeys = parsed.filter((value): value is string => typeof value === "string");
  } catch {
    storedReplayKeys = [];
  }
  const used = new Set<string>(storedReplayKeys);
  const replayKey = `${params.extensionId}:${params.requestId}:${params.nonce}`;
  if (used.has(replayKey)) throw new Error("该扩展 handoff 已在当前标签页使用，已拒绝重放");

  const response = await new Promise<HandoffClaimResponse>((resolve, reject) => {
    runtime.sendMessage(
      params.extensionId,
      {
        type: "terics.handoff.claim",
        protocolVersion: params.protocolVersion,
        requestId: params.requestId,
        nonce: params.nonce,
        targetOrigin: params.targetOrigin,
      },
      (value) => {
        if (runtime.lastError?.message) {
          reject(new Error(`无法连接 terics 扩展：${runtime.lastError.message}`));
          return;
        }
        resolve(value as HandoffClaimResponse);
      },
    );
  });
  if (!response || typeof response !== "object" || !("ok" in response)) throw new Error("扩展 handoff 返回格式无效");
  if (!response.ok) throw new Error(response.error || "扩展 handoff 领取失败");
  await validateHandoffEnvelope(response.envelope, params, deps.now ?? new Date());
  const envelopeSize = new TextEncoder().encode(JSON.stringify(response.envelope.payload)).byteLength;
  if (envelopeSize > HANDOFF_MAX_BYTES) throw new Error("扩展 handoff 数据超过大小限制");
  used.add(replayKey);
  session.setItem(USED_HANDOFFS_KEY, JSON.stringify([...used].slice(-20)));
  const current = new URL(deps.href);
  history.replaceState(null, "", `${current.pathname}${current.search}`);
  return response.envelope.payload;
}
