import "./styles.css";
import { buildEvents } from "./core/course";
import { mondayOfIso, weekdayZh } from "./core/dates";
import { TericsParseError } from "./core/errors";
import { generateIcs, suggestedFileName } from "./core/ics";
import { parseTimetableFile } from "./core/parsers";
import {
  DEFAULT_PERIODS,
  TIMEZONE,
  type BuildResult,
  type ParseIssue,
  type ParseResult,
  type RawCourse,
  type SemesterConfig,
} from "./core/types";

const STEP_ORDER = ["select", "detect", "timing", "preview", "export"] as const;
type StepName = (typeof STEP_ORDER)[number];

interface AppState {
  parsed: ParseResult | null;
  sourceName: string;
  sourceSize: number;
  build: BuildResult | null;
  issues: ParseIssue[];
  busy: boolean;
  lastExportedCount: number;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`缺少界面元素 #${id}`);
  return found as T;
}

const fileInput = element<HTMLInputElement>("file-input");
const dropzone = element<HTMLDivElement>("dropzone");
const parseStatus = element<HTMLDivElement>("parse-status");
const parseStatusText = element<HTMLSpanElement>("parse-status-text");
const parseReadout = element<HTMLDivElement>("parse-readout");
const sourceFile = element<HTMLElement>("source-file");
const sourceMeta = element<HTMLElement>("source-meta");
const detectedFormat = element<HTMLElement>("detected-format");
const detectedConfidence = element<HTMLElement>("detected-confidence");
const parsedCourseCount = element<HTMLElement>("parsed-course-count");
const issueBox = element<HTMLDivElement>("issue-box");
const issueList = element<HTMLUListElement>("issue-list");
const issueCount = element<HTMLElement>("issue-count");
const settingsPanel = element<HTMLElement>("settings-panel");
const previewPanel = element<HTMLElement>("preview-panel");
const calendarTitle = element<HTMLInputElement>("calendar-title");
const semesterStart = element<HTMLInputElement>("semester-start");
const mondayHint = element<HTMLElement>("monday-hint");
const alarmMinutes = element<HTMLSelectElement>("alarm-minutes");
const periodGrid = element<HTMLDivElement>("period-grid");
const resetPeriods = element<HTMLButtonElement>("reset-periods");
const weekFilter = element<HTMLSelectElement>("week-filter");
const courseFilter = element<HTMLInputElement>("course-filter");
const previewEmpty = element<HTMLDivElement>("preview-empty");
const previewTableWrap = element<HTMLDivElement>("preview-table-wrap");
const eventTableBody = element<HTMLTableSectionElement>("event-table-body");
const tableOverflowNote = element<HTMLDivElement>("table-overflow-note");
const conflictBox = element<HTMLDivElement>("conflict-box");
const conflictList = element<HTMLUListElement>("conflict-list");
const conflictAck = element<HTMLInputElement>("conflict-ack");
const eventCount = element<HTMLElement>("event-count");
const dateRange = element<HTMLElement>("date-range");
const conflictCount = element<HTMLElement>("conflict-count");
const weekCount = element<HTMLElement>("week-count");
const exportEventCount = element<HTMLElement>("export-event-count");
const exportFirstDate = element<HTMLElement>("export-first-date");
const exportLastDate = element<HTMLElement>("export-last-date");
const exportButton = element<HTMLButtonElement>("export-button");
const exportState = element<HTMLElement>("export-state");
const toast = element<HTMLDivElement>("toast");

const state: AppState = {
  parsed: null,
  sourceName: "",
  sourceSize: 0,
  build: null,
  issues: [],
  busy: false,
  lastExportedCount: 0,
};

function defaultConfig(): SemesterConfig {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const september = month >= 7;
  const anchor = september ? `${year}-09-01` : `${year}-03-01`;
  return {
    title: `${year} ${september ? "秋季" : "春季"}课表`,
    semesterStart: mondayOfIso(anchor),
    timezone: TIMEZONE,
    periods: DEFAULT_PERIODS.map((period) => ({ ...period })),
    alarmMinutes: 10,
  };
}

const config = defaultConfig();
let rebuildGeneration = 0;
let toastTimer: number | undefined;

