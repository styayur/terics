import { TericsParseError } from "../errors";
import type { ParseInput, ParseResult } from "../types";
import { parseCsv } from "./csv";
import { parseHtml } from "./html";
import { parseXlsx } from "./xlsx";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((value, index) => bytes[index] === value);
}

function hasUtf16Bom(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  );
}

function declaredCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder("windows-1252").decode(bytes.subarray(0, 4096));
  const meta =
    head.match(/<meta[^>]+charset\s*=\s*["']?\s*([a-zA-Z0-9._-]+)/i)?.[1] ??
    head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9._-]+)/i)?.[1];
  if (!meta) return null;
  const label = meta.toLowerCase();
  if (["gbk", "gb2312", "gb18030", "x-gbk", "cp936"].includes(label)) return "gb18030";
  if (["utf-8", "utf8"].includes(label)) return "utf-8";
  if (["utf-16", "utf-16le", "utf-16be"].includes(label)) return "utf-16le";
  return null;
}

function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  if (hasUtf16Bom(bytes)) {
    const encoding = bytes[0] === 0xff ? "utf-16le" : "utf-16be";
    try {
      return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes), encoding };
    } catch {
      throw new TericsParseError(`文件声明或标记为 ${encoding}，但内容编码无效`);
    }
  }

  const charset = declaredCharset(bytes);
  if (charset && charset !== "utf-8") {
    try {
      return { text: new TextDecoder(charset, { fatal: true }).decode(bytes), encoding: charset };
    } catch {
      throw new TericsParseError(`文件声明编码为 ${charset}，但内容无法按该编码读取`);
    }
  }

  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    try {
      return { text: new TextDecoder("gb18030", { fatal: true }).decode(bytes), encoding: "gb18030" };
    } catch {
      throw new TericsParseError(
        "无法识别文本编码；请将文件另存为 UTF-8 或 GB18030 后重试",
      );
    }
  }
}

function looksLikeHtml(text: string): boolean {
  const head = text.replace(/^\uFEFF/, "").trimStart().slice(0, 4096).toLowerCase();
  return (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.startsWith("<table") ||
    head.includes("<table") ||
    /<(?:tr|td|th)[\s>]/.test(head)
  );
}

function binaryNulRatio(bytes: Uint8Array): number {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  let count = 0;
  for (const byte of sample) if (byte === 0) count += 1;
  return sample.length === 0 ? 0 : count / sample.length;
}

export async function parseTimetableFile(input: ParseInput): Promise<ParseResult> {
  const { bytes, fileName } = input;
  if (bytes.byteLength === 0) throw new TericsParseError("文件为空");
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new TericsParseError(
      `文件超过 10 MiB 限制（当前 ${(bytes.byteLength / 1024 / 1024).toFixed(2)} MiB）`,
    );
  }

  if (startsWith(bytes, OLE_MAGIC)) {
    throw new TericsParseError(
      "检测到旧版二进制 XLS（OLE）文件。v0.1.0 仅支持 XLSX；请另存为 .xlsx、CSV，或使用教务系统导出的 HTML 表格。",
    );
  }

  if (startsWith(bytes, ZIP_MAGIC)) {
    return parseXlsx(bytes, fileName);
  }

  if (binaryNulRatio(bytes) > 0.02 && !hasUtf16Bom(bytes)) {
    throw new TericsParseError("检测到二进制内容，但没有发现有效的 XLSX/ZIP 签名");
  }

  const { text, encoding } = decodeText(bytes);
  if (!text.trim()) throw new TericsParseError("文件没有可读取的文本内容");

  if (looksLikeHtml(text)) {
    const result = parseHtml(text, fileName);
    result.metadata.detectedEncoding = encoding;
    return result;
  }

  const result = parseCsv(text, fileName);
  result.metadata.detectedEncoding = encoding;
  return result;
}
