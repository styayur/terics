import { connectorManifests } from "../src/connectors/registry";
import { addDaysIso, daysBetween, mondayOfIso, weekdayZh } from "../src/core/dates";
import { generateIcsV2, suggestedIcsV2FileName } from "../src/v2/ics";
import { encodeTericsFragment, serializeTericsJson } from "../src/v2/exchange";
import { buildV2Events } from "../src/v2/events";
import type { NormalizedTimetableV2 } from "../src/v2/types";
import { inspectTimetableV2 } from "../src/v2/validate";

const WEB_APP_URL = "https://styayur.github.io/terics/";
const STORAGE_KEY = "tericsLastExtraction";

interface ExtractResponse {
  ok: boolean;
  timetable?: NormalizedTimetableV2;
  detection?: {
    adapterId: string;
    schoolId?: string;
    schoolName?: string;
    confidence: number;
    evidence: string[];
  };
  evidence?: string[];
  warnings?: string[];
  error?: string;
  code?: string;
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const pageLabel = byId<HTMLParagraphElement>("page-label");
const status = byId<HTMLDivElement>("status");
const adapterSelect = byId<HTMLSelectElement>("adapter-select");
const startDate = byId<HTMLInputElement>("start-date");
const teachingWeeks = byId<HTMLInputElement>("teaching-weeks");
const academicYear = byId<HTMLInputElement>("academic-year");
const termCode = byId<HTMLInputElement>("term-code");
const termName = byId<HTMLInputElement>("term-name");
const extractButton = byId<HTMLButtonElement>("extract-button");
const resultPanel = byId<HTMLElement>("result");
const resultTitle = byId<HTMLElement>("result-title");
const validationBadge = byId<HTMLElement>("validation-badge");
const courseCount = byId<HTMLElement>("course-count");
const meetingCount = byId<HTMLElement>("meeting-count");
const eventCount = byId<HTMLElement>("event-count");
const conflictCount = byId<HTMLElement>("conflict-count");
const warningList = byId<HTMLDivElement>("warning-list");
const provenanceLine = byId<HTMLElement>("provenance-line");
const weekLabel = byId<HTMLElement>("week-label");
const weekRuler = byId<HTMLDivElement>("week-ruler");
const weekAgenda = byId<HTMLDivElement>("week-agenda");
const weekEmpty = byId<HTMLElement>("week-empty");
const ackRow = byId<HTMLElement>("ack-row");
const conflictAck = byId<HTMLInputElement>("conflict-ack");
const jsonButton = byId<HTMLButtonElement>("json-button");
const icsButton = byId<HTMLButtonElement>("ics-button");
const webButton = byId<HTMLButtonElement>("web-button");
const errorBox = byId<HTMLElement>("error-box");
const clearButton = byId<HTMLButtonElement>("clear-button");
let currentTab: chrome.tabs.Tab | null = null;
let currentTimetable: NormalizedTimetableV2 | null = null;
let currentBuild: Awaited<ReturnType<typeof buildV2Events>> | null = null;
let currentEventCount = 0;
let currentConflictCount = 0;
let selectedWeek = 1;

function defaultDate(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  return mondayOfIso(`${now.getFullYear()}-${month >= 7 ? "09-01" : "03-01"}`);
}

function setStatus(kind: "idle" | "working" | "success" | "error", text: string): void {
  status.dataset.kind = kind;
  status.textContent = text;
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError(): void {
  errorBox.textContent = "";
  errorBox.hidden = true;
}

function downloadBlob(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function refreshDownloadState(): Promise<void> {
  jsonButton.disabled = !currentTimetable;
  icsButton.disabled = !currentTimetable || (currentConflictCount > 0 && !conflictAck.checked);
  webButton.disabled = !currentTimetable;
}

function weekDateLabel(week: number): string {
  if (!currentTimetable) return `第 ${week} 周`;
  const start = addDaysIso(currentTimetable.term.semesterStart, (week - 1) * 7);
  const end = addDaysIso(start, 6);
  return `${start.slice(5).replace("-", "/")}–${end.slice(5).replace("-", "/")}`;
}

function currentTeachingWeek(): number {
  if (!currentTimetable) return 1;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const offset = daysBetween(currentTimetable.term.semesterStart, today);
  return Math.min(currentTimetable.term.teachingWeeks, Math.max(1, Math.floor(offset / 7) + 1));
}

function eventKind(index: number): "normal" | "rescheduled" | "makeup" | "changed" {
  const timetable = currentTimetable;
  const event = currentBuild?.events[index];
  if (!timetable || !event) return "normal";
  const overrides = timetable.overrides.filter(
    (override) => override.confirmed && override.courseId === event.courseId && override.meetingId === event.meetingId,
  );
  if (overrides.some((override) => override.type === "reschedule" && override.newDate === event.date)) return "rescheduled";
  if (overrides.some((override) => override.type === "makeup" && override.newDate === event.date)) return "makeup";
  if (
    overrides.some(
      (override) =>
        (override.type === "room_change" || override.type === "teacher_change" || override.type === "period_change") &&
        override.originalDate === event.date,
    )
  ) {
    return "changed";
  }
  return "normal";
}

function kindLabel(kind: ReturnType<typeof eventKind>): string {
  return { normal: "正常", rescheduled: "调课", makeup: "补课", changed: "变更" }[kind];
}

function renderWeekBoard(): void {
  if (!currentTimetable || !currentBuild) return;
  const maxWeek = Math.max(currentTimetable.term.teachingWeeks, ...currentBuild.events.map((event) => event.week), 1);
  selectedWeek = Math.min(maxWeek, Math.max(1, selectedWeek));
  weekLabel.textContent = `第 ${selectedWeek} 周 · ${weekDateLabel(selectedWeek)}`;
  weekRuler.replaceChildren();
  let selectedButton: HTMLButtonElement | null = null;
  for (let week = 1; week <= maxWeek; week += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "week-notch";
    button.textContent = String(week).padStart(2, "0");
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(week === selectedWeek));
    button.setAttribute("aria-label", `第 ${week} 周，${weekDateLabel(week)}`);
    if (week === selectedWeek) selectedButton = button;
    button.addEventListener("click", () => {
      selectedWeek = week;
      renderWeekBoard();
    });
    weekRuler.append(button);
  }
  if (selectedButton) {
    requestAnimationFrame(() => {
      const target = selectedButton;
      if (!target) return;
      weekRuler.scrollLeft = Math.max(0, target.offsetLeft - weekRuler.clientWidth / 2 + target.offsetWidth / 2);
    });
  }

  const conflictIndexes = new Set(currentBuild.conflicts.flatMap((conflict) => conflict.eventIndexes));
  const events = currentBuild.events
    .map((event, index) => ({ event, index, kind: eventKind(index), conflict: conflictIndexes.has(index) }))
    .filter((item) => item.event.week === selectedWeek)
    .sort((left, right) => left.event.startDateTime.localeCompare(right.event.startDateTime));
  weekAgenda.replaceChildren();
  weekEmpty.hidden = events.length > 0;
  for (const item of events) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `agenda-item kind-${item.kind}${item.conflict ? " is-conflict" : ""}`;
    const time = document.createElement("span");
    time.className = "agenda-time";
    time.textContent = `${weekdayZh(item.event.weekday)} ${item.event.start}–${item.event.end}`;
    const body = document.createElement("span");
    body.className = "agenda-body";
    const title = document.createElement("strong");
    title.textContent = item.event.title;
    const meta = document.createElement("small");
    meta.textContent = [item.event.room, item.event.teacher, kindLabel(item.kind)].filter(Boolean).join(" · ");
    body.append(title, meta);
    const code = document.createElement("span");
    code.className = "agenda-code";
    code.textContent = `${item.event.startPeriod}-${item.event.endPeriod}`;
    button.append(time, body, code);
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      const expanded = button.classList.toggle("expanded");
      button.setAttribute("aria-expanded", String(expanded));
    });
    weekAgenda.append(button);
  }
}