function setStatus(kind: "idle" | "working" | "success" | "error", text: string): void {
  parseStatus.className = `status-chip ${kind}`;
  parseStatusText.textContent = text;
}

function setActiveStep(step: StepName): void {
  const activeIndex = STEP_ORDER.indexOf(step);
  document.querySelectorAll<HTMLElement>("#steps li").forEach((item) => {
    const itemIndex = STEP_ORDER.indexOf(item.dataset.step as StepName);
    item.classList.toggle("active", itemIndex === activeIndex);
    item.classList.toggle("done", itemIndex < activeIndex);
  });
}

function showToast(message: string, kind: "normal" | "error" = "normal"): void {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast${kind === "error" ? " error" : ""}`;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 5_000);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function sourceDetails(parsed: ParseResult): string {
  const parts = [parsed.metadata.detectedEncoding ?? "encoding: n/a"];
  if (parsed.metadata.tableCount !== undefined) parts.push(`${parsed.metadata.tableCount} tables`);
  if (parsed.metadata.sheetName) parts.push(parsed.metadata.sheetName);
  if (parsed.metadata.sourceRows !== undefined) parts.push(`${parsed.metadata.sourceRows} rows`);
  return parts.join(" · ");
}

function renderIssueBox(issues: ParseIssue[]): void {
  state.issues = issues;
  issueList.replaceChildren();
  if (issues.length === 0) {
    issueBox.hidden = true;
    issueCount.textContent = "0";
    return;
  }
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  issueCount.textContent = `${issues.length} 条 · ${errorCount} 错误`;
  for (const issue of issues.slice(0, 80)) {
    const item = document.createElement("li");
    item.className = issue.severity;
    item.textContent = `[${issue.severity.toUpperCase()}] ${issue.message}${issue.hint ? ` — ${issue.hint}` : ""}`;
    issueList.append(item);
  }
  if (issues.length > 80) {
    const item = document.createElement("li");
    item.textContent = `另有 ${issues.length - 80} 条提示未显示`;
    issueList.append(item);
  }
  issueBox.hidden = false;
}

function renderParseReadout(parsed: ParseResult): void {
  sourceFile.textContent = state.sourceName;
  sourceFile.title = state.sourceName;
  sourceMeta.textContent = `${formatBytes(state.sourceSize)} · ${sourceDetails(parsed)}`;
  detectedFormat.textContent = parsed.formatLabel;
  detectedConfidence.textContent = `${Math.round(parsed.confidence * 100)}%`;
  parsedCourseCount.textContent = String(parsed.courses.length);
  parseReadout.hidden = false;
}

function renderPeriodGrid(): void {
  periodGrid.replaceChildren();
  for (const period of config.periods) {
    const cell = document.createElement("div");
    cell.className = "period-cell";

    const index = document.createElement("span");
    index.className = "period-index";
    index.textContent = String(period.index).padStart(2, "0");

    const start = document.createElement("input");
    start.type = "time";
    start.step = "60";
    start.value = period.start;
    start.dataset.index = String(period.index);
    start.dataset.field = "start";
    start.setAttribute("aria-label", `第 ${period.index} 节开始时间`);

    const divider = document.createElement("span");
    divider.className = "period-divider";
    divider.textContent = "–";

    const end = document.createElement("input");
    end.type = "time";
    end.step = "60";
    end.value = period.end;
    end.dataset.index = String(period.index);
    end.dataset.field = "end";
    end.setAttribute("aria-label", `第 ${period.index} 节结束时间`);

    cell.append(index, start, divider, end);
    periodGrid.append(cell);
  }
}

function syncConfigFields(): void {
  calendarTitle.value = config.title;
  semesterStart.value = config.semesterStart;
  alarmMinutes.value = String(config.alarmMinutes);
  renderPeriodGrid();
}

function clearCalendarOutputs(message = "解析文件后，这里会按实际日期展开每一周课程。"): void {
  state.build = null;
  eventTableBody.replaceChildren();
  previewTableWrap.hidden = true;
  previewEmpty.hidden = false;
  previewEmpty.querySelector("p")!.textContent = message;
  conflictBox.hidden = true;
  conflictAck.checked = false;
  eventCount.textContent = "0";
  dateRange.textContent = "—";
  conflictCount.textContent = "0";
  weekCount.textContent = "—";
  exportEventCount.textContent = "0";
  exportFirstDate.textContent = "—";
  exportLastDate.textContent = "—";
  exportButton.disabled = true;
  exportState.textContent = "等待有效课表";
  weekFilter.replaceChildren(new Option("全部", "all"));
}

function showParseFailure(error: unknown): void {
  state.parsed = null;
  state.build = null;
  clearCalendarOutputs("请修正文件或解析提示后重新选择文件。");
  settingsPanel.classList.add("is-dormant");
  previewPanel.classList.add("is-dormant");
  setStatus("error", "识别失败");
  setActiveStep("detect");
  parseReadout.hidden = false;
  sourceFile.textContent = state.sourceName || "未知文件";
  sourceMeta.textContent = `${formatBytes(state.sourceSize)} · 未确认格式`;
  detectedFormat.textContent = "识别失败";
  detectedConfidence.textContent = "—";
  parsedCourseCount.textContent = "0";
  const issues = error instanceof TericsParseError ? error.issues : [];
  renderIssueBox(
    issues.length
      ? issues
      : [
          {
            severity: "error",
            code: "unexpected",
            message: error instanceof Error ? error.message : String(error),
            hint: "请确认文件不是扫描图片、加密工作簿或旧版二进制 XLS。",
          },
        ],
  );
  showToast(error instanceof Error ? error.message : "文件解析失败", "error");
}

async function addIssueForBuild(build: BuildResult): Promise<void> {
  const parseIssues = state.parsed?.issues ?? [];
  renderIssueBox([...parseIssues, ...build.issues]);
}

function clearConflictState(): void {
  conflictBox.hidden = true;
  conflictAck.checked = false;
  conflictList.replaceChildren();
}

function updateExportButton(): void {
  const hasEvents = Boolean(state.build && state.build.events.length > 0);
  const hasErrors = state.issues.some((issue) => issue.severity === "error");
  const unresolvedConflict = Boolean(state.build && state.build.conflicts.length > 0 && !conflictAck.checked);
  exportButton.disabled = state.busy || !hasEvents || hasErrors || unresolvedConflict;
  if (!hasEvents || hasErrors) {
    exportState.textContent = hasErrors ? "配置存在错误，暂不可导出" : "等待有效课表";
  } else if (unresolvedConflict) {
    exportState.textContent = "请先确认课程冲突";
  } else {
    exportState.textContent = "READY · RFC 5545 · Asia/Shanghai";
  }
}

function setConflictEvents(conflictIndexes: Set<number>): void {
  eventTableBody.querySelectorAll<HTMLTableRowElement>("tr[data-event-index]").forEach((row) => {
    const index = Number(row.dataset.eventIndex);
    row.classList.toggle("is-conflict", conflictIndexes.has(index));
  });
}

function renderWeekFilter(build: BuildResult): void {
  const previous = weekFilter.value;
  const weeks = [...new Set(build.events.map((event) => event.week))].sort((a, b) => a - b);
  weekFilter.replaceChildren(new Option("全部", "all"));
  for (const week of weeks) weekFilter.append(new Option(`第 ${week} 周`, String(week)));
  if ([...weekFilter.options].some((option) => option.value === previous)) weekFilter.value = previous;
}

function renderPreview(): void {
  const build = state.build;
  if (!build || build.events.length === 0) return;

  const selectedWeek = weekFilter.value;
  const query = courseFilter.value.trim().toLocaleLowerCase("zh-CN");
  const filtered = build.events.filter((event) => {
    if (selectedWeek !== "all" && event.week !== Number(selectedWeek)) return false;
    if (!query) return true;
    return [event.title, event.teacher, event.location]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(query);
  });

  eventTableBody.replaceChildren();
  previewEmpty.hidden = filtered.length > 0;
  previewTableWrap.hidden = filtered.length === 0;
  if (filtered.length === 0) {
    previewEmpty.querySelector("p")!.textContent = "当前筛选条件下没有课程。";
    return;
  }

  const conflictIndexes = new Set(build.conflicts.flatMap((conflict) => conflict.eventIndexes));
  const limit = 300;
  for (const event of filtered.slice(0, limit)) {
    const index = build.events.indexOf(event);
    const row = document.createElement("tr");
    row.dataset.eventIndex = String(index);
    const values = [
      event.date,
      weekdayZh(event.weekday),
      `${event.start}–${event.end}`,
      event.title,
      `${event.startPeriod}-${event.endPeriod}`,
      event.teacher || "—",
      event.location || "—",
    ];
    for (const [cellIndex, value] of values.entries()) {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (cellIndex === 3) cell.className = "course-name";
      row.append(cell);
    }
    eventTableBody.append(row);
  }
  setConflictEvents(conflictIndexes);
  tableOverflowNote.hidden = filtered.length <= limit;
  tableOverflowNote.textContent =
    filtered.length > limit ? `仅显示前 ${limit} 条；导出 ICS 将包含全部 ${filtered.length} 条筛选结果之外的完整课表。` : "";
}

function renderConflicts(build: BuildResult): void {
  conflictList.replaceChildren();
  if (build.conflicts.length === 0) {
    clearConflictState();
    return;
  }
  conflictBox.hidden = false;
  for (const conflict of build.conflicts) {
    const item = document.createElement("li");
    item.textContent = `${conflict.date} ${conflict.start}–${conflict.end}：${conflict.labels.join(" / ")}`;
    conflictList.append(item);
  }
  conflictAck.checked = false;
}

async function rebuild(): Promise<void> {
  if (!state.parsed) return;
  const parseResult = state.parsed;
  const generation = ++rebuildGeneration;
  state.busy = true;
  exportButton.disabled = true;
  const courses: RawCourse[] = parseResult.courses.map((course) => ({ ...course, weeks: [...course.weeks] }));
  const build = await buildEvents(config, courses);
  if (generation !== rebuildGeneration) return;
  state.busy = false;
  state.build = build;
  await addIssueForBuild(build);

  if (build.issues.some((issue) => issue.severity === "error") || build.events.length === 0) {
    state.build = build;
    previewTableWrap.hidden = true;
    previewEmpty.hidden = false;
    previewEmpty.querySelector("p")!.textContent = "时间参数存在错误，请先修正上方字段。";
    conflictBox.hidden = true;
    eventCount.textContent = "0";
    dateRange.textContent = "—";
    conflictCount.textContent = "0";
    weekCount.textContent = "—";
    exportEventCount.textContent = "0";
    exportFirstDate.textContent = "—";
    exportLastDate.textContent = "—";
    setActiveStep("timing");
    updateExportButton();
    return;
  }

  const weeks = [...new Set(build.events.map((event) => event.week))];
  eventCount.textContent = String(build.events.length);
  dateRange.textContent = `${build.events[0]?.date ?? "—"} → ${build.events.at(-1)?.date ?? "—"}`;
  conflictCount.textContent = String(build.conflicts.length);
  weekCount.textContent = String(weeks.length);
  exportEventCount.textContent = String(build.events.length);
  exportFirstDate.textContent = build.events[0]?.date ?? "—";
  exportLastDate.textContent = build.events.at(-1)?.date ?? "—";
  renderWeekFilter(build);
  renderConflicts(build);
  renderPreview();
  setActiveStep("preview");
  updateExportButton();
}

async function processBytes(name: string, bytes: Uint8Array): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  state.sourceName = name;
  state.sourceSize = bytes.byteLength;
  state.parsed = null;
  state.build = null;
  settingsPanel.classList.add("is-dormant");
  previewPanel.classList.add("is-dormant");
  clearCalendarOutputs();
  renderIssueBox([]);
  parseReadout.hidden = true;
  setStatus("working", "正在内容嗅探");
  setActiveStep("detect");
  try {
    const parsed = await parseTimetableFile({ fileName: name, bytes });
    state.parsed = parsed;
    state.busy = false;
    setStatus("success", `${parsed.formatLabel} · 已识别`);
    renderParseReadout(parsed);
    renderIssueBox(parsed.issues);
    settingsPanel.classList.remove("is-dormant");
    previewPanel.classList.remove("is-dormant");
    setActiveStep("timing");
    syncConfigFields();
    await rebuild();
    showToast(`已识别 ${parsed.courses.length} 条课程记录`);
  } catch (error) {
    state.busy = false;
    showParseFailure(error);
  }
}

async function handleFile(file: File): Promise<void> {
  try {
    const buffer = await file.arrayBuffer();
    await processBytes(file.name, new Uint8Array(buffer));
  } catch (error) {
    state.busy = false;
    showParseFailure(error);
  }
}

async function loadSample(kind: string, button: HTMLButtonElement): Promise<void> {
  if (state.busy) return;
  const samples: Record<string, string> = {
    csv: "csv-sample.csv",
    html: "html-list-sample.xls",
    xlsx: "xlsx-grid-sample.xlsx",
  };
  const sample = samples[kind];
  if (!sample) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "载入中…";
  try {
    const url = new URL(`./samples/${sample}`, document.baseURI);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`样本加载失败：HTTP ${response.status}`);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    await processBytes(sample, new Uint8Array(buffer));
  } catch (error) {
    showToast(error instanceof Error ? error.message : "样本载入失败", "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function normalizeStartDate(): void {
  const value = semesterStart.value;
  if (!value) {
    mondayHint.textContent = "请选择第 1 周周一。";
    return;
  }
  try {
    const monday = mondayOfIso(value);
    if (monday !== value) {
      semesterStart.value = monday;
      mondayHint.textContent = `已从 ${value} 自动对齐到周一 ${monday}。`;
    } else {
      mondayHint.textContent = "已确认周一。";
    }
    config.semesterStart = monday;
    void rebuild();
  } catch {
    mondayHint.textContent = "日期无效，请重新选择。";
  }
}

function updatePeriodFromInput(input: HTMLInputElement): void {
  const index = Number(input.dataset.index);
  const field = input.dataset.field;
  const period = config.periods.find((item) => item.index === index);
  if (!period || (field !== "start" && field !== "end")) return;
  const value = input.value;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    input.classList.add("invalid");
    showToast(`第 ${index} 节时间必须为 HH:mm`, "error");
    return;
  }
  input.classList.remove("invalid");
  period[field] = value;
  void rebuild();
}

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});
dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  const file = event.dataTransfer?.files[0];
  if (file) void handleFile(file);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void handleFile(file);
  fileInput.value = "";
});

document.querySelectorAll<HTMLButtonElement>("[data-sample]").forEach((button) => {
  button.addEventListener("click", () => void loadSample(button.dataset.sample ?? "", button));
});

calendarTitle.addEventListener("input", () => {
  config.title = calendarTitle.value.slice(0, 80);
  void rebuild();
});
semesterStart.addEventListener("change", normalizeStartDate);
alarmMinutes.addEventListener("change", () => {
  config.alarmMinutes = Number(alarmMinutes.value);
  void rebuild();
});
periodGrid.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement) updatePeriodFromInput(event.target);
});
resetPeriods.addEventListener("click", () => {
  config.periods = DEFAULT_PERIODS.map((period) => ({ ...period }));
  renderPeriodGrid();
  void rebuild();
});
weekFilter.addEventListener("change", renderPreview);
courseFilter.addEventListener("input", renderPreview);
conflictAck.addEventListener("change", updateExportButton);

exportButton.addEventListener("click", async () => {
  if (!state.parsed || !state.build || state.build.events.length === 0) return;
  exportButton.disabled = true;
  exportState.textContent = "正在生成 ICS…";
  try {
    const output = await generateIcs(config, state.parsed.courses);
    const blob = new Blob([output.ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = suggestedFileName(config);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
    state.lastExportedCount = output.build.events.length;
    exportState.textContent = `已生成 ${output.build.events.length} 个事件 · ${(blob.size / 1024).toFixed(1)} KiB`;
    setActiveStep("export");
    showToast(`ICS 已生成：${anchor.download}`);
  } catch (error) {
    exportState.textContent = "生成失败";
    renderIssueBox(
      error instanceof TericsParseError
        ? error.issues
        : [{ severity: "error", code: "export_failed", message: error instanceof Error ? error.message : String(error) }],
    );
    showToast(error instanceof Error ? error.message : "ICS 生成失败", "error");
  } finally {
    updateExportButton();
  }
});

syncConfigFields();
settingsPanel.classList.add("is-dormant");
previewPanel.classList.add("is-dormant");
setStatus("idle", "等待文件");
setActiveStep("select");
clearCalendarOutputs();
