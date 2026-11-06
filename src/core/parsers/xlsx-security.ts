import { Inflate } from "fflate";
import { TericsParseError } from "../errors";

export const XLSX_LIMITS = {
  maxEntries: 512,
  maxEntryBytes: 8 * 1024 * 1024,
  maxTotalBytes: 24 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxSheets: 32,
  maxRows: 20_000,
  maxColumns: 256,
  maxXmlDepth: 128,
} as const;

interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_SENTINEL = 0xffffffff;

function u16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function u32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function findEocd(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= start; offset -= 1) {
    if (u32(bytes, offset) === EOCD_SIGNATURE) return offset;
  }
  throw new TericsParseError("XLSX ZIP 结构损坏：找不到中央目录结尾");
}

function decodeEntryName(bytes: Uint8Array, flags: number): string {
  const encoding = flags & 0x0800 ? "utf-8" : "windows-1252";
  return new TextDecoder(encoding).decode(bytes);
}

function safeEntryName(name: string): boolean {
  if (!name || name.length > 512 || name.includes("\0") || name.includes("\\")) return false;
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return false;
  return !name.split("/").some((part) => part === "..");
}

function readCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const eocd = findEocd(bytes);
  const diskNumber = u16(bytes, eocd + 4);
  const centralDisk = u16(bytes, eocd + 6);
  const entriesOnDisk = u16(bytes, eocd + 8);
  const totalEntries = u16(bytes, eocd + 10);
  const centralSize = u32(bytes, eocd + 12);
  const centralOffset = u32(bytes, eocd + 16);
  const commentLength = u16(bytes, eocd + 20);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new TericsParseError("不支持分卷 ZIP/XLSX");
  }
  if (totalEntries === 0 || totalEntries > XLSX_LIMITS.maxEntries) {
    throw new TericsParseError(`XLSX ZIP entry 数超出限制（${totalEntries} > ${XLSX_LIMITS.maxEntries}）`);
  }
  if (centralOffset + centralSize > bytes.byteLength || eocd + 22 + commentLength > bytes.byteLength) {
    throw new TericsParseError("XLSX ZIP 中央目录边界无效");
  }
  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let offset = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > centralOffset + centralSize || u32(bytes, offset) !== CENTRAL_SIGNATURE) {
      throw new TericsParseError("XLSX ZIP 中央目录损坏");
    }
    const flags = u16(bytes, offset + 8);
    const method = u16(bytes, offset + 10);
    const compressedSize = u32(bytes, offset + 20);
    const uncompressedSize = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const entryCommentLength = u16(bytes, offset + 32);
    const diskStart = u16(bytes, offset + 34);
    const externalAttributes = u32(bytes, offset + 38);
    const localOffset = u32(bytes, offset + 42);
    const next = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (next > centralOffset + centralSize || offset + 46 + nameLength > bytes.byteLength) {
      throw new TericsParseError("XLSX ZIP entry 名称越界");
    }
    const name = decodeEntryName(bytes.subarray(offset + 46, offset + 46 + nameLength), flags);
    if (!safeEntryName(name)) throw new TericsParseError(`XLSX 包含不安全路径：${name.slice(0, 120)}`);
    if (names.has(name.toLowerCase())) throw new TericsParseError(`XLSX 包含重复 ZIP entry：${name}`);
    names.add(name.toLowerCase());
    if (flags & 0x1) throw new TericsParseError("不支持加密或受密码保护的 XLSX");
    if (((externalAttributes >>> 16) & 0o170000) === 0o120000) {
      throw new TericsParseError(`XLSX 包含符号链接 entry：${name}`);
    }
    if (diskStart !== 0) throw new TericsParseError("不支持分卷 ZIP/XLSX");
    if (method !== 0 && method !== 8) throw new TericsParseError(`XLSX 使用不支持的 ZIP 压缩方法 ${method}`);
    if (
      compressedSize === ZIP64_SENTINEL ||
      uncompressedSize === ZIP64_SENTINEL ||
      localOffset === ZIP64_SENTINEL
    ) {
      throw new TericsParseError("不支持 ZIP64 XLSX；请重新另存为普通 XLSX");
    }
    if (uncompressedSize > XLSX_LIMITS.maxEntryBytes) {
      throw new TericsParseError(`XLSX 单 entry 解压后超过 ${XLSX_LIMITS.maxEntryBytes / 1024 / 1024} MiB 限制`);
    }
    if (compressedSize === 0 && uncompressedSize > 0) throw new TericsParseError("XLSX ZIP 压缩大小无效");
    if (compressedSize > 0 && uncompressedSize / compressedSize > XLSX_LIMITS.maxCompressionRatio) {
      throw new TericsParseError(`XLSX ZIP 压缩率异常：${name}`);
    }
    if (localOffset + 30 > bytes.byteLength || u32(bytes, localOffset) !== LOCAL_SIGNATURE) {
      throw new TericsParseError(`XLSX ZIP local header 损坏：${name}`);
    }
    const localNameLength = u16(bytes, localOffset + 26);
    const localExtraLength = u16(bytes, localOffset + 28);
    const localNameEnd = localOffset + 30 + localNameLength;
    if (localNameEnd + localExtraLength > bytes.byteLength) {
      throw new TericsParseError(`XLSX ZIP local header 越界：${name}`);
    }
    const localName = decodeEntryName(bytes.subarray(localOffset + 30, localNameEnd), flags);
    if (localName !== name) throw new TericsParseError(`XLSX ZIP entry 名称不一致：${name}`);
    entries.push({ name, flags, method, compressedSize, uncompressedSize, localOffset });
    offset = next;
  }
  const totalBytes = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (totalBytes > XLSX_LIMITS.maxTotalBytes) {
    throw new TericsParseError(`XLSX 解压总量超过 ${XLSX_LIMITS.maxTotalBytes / 1024 / 1024} MiB 限制`);
  }
  return entries;
}