async function renderTimetable(timetable: NormalizedTimetableV2, descriptorLabel?: string): Promise<void> {
  currentTimetable = timetable;
  currentTimetable.term.semesterStart = mondayOfIso(currentTimetable.term.semesterStart);
  currentTimetable.validation = inspectTimetableV2(currentTimetable).report;
  const build = await buildV2Events(currentTimetable);
  currentBuild = build;
  selectedWeek = currentTeachingWeek();
  currentEventCount = build.events.length;
  currentConflictCount = build.conflicts.length;
  resultPanel.hidden = false;
  resultTitle.textContent = descriptorLabel || currentTimetable.source.schoolName || currentTimetable.source.adapterId;
  validationBadge.textContent = currentTimetable.validation.status.toUpperCase();
  validationBadge.dataset.status = currentTimetable.validation.status;
  courseCount.textContent = String(currentTimetable.courses.length);
  meetingCount.textContent = String(currentTimetable.validation.completeness.meetingCount);
  eventCount.textContent = String(build.events.length);
  conflictCount.textContent = String(build.conflicts.length);
  warningList.replaceChildren();
  const warnings = [
    ...(currentTimetable.warnings ?? []),
    ...build.issues.filter((issue) => issue.severity !== "error").map((issue) => issue.message),
  ];
  for (const warning of warnings.slice(0, 20)) {
    const line = document.createElement("div");
    line.textContent = `• ${warning}`;
    warningList.append(line);
  }
  warningList.hidden = warnings.length === 0;
  provenanceLine.textContent = [
    currentTimetable.source.schoolName || currentTimetable.source.adapterId,
    currentTimetable.term.termId,
    `第 1 周 ${currentTimetable.term.semesterStart}`,
    `${currentTimetable.courses.length} 门 / ${currentTimetable.validation.completeness.meetingCount} 个上课实例`,
  ].join(" · ");
  renderWeekBoard();
  if (build.issues.some((issue) => issue.severity === "error")) {
    showError(build.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join("\n"));
  } else {
    clearError();
  }
  ackRow.hidden = currentConflictCount === 0;
  conflictAck.checked = false;
  await refreshDownloadState();
}

