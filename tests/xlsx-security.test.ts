import { describe, expect, it } from "vitest";
import { validateXlsxWorksheetShape, validateXlsxZip, XLSX_LIMITS } from "../src/core/parsers/xlsx-security";
import { TericsParseError } from "../src/core/errors";

interface ZipFixtureEntry {
  name: string;
  data?: Uint8Array;
  flags?: number;
  method?: number;
  compressedSize?: number;
  uncompressedSize?: number;
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

function buildStoredZip(entries: ZipFixtureEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data ?? new Uint8Array();
    const compressedSize = entry.compressedSize ?? data.byteLength;
    const uncompressedSize = entry.uncompressedSize ?? data.byteLength;
    const local = new Uint8Array(30 + name.byteLength + data.byteLength);
    const localView = new DataView(local.buffer);
    writeU32(localView, 0, 0x04034b50);
    writeU16(localView, 4, 20);
    writeU16(localView, 6, entry.flags ?? 0);
    writeU16(localView, 8, entry.method ?? 0);
    writeU32(localView, 14, 0);
    writeU32(localView, 18, compressedSize);
    writeU32(localView, 22, uncompressedSize);
    writeU16(localView, 26, name.byteLength);
    local.set(name, 30);
    local.set(data, 30 + name.byteLength);
    localParts.push(local);

    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    writeU32(centralView, 0, 0x02014b50);
    writeU16(centralView, 4, 20);
    writeU16(centralView, 6, 20);
    writeU16(centralView, 8, entry.flags ?? 0);
    writeU16(centralView, 10, entry.method ?? 0);
    writeU32(centralView, 16, 0);
    writeU32(centralView, 20, compressedSize);
    writeU32(centralView, 24, uncompressedSize);
    writeU16(centralView, 28, name.byteLength);
    writeU32(centralView, 42, localOffset);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.byteLength;
  }
  const central = new Uint8Array(centralParts.reduce((sum, part) => sum + part.byteLength, 0));
  let centralOffset = 0;
  for (const part of centralParts) {
    central.set(part, centralOffset);
    centralOffset += part.byteLength;
  }
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  writeU32(eocdView, 0, 0x06054b50);
  writeU16(eocdView, 8, entries.length);
  writeU16(eocdView, 10, entries.length);
  writeU32(eocdView, 12, central.byteLength);
  writeU32(eocdView, 16, localOffset);
  return Buffer.concat([...localParts.map((part) => Buffer.from(part)), Buffer.from(central), Buffer.from(eocd)]);
}

function requiredEntries(): ZipFixtureEntry[] {
  const encoder = new TextEncoder();
  return [
    { name: "[Content_Types].xml", data: encoder.encode('<?xml version="1.0"?><Types></Types>') },
    { name: "xl/workbook.xml", data: encoder.encode('<?xml version="1.0"?><workbook></workbook>') },
  ];
}

describe("XLSX ZIP resource guards", () => {
  it("rejects ZIP Slip, duplicate entries and encrypted archives", () => {
    expect(() => validateXlsxZip(buildStoredZip([{ name: "../evil.xml", data: new Uint8Array([1]) }]))).toThrow(/不安全路径/);
    expect(() => validateXlsxZip(buildStoredZip([...requiredEntries(), { name: "xl/workbook.xml" }]))).toThrow(/重复 ZIP entry/);
    expect(() => validateXlsxZip(buildStoredZip([...requiredEntries(), { name: "xl/encrypted.xml", data: new Uint8Array([1]), flags: 1 }]))).toThrow(
      /加密/,
    );
  });

  it("rejects excessive compression ratio and total expanded size before workbook parsing", () => {
    expect(() =>
      validateXlsxZip(
        buildStoredZip([
          ...requiredEntries(),
          { name: "xl/bomb.xml", data: new Uint8Array([1]), compressedSize: 100, uncompressedSize: 1_000_000 },
        ]),
      ),
    ).toThrow(/压缩率/);
    const oversized = requiredEntries();
    for (let index = 0; index < 4; index += 1) {
      oversized.push({
        name: `xl/filler-${index}.xml`,
        data: new Uint8Array([1]),
        compressedSize: 100_000,
        uncompressedSize: 6 * 1024 * 1024,
      });
    }
    expect(() => validateXlsxZip(buildStoredZip(oversized))).toThrow(/解压总量/);
  });

  it("rejects DTD/ENTITY and excessive XML nesting", () => {
    const encoder = new TextEncoder();
    const dtd = buildStoredZip([
      ...requiredEntries(),
      { name: "xl/evil.xml", data: encoder.encode('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY y "z">]><x>&y;</x>') },
    ]);
    expect(() => validateXlsxZip(dtd)).toThrow(/DTD\/ENTITY/);
    const deep = `${"<n>".repeat(XLSX_LIMITS.maxXmlDepth + 1)}${"</n>".repeat(XLSX_LIMITS.maxXmlDepth + 1)}`;
    const nested = buildStoredZip([...requiredEntries(), { name: "xl/deep.xml", data: encoder.encode(deep) }]);
    expect(() => validateXlsxZip(nested)).toThrow(/嵌套深度/);
  });

  it("limits worksheets, rows and columns", () => {
    const sheets = requiredEntries();
    for (let index = 0; index <= XLSX_LIMITS.maxSheets; index += 1) {
      sheets.push({ name: `xl/worksheets/sheet${index}.xml`, data: new Uint8Array() });
    }
    expect(() => validateXlsxZip(buildStoredZip(sheets))).toThrow(/工作表数/);
    expect(() =>
      validateXlsxWorksheetShape([{ sheet: "rows", data: Array.from({ length: XLSX_LIMITS.maxRows + 1 }, () => []) }]),
    ).toThrow(/行数/);
    expect(() => validateXlsxWorksheetShape([{ sheet: "columns", data: [Array.from({ length: XLSX_LIMITS.maxColumns + 1 }, () => "x")] }])).toThrow(
      /列数/,
    );
  });

  it("keeps errors explicit and typed", () => {
    expect(() => validateXlsxZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toThrow(TericsParseError);
  });
});
