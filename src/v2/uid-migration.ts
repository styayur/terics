import { buildV2Events } from "./events";
import { sha256Hex } from "./ids";
import type { NormalizedTimetableV2, TimetableEventV2 } from "./types";

export const LEGACY_UID_PATTERN = /^terics-[0-9a-f]{32}@terics$/i;

export interface LegacyUidMapping {
  legacyUid: string;
  newUid: string;
  date: string;
  title: string;
}

export interface UidMigrationPreview {
  legacyEventCount: number;
  alreadyMigrated: number;
  matched: LegacyUidMapping[];
  unmatched: Array<{ uid: string; date?: string; title?: string }>;
  ambiguous: Array<{ legacyUid: string; candidates: LegacyUidMapping[] }>;
  safeToApply: boolean;
}

export interface UidMigrationResult {
  ics: string;
  replaced: number;
  skipped: number;
}

export async function legacyUidForEvent(
  event: Pick<TimetableEventV2, "title" | "teacher" | "room" | "date" | "startPeriod" | "endPeriod">,
): Promise<string> {
  const key = [event.title, event.teacher, event.room, event.date, event.startPeriod, event.endPeriod].join("\u001f");
  return `terics-${(await sha256Hex(key)).slice(0, 32)}@terics`;
}

function unfold(ics: string): string[] {
  const physical = ics.replace(/\r\n?/g, "\n").split("\n");
  const logical: string[] = [];
  for (const line of physical) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && logical.length > 0) logical[logical.length - 1] += line.slice(1);
    else logical.push(line);
  }
  return logical;
}

function property(block: string[], name: string): string | null {
  for (const line of block) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    if (left.split(";", 1)[0]!.toUpperCase() !== name.toUpperCase()) continue;
    return line
      .slice(colon + 1)
      .replace(/\\n/gi, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\");
  }
  return null;
}

function eventBlocks(ics: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of unfold(ics)) {
    if (!current && /^BEGIN:VEVENT$/i.test(line.trim())) current = [line];
    else if (current) {
      current.push(line);
      if (/^END:VEVENT$/i.test(line.trim())) {
        blocks.push(current);
        current = null;
      }
    }
  }
  if (current) throw new Error("ICS 中 VEVENT 未闭合");
  return blocks;
}

function dateFromIcs(block: string[]): string | undefined {
  const value = property(block, "DTSTART");
  const match = value?.match(/(\d{4})(\d{2})(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

export async function previewUidMigration(timetable: NormalizedTimetableV2, legacyIcs: string): Promise<UidMigrationPreview> {
  const build = await buildV2Events(timetable);
  if (build.issues.some((issue) => issue.severity === "error")) throw new Error("当前课表未通过事件构建校验，不能生成 UID 迁移预览");
  const byLegacyUid = new Map<string, LegacyUidMapping[]>();
  for (const event of build.events) {
    const legacyUid = await legacyUidForEvent(event);
    const mapping = { legacyUid, newUid: event.uid, date: event.date, title: event.title };
    byLegacyUid.set(legacyUid.toLowerCase(), [...(byLegacyUid.get(legacyUid.toLowerCase()) ?? []), mapping]);
  }
  let legacyEventCount = 0;
  let alreadyMigrated = 0;
  const matched: LegacyUidMapping[] = [];
  const unmatched: UidMigrationPreview["unmatched"] = [];
  const ambiguous: UidMigrationPreview["ambiguous"] = [];
  for (const block of eventBlocks(legacyIcs)) {
    const uid = property(block, "UID") ?? "";
    const hasCourseIdentity = Boolean(property(block, "X-TERICS-COURSE-ID"));
    if (!LEGACY_UID_PATTERN.test(uid) || hasCourseIdentity) {
      alreadyMigrated += 1;
      continue;
    }
    legacyEventCount += 1;
    const candidates = byLegacyUid.get(uid.toLowerCase()) ?? [];
    if (candidates.length === 1) matched.push(candidates[0]!);
    else if (candidates.length > 1) ambiguous.push({ legacyUid: uid, candidates });
    else unmatched.push({ uid, date: dateFromIcs(block), title: property(block, "SUMMARY") ?? undefined });
  }
  return {
    legacyEventCount,
    alreadyMigrated,
    matched,
    unmatched,
    ambiguous,
    safeToApply: matched.length > 0 && unmatched.length === 0 && ambiguous.length === 0,
  };
}

export function applyUidMigration(ics: string, preview: UidMigrationPreview, confirmed: boolean): UidMigrationResult {
  if (!confirmed) throw new Error("UID 迁移必须由用户明确确认；不会自动替换或删除");
  if (!preview.safeToApply) throw new Error("UID 迁移预览仍有未匹配或歧义事件，已阻止写入");
  const replacements = new Map(preview.matched.map((mapping) => [mapping.legacyUid.toLowerCase(), mapping.newUid]));
  const lines = ics.replace(/\r\n?/g, "\n").split("\n");
  let replaced = 0;
  const output = lines.map((line) => {
    const colon = line.indexOf(":");
    if (colon < 0) return line;
    const left = line.slice(0, colon);
    if (left.split(";", 1)[0]!.toUpperCase() !== "UID") return line;
    const replacement = replacements.get(line.slice(colon + 1).toLowerCase());
    if (!replacement) return line;
    replaced += 1;
    return `${left}:${replacement}`;
  });
  if (replaced !== preview.matched.length) throw new Error("UID 迁移计数不一致，未生成结果");
  const lineEnding = ics.includes("\r\n") ? "\r\n" : "\n";
  return {
    ics: `${output.join(lineEnding).replace(/[\r\n]+$/, "")}${lineEnding}`,
    replaced,
    skipped: preview.alreadyMigrated,
  };
}
