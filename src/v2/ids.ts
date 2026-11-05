import { parseIsoDate, mondayOfIso } from "../core/dates";

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function makeCourseId(input: {
  adapterId: string;
  sourceCourseId?: string;
  sourceRef?: string;
  fallbackOrdinal: number;
}): Promise<string> {
  const anchor = input.sourceCourseId?.trim() || input.sourceRef?.trim() || `ordinal:${input.fallbackOrdinal}`;
  return `course-${(await sha256Hex([input.adapterId, anchor].join("\u001f"))).slice(0, 24)}`;
}

export async function makeMeetingId(input: {
  courseId: string;
  sourceMeetingId?: string;
  weekday: number;
  startPeriod: number;
  endPeriod: number;
  weeks: number[];
}): Promise<string> {
  const anchor =
    input.sourceMeetingId?.trim() ||
    [input.weekday, input.startPeriod, input.endPeriod, [...input.weeks].sort((a, b) => a - b).join(",")].join("|");
  return `meeting-${(await sha256Hex([input.courseId, anchor].join("\u001f"))).slice(0, 24)}`;
}

export async function makeEventUid(input: {
  termId: string;
  courseId: string;
  meetingId: string;
  date: string;
  startPeriod: number;
  endPeriod: number;
}): Promise<string> {
  const key = [
    input.termId,
    input.courseId,
    input.meetingId,
    input.date,
    input.startPeriod,
    input.endPeriod,
  ].join("\u001f");
  return `terics-${(await sha256Hex(key)).slice(0, 32)}@terics`;
}

export function sanitizeSourceUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "about:invalid";
  }
}

export function normalizeSemesterStart(value: string): string {
  const monday = mondayOfIso(value);
  parseIsoDate(monday);
  return monday;
}

export function createDefaultPeriodSchedule(effectiveFrom: string, periods: Array<{ index: number; start: string; end: string; label?: string }>) {
  return {
    id: `periods-${effectiveFrom}`,
    label: "学期默认作息",
    effectiveFrom,
    periods: periods.map((period) => ({ ...period })),
  };
}
