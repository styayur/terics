const MS_PER_DAY = 86_400_000;

export function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`日期必须使用 YYYY-MM-DD 格式：${value}`);
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`无效日期：${value}`);
  }
  return date;
}

export function formatIsoDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysIso(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

export function mondayOfIso(value: string): string {
  const date = parseIsoDate(value);
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  return formatIsoDate(date);
}

export function isMonday(value: string): boolean {
  return parseIsoDate(value).getUTCDay() === 1;
}

export function dateForClass(semesterStart: string, week: number, weekday: number): string {
  if (!Number.isInteger(week) || week < 1) {
    throw new Error(`周次必须是正整数：${week}`);
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new Error(`星期必须在 1–7 之间：${weekday}`);
  }
  return addDaysIso(semesterStart, (week - 1) * 7 + (weekday - 1));
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parseIsoDate(end).getTime() - parseIsoDate(start).getTime()) / MS_PER_DAY);
}

export function formatUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function weekdayZh(weekday: number): string {
  return ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"][weekday] ?? `周${weekday}`;
}

export function assertTime(value: string, label: string): string {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`${label}必须是 HH:mm 格式，且在 00:00–23:59 之间：${value}`);
  }
  return value;
}

export function compactLocalDateTime(date: string, time: string): string {
  return `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
}

export function timeToMinutes(value: string): number {
  assertTime(value, "时间");
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}