function compressedEntryData(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  const nameLength = u16(bytes, entry.localOffset + 26);
  const extraLength = u16(bytes, entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.byteLength) throw new TericsParseError(`XLSX ZIP 数据越界：${entry.name}`);
  return bytes.subarray(start, end);
}

function inflateLimited(data: Uint8Array, limit: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inflater = new Inflate((chunk) => {
    total += chunk.byteLength;
    if (total > limit) throw new TericsParseError("XLSX XML 解压超过声明大小，已阻止 ZIP Bomb");
    chunks.push(chunk);
  });
  inflater.push(data, true);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function findTagEnd(text: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  return -1;
}

function inspectXml(text: string, name: string): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new TericsParseError(`XLSX XML 包含 DTD/ENTITY，已阻止：${name}`);
  let depth = 0;
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("<", index);
    if (open < 0) break;
    if (text.startsWith("<!--", open)) {
      const end = text.indexOf("-->", open + 4);
      if (end < 0) throw new TericsParseError(`XLSX XML 注释未闭合：${name}`);
      index = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", open)) {
      const end = text.indexOf("]]>", open + 9);
      if (end < 0) throw new TericsParseError(`XLSX XML CDATA 未闭合：${name}`);
      index = end + 3;
      continue;
    }
    const close = findTagEnd(text, open);
    if (close < 0) throw new TericsParseError(`XLSX XML 标签未闭合：${name}`);
    const tag = text.slice(open + 1, close).trim();
    if (tag.startsWith("?") || tag.startsWith("!")) {
      index = close + 1;
      continue;
    }
    if (tag.startsWith("/")) depth -= 1;
    else if (!tag.endsWith("/")) depth += 1;
    if (depth < 0 || depth > XLSX_LIMITS.maxXmlDepth) {
      throw new TericsParseError(`XLSX XML 嵌套深度异常：${name}`);
    }
    index = close + 1;
  }
  if (depth !== 0) throw new TericsParseError(`XLSX XML 结构未闭合：${name}`);
}

export function validateXlsxZip(bytes: Uint8Array): { entries: number; totalUncompressedBytes: number } {
  const entries = readCentralDirectory(bytes);
  const names = new Set(entries.map((entry) => entry.name.toLowerCase()));
  if (!names.has("[content_types].xml") || !names.has("xl/workbook.xml")) {
    throw new TericsParseError("XLSX 缺少 [Content_Types].xml 或 xl/workbook.xml");
  }
  const worksheetCount = entries.filter((entry) => /^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name)).length;
  if (worksheetCount > XLSX_LIMITS.maxSheets) {
    throw new TericsParseError(`XLSX 工作表数超过 ${XLSX_LIMITS.maxSheets} 限制`);
  }
  for (const entry of entries) {
    if (!/\.(?:xml|rels)$/i.test(entry.name)) continue;
    const compressed = compressedEntryData(bytes, entry);
    const expanded = entry.method === 0 ? compressed : inflateLimited(compressed, entry.uncompressedSize);
    if (expanded.byteLength !== entry.uncompressedSize) {
      throw new TericsParseError(`XLSX XML 解压大小与中央目录不一致：${entry.name}`);
    }
    inspectXml(new TextDecoder("utf-8", { fatal: false }).decode(expanded), entry.name);
  }
  return { entries: entries.length, totalUncompressedBytes: entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0) };
}

export function validateXlsxWorksheetShape(sheets: Array<{ sheet: string; data: unknown[][] }>): void {
  if (sheets.length > XLSX_LIMITS.maxSheets) throw new TericsParseError(`XLSX 工作表数超过 ${XLSX_LIMITS.maxSheets} 限制`);
  for (const sheet of sheets) {
    if (sheet.data.length > XLSX_LIMITS.maxRows) {
      throw new TericsParseError(`工作表“${sheet.sheet}”行数超过 ${XLSX_LIMITS.maxRows} 限制`);
    }
    if (sheet.data.some((row) => row.length > XLSX_LIMITS.maxColumns)) {
      throw new TericsParseError(`工作表“${sheet.sheet}”列数超过 ${XLSX_LIMITS.maxColumns} 限制`);
    }
  }
}
