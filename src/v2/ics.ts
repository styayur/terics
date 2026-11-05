import { formatUtcStamp, weekdayZh } from "../core/dates";
import { TericsParseError } from "../core/errors";
import { escapeIcsText, foldIcsLine } from "../core/ics";
import type { BuildV2Result, NormalizedTimetableV2, TimetableEventV2 } from "./types";
import { buildV2Events } from "./events";

export interface IcsV2Options {
  now?: Date;
  alarmMinutes?: number;
}

export interface IcsV2Output {
  ics: string;
  events: TimetableEventV2[];
  conflicts: BuildV2Result["conflicts"];
}

function eventDescription(event: TimetableEventV2): string {
  const lines = [
    `教师：${event.teacher || "未提供"}`,
    `地点：${event.room || "未提供"}`,
    `节次：第 ${event.startPeriod}-${event.endPeriod} 节`,
    `周次：${event.weekRule}`,
    `日期：${event.date}（${weekdayZh(event.weekday)}）`,
    `课程 ID：${event.courseId}`,
    `上课实例 ID：${event.meetingId}`,
  ];
  if (event.campus) lines.push(`校区：${event.campus}`);
  if (event.note) lines.push(`备注：${event.note}`);
  return lines.join("\n");
}

export async function generateIcsV2(timetable: NormalizedTimetableV2, options: IcsV2Options = {}): Promise<IcsV2Output> {
  const build = await buildV2Events(timetable);
  if (build.issues.some((issue) => issue.severity === "error") || build.events.length === 0) {
    throw new TericsParseError(
      build.issues.find((issue) => issue.severity === "error")?.message ?? "没有可导出的课程",
      build.issues,
    );
  }
  const dtstamp = formatUtcStamp(options.now ?? new Date());
  const alarmMinutes = options.alarmMinutes ?? 0;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//terics//Timetable Bridge 0.5//ZH-CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(timetable.term.termName || "我的课表")}`,
    `X-WR-TIMEZONE:${escapeIcsText(timetable.term.timezone || "Asia/Shanghai")}`,
    "X-TERICS-SCHEMA:2.0",
    `X-TERICS-ADAPTER:${escapeIcsText(timetable.source.adapterId)}`,
    `X-TERICS-ADAPTER-VERSION:${escapeIcsText(timetable.source.adapterVersion)}`,
    `X-TERICS-TERM-ID:${escapeIcsText(timetable.term.termId)}`,
    "BEGIN:VTIMEZONE",
    `TZID:${escapeIcsText(timetable.term.timezone || "Asia/Shanghai")}`,
    `X-LIC-LOCATION:${escapeIcsText(timetable.term.timezone || "Asia/Shanghai")}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  const tzid = timetable.term.timezone || "Asia/Shanghai";
  for (const event of build.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${tzid}:${event.startDateTime}`,
      `DTEND;TZID=${tzid}:${event.endDateTime}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `X-TERICS-COURSE-ID:${escapeIcsText(event.courseId)}`,
      `X-TERICS-MEETING-ID:${escapeIcsText(event.meetingId)}`,
      `X-TERICS-TERM-ID:${escapeIcsText(event.source.termId)}`,
    );
    if (event.room) lines.push(`LOCATION:${escapeIcsText(event.room)}`);
    lines.push(
      `DESCRIPTION:${escapeIcsText(eventDescription(event))}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "SEQUENCE:0",
    );
    if (alarmMinutes > 0) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-PT${alarmMinutes}M`,
        `DESCRIPTION:${escapeIcsText(event.title)}`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return {
    ics: `${lines.map(foldIcsLine).join("\r\n")}\r\n`,
    events: build.events,
    conflicts: build.conflicts,
  };
}

export function suggestedIcsV2FileName(timetable: NormalizedTimetableV2): string {
  const safeTitle = (timetable.term.termName || "我的课表")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${safeTitle}-${timetable.term.semesterStart}.ics`;
}
