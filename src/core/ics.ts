import { buildEvents } from "./course";
import { formatUtcStamp, weekdayZh } from "./dates";
import { TericsParseError } from "./errors";
import type { BuildResult, IcsOptions, RawCourse, SemesterConfig } from "./types";
import { APP_VERSION, TIMEZONE } from "./types";
import { normalizeText } from "./weeks";

export interface IcsOutput {
  ics: string;
  build: BuildResult;
}

export function escapeIcsText(value: unknown): string {
  return normalizeText(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    const limit = chunks.length === 0 ? 75 : 74;
    if (currentBytes + charBytes > limit && current.length > 0) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}

function eventDescription(event: BuildResult["events"][number]): string {
  const lines = [
    `教师：${event.teacher || "未提供"}`,
    `地点：${event.location || "未提供"}`,
    `节次：第 ${event.startPeriod}-${event.endPeriod} 节`,
    `周次：${event.weekRule}`,
    `日期：${event.date}（${weekdayZh(event.weekday)}）`,
  ];
  if (event.note) lines.push(`备注：${event.note}`);
  return lines.join("\n");
}

export async function generateIcs(
  config: SemesterConfig,
  courses: RawCourse[],
  options: IcsOptions = {},
): Promise<IcsOutput> {
  const build = await buildEvents(config, courses);
  if (build.issues.some((issue) => issue.severity === "error") || build.events.length === 0) {
    throw new TericsParseError(
      build.issues.find((issue) => issue.severity === "error")?.message ?? "没有可导出的课程",
      build.issues,
    );
  }

  const dtstamp = formatUtcStamp(options.now ?? new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//terics//Timetable Converter ${APP_VERSION}//ZH-CN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(config.title || "我的课表")}`,
    `X-WR-TIMEZONE:${TIMEZONE}`,
    `X-TERICS-VERSION:${APP_VERSION}`,
    "BEGIN:VTIMEZONE",
    `TZID:${TIMEZONE}`,
    `X-LIC-LOCATION:${TIMEZONE}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const event of build.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${TIMEZONE}:${event.startDateTime}`,
      `DTEND;TZID=${TIMEZONE}:${event.endDateTime}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
    );
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    lines.push(
      `DESCRIPTION:${escapeIcsText(eventDescription(event))}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "SEQUENCE:0",
    );
    if (config.alarmMinutes > 0) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-PT${config.alarmMinutes}M`,
        `DESCRIPTION:${escapeIcsText(event.title)}`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  const ics = `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
  return { ics, build };
}

export function suggestedFileName(config: SemesterConfig): string {
  const title = normalizeText(config.title || "我的课表")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${title}-${config.semesterStart}.ics`;
}