async function loadActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab ?? null;
  pageLabel.textContent = tab?.url
    ? `${tab.title ?? "当前页"} · ${new URL(tab.url).hostname}`
    : "无法读取当前标签页";
}

function readSemester() {
  let start = startDate.value || defaultDate();
  try {
    start = mondayOfIso(start);
    startDate.value = start;
  } catch {
    throw new Error("第 1 周周一日期无效");
  }
  const weeks = Number(teachingWeeks.value || 20);
  if (!Number.isInteger(weeks) || weeks < 1) throw new Error("教学周数必须是正整数");
  const name = termName.value.trim() || `${academicYear.value.trim() || "当前"} 课表`;
  termName.value = name;
  return {
    academicYear: academicYear.value.trim() || undefined,
    termCode: termCode.value.trim() || undefined,
    termName: name,
    semesterStart: start,
    teachingWeeks: weeks,
    timezone: "Asia/Shanghai",
  };
}

async function extract(): Promise<void> {
  clearError();
  resultPanel.hidden = true;
  currentTimetable = null;
  extractButton.disabled = true;
  setStatus("working", "正在检测并执行只读提取…");
  try {
    const semester = readSemester();
    if (!currentTab?.id) throw new Error("没有可用的活动标签页");
    await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, files: ["content.js"] });
    const response = (await chrome.tabs.sendMessage(currentTab.id, {
      type: "terics.extract",
      semester,
      preferredAdapterId: adapterSelect.value || undefined,
    })) as ExtractResponse;
    if (!response?.ok || !response.timetable) {
      throw new Error(response?.error || "提取失败");
    }
    currentTimetable = response.timetable;
    currentTimetable.warnings = response.warnings ?? response.timetable.warnings ?? [];
    academicYear.value = currentTimetable.term.academicYear;
    termCode.value = currentTimetable.term.termCode;
    termName.value = currentTimetable.term.termName;
    startDate.value = currentTimetable.term.semesterStart;
    teachingWeeks.value = String(currentTimetable.term.teachingWeeks);
    await renderTimetable(currentTimetable, response.detection?.schoolName);
    await chrome.storage.local.set({ [STORAGE_KEY]: currentTimetable });
    setStatus(
      "success",
      `已提取 · ${response.detection?.adapterId ?? currentTimetable.source.adapterId} · 置信度 ${Math.round((response.detection?.confidence ?? 1) * 100)}%`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus("error", "提取失败");
    showError(message);
  } finally {
    extractButton.disabled = false;
  }
}

async function loadStored(): Promise<void> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as NormalizedTimetableV2 | undefined;
  if (!value) return;
  const inspected = inspectTimetableV2(value);
  if (!inspected.valid) {
    await chrome.storage.local.remove(STORAGE_KEY);
    return;
  }
  currentTimetable = value;
  startDate.value = value.term.semesterStart;
  teachingWeeks.value = String(value.term.teachingWeeks);
  academicYear.value = value.term.academicYear;
  termCode.value = value.term.termCode;
  termName.value = value.term.termName;
  await renderTimetable(value);
  setStatus("success", "已恢复上次本地提取");
}

async function clearLocalData(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
  currentTimetable = null;
  currentBuild = null;
  resultPanel.hidden = true;
  weekRuler.replaceChildren();
  weekAgenda.replaceChildren();
  clearError();
  setStatus("idle", "本地数据已清除");
}

async function init(): Promise<void> {
  startDate.value = defaultDate();
  for (const manifest of connectorManifests()) {
    const option = document.createElement("option");
    option.value = manifest.id;
    option.textContent = manifest.schoolName
      ? `${manifest.schoolName} · ${manifest.vendorLabel}`
      : `${manifest.vendorLabel} · ${manifest.status}`;
    adapterSelect.append(option);
  }
  await loadActiveTab();
  await loadStored();
}

extractButton.addEventListener("click", () => void extract());
conflictAck.addEventListener("change", () => void refreshDownloadState());
jsonButton.addEventListener("click", () => {
  if (!currentTimetable) return;
  downloadBlob(
    `terics-${currentTimetable.term.termId}.terics.json`,
    serializeTericsJson(currentTimetable),
    "application/json;charset=utf-8",
  );
});
icsButton.addEventListener("click", async () => {
  if (!currentTimetable) return;
  try {
    const output = await generateIcsV2(currentTimetable, { alarmMinutes: 0 });
    downloadBlob(suggestedIcsV2FileName(currentTimetable), output.ics, "text/calendar;charset=utf-8");
    setStatus("success", `ICS 已生成 · ${output.events.length} 个事件 · ${currentEventCount} 个预览事件`);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
});
webButton.addEventListener("click", async () => {
  if (!currentTimetable) return;
  try {
    const fragment = encodeTericsFragment(currentTimetable);
    const url = `${WEB_APP_URL}#${fragment}`;
    if (url.length > 1_500_000) throw new Error("课表数据过大，请下载 .terics.json 后手动导入 Web");
    await chrome.tabs.create({ url });
    setStatus("success", "已通过 URL 片段交给 Web；片段不会发送到服务器");
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
});
clearButton.addEventListener("click", () => void clearLocalData());
void init();
