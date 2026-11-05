import { TericsParseError } from "../core/errors";
import type { NormalizedTimetableV2 } from "./types";
import { inspectTimetableV2 } from "./validate";

export function serializeTericsJson(timetable: NormalizedTimetableV2): string {
  return `${JSON.stringify(timetable, null, 2)}\n`;
}

export function parseTericsJson(text: string): NormalizedTimetableV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TericsParseError("不是有效的 JSON 文件");
  }
  const inspected = inspectTimetableV2(parsed);
  if (!inspected.valid) {
    throw new TericsParseError(
      "不是有效的 terics v2 课表文件",
      inspected.issues.map((issue) => ({
        severity: "error" as const,
        code: issue.code,
        message: `${issue.path}: ${issue.message}`,
      })),
    );
  }
  return parsed as NormalizedTimetableV2;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function encodeTericsFragment(timetable: NormalizedTimetableV2): string {
  const bytes = new TextEncoder().encode(serializeTericsJson(timetable));
  return `terics-data=${bytesToBase64Url(bytes)}`;
}

export function decodeTericsFragment(fragment: string): NormalizedTimetableV2 {
  const prefix = "terics-data=";
  if (!fragment.startsWith(prefix)) throw new TericsParseError("不支持的 terics URL 数据片段");
  try {
    return parseTericsJson(new TextDecoder().decode(base64UrlToBytes(fragment.slice(prefix.length))));
  } catch (error) {
    if (error instanceof TericsParseError) throw error;
    throw new TericsParseError("无法解码 terics URL 数据片段");
  }
}

export function readTericsHash(hash: string): NormalizedTimetableV2 | null {
  const cleaned = hash.replace(/^#/, "");
  if (!cleaned.startsWith("terics-data=")) return null;
  return decodeTericsFragment(cleaned);
}

export function updateSemesterStart(timetable: NormalizedTimetableV2, semesterStart: string): NormalizedTimetableV2 {
  const clone = structuredClone(timetable);
  clone.term.semesterStart = semesterStart;
  if (clone.term.periodSchedules.length === 1) {
    clone.term.periodSchedules[0]!.effectiveFrom = semesterStart;
  }
  clone.validation = inspectTimetableV2(clone).report;
  return clone;
}
