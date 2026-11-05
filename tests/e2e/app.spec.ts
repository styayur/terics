import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import ICAL from "ical.js";
import { encodeTericsFragment, parseTericsJson } from "../../src/v2/exchange";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "把教务课表变成日历事件" })).toBeVisible();
  await expect(page.getByText("LOCAL / 0 UPLOAD")).toBeVisible();
  (page as typeof page & { __consoleErrors?: string[] }).__consoleErrors = errors;
});

test.afterEach(async ({ page }) => {
  const errors = (page as typeof page & { __consoleErrors?: string[] }).__consoleErrors ?? [];
  expect(errors).toEqual([]);
});

test("loads a CSV sample, previews events and downloads a parseable ICS", async ({ page }) => {
  await page.getByRole("button", { name: /CSV \/ 结构化清单/ }).click();
  await expect(page.locator("#parse-status-text")).toContainText("已识别", { timeout: 15_000 });
  await expect(page.locator("#parsed-course-count")).toHaveText("6");
  await expect(page.locator("#event-count")).toHaveText("62");
  await expect(page.locator("#conflict-count")).toHaveText("0");
  await expect(page.locator("#export-button")).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/课表-2026-08-31\.ics$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const ics = await readFile(path!, "utf8");
  expect(ics).toContain("BEGIN:VCALENDAR\r\n");
  expect(ics).toContain("TZID:Asia/Shanghai");
  const calendar = new ICAL.Component(ICAL.parse(ics));
  expect(calendar.getAllSubcomponents("vevent")).toHaveLength(62);
});

test("loads the HTML and XLSX samples with the same preview pipeline", async ({ page }) => {
  await page.getByRole("button", { name: /HTML \/ 青果列表/ }).click();
  await expect(page.locator("#parsed-course-count")).toHaveText("5", { timeout: 15_000 });
  await page.getByRole("button", { name: /XLSX \/ 周网格/ }).click();
  await expect(page.locator("#parsed-course-count")).toHaveText("5", { timeout: 15_000 });
  await expect(page.locator("#detected-format")).toContainText("XLSX");
  await expect(page.locator("#event-count")).toHaveText("64");
});

test("requires explicit acknowledgement before exporting conflicts", async ({ page }) => {
  await page.locator("#file-input").setInputFiles("fixtures/csv/conflict_sample.csv");
  await expect(page.locator("#conflict-count")).toHaveText("2", { timeout: 15_000 });
  await expect(page.locator("#export-button")).toBeDisabled();
  await page.locator("#conflict-ack").check();
  await expect(page.locator("#export-button")).toBeEnabled();
});

test("imports a terics v2 exchange sample and exports v2 ICS", async ({ page }) => {
  await page.getByRole("button", { name: /\.terics\.json \/ 扩展交接/ }).click();
  await expect(page.locator("#parsed-course-count")).toHaveText("2", { timeout: 15_000 });
  await expect(page.locator("#event-count")).toHaveText("11");
  await expect(page.locator("#detected-format")).toContainText("金智");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const download = await downloadPromise;
  const path = await download.path();
  const ics = await readFile(path!, "utf8");
  const calendar = new ICAL.Component(ICAL.parse(ics));
  expect(calendar.getAllSubcomponents("vevent")).toHaveLength(11);
});

test("accepts extension data through a URL fragment without a server upload", async ({ page }) => {
  const fixtureText = await readFile("fixtures/exchange/terics-example.terics.json", "utf8");
  const fragment = encodeTericsFragment(parseTericsJson(fixtureText));
  await page.goto(`/#${fragment}`);
  await expect(page.locator("#parsed-course-count")).toHaveText("2", { timeout: 15_000 });
  await expect(page.locator("#event-count")).toHaveText("11");
  expect(new URL(page.url()).hash).toBe("");
});

test("shows Google sync as explicitly disabled when OAuth is not configured", async ({ page }) => {
  await expect(page.locator("#google-unavailable")).toBeVisible();
  await expect(page.locator("#google-unavailable")).toContainText("VITE_GOOGLE_CLIENT_ID");
});

test("applies a custom period time to the generated event preview", async ({ page }) => {
  await page.getByRole("button", { name: /CSV \/ 结构化清单/ }).click();
  await expect(page.locator("#parsed-course-count")).toHaveText("6", { timeout: 15_000 });
  await page.getByLabel("第 1 节开始时间").fill("08:15");
  await page.getByLabel("第 1 节开始时间").dispatchEvent("change");
  await page.locator("#view-list").click();
  await expect(page.locator("#event-table-body tr").first()).toContainText("08:15");
  await expect(page.locator("#export-button")).toBeEnabled();
});

test("renders the teaching-week ruler, timetable grid and course detail", async ({ page }) => {
  await expect(page.locator("#preview-empty")).toBeVisible();
  await expect(page.locator("#timetable-shell")).toBeHidden();
  await page.getByRole("button", { name: /CSV \/ 结构化清单/ }).click();
  await expect(page.locator("#timetable-shell")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#week-ruler .week-notch")).toHaveCount(20);
  await expect(page.locator(".course-block")).not.toHaveCount(0);
  await page.locator(".course-block").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#course-detail")).toBeVisible();
  await expect(page.locator("#course-detail-title")).not.toBeEmpty();
  await page.keyboard.press("Escape");
  await expect(page.locator("#course-detail")).toBeHidden();
  await page.locator("#week-ruler .week-notch").nth(1).click();
  await expect(page.locator("#current-week-label")).toContainText("第 2 周");
  await expect(page.locator("#week-filter")).toHaveValue("2");
});

test("renders cancellation, reschedule and makeup states from v2 overrides", async ({ page }) => {
  await page.locator("#file-input").setInputFiles("fixtures/exchange/overrides.terics.json");
  await expect(page.locator("#timetable-shell")).toBeVisible({ timeout: 15_000 });
  await page.locator("#week-ruler .week-notch").nth(1).click();
  await expect(page.locator('.course-block[data-kind="cancelled"]')).toHaveCount(1);
  await page.locator("#week-ruler .week-notch").nth(2).click();
  await expect(page.locator('.course-block[data-kind="rescheduled"]')).toHaveCount(1);
  await page.locator("#week-ruler .week-notch").nth(3).click();
  await expect(page.locator('.course-block[data-kind="makeup"]')).toHaveCount(1);
});

test("keeps the body within the mobile viewport while the timetable scrolls locally", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /CSV \/ 结构化清单/ }).click();
  await expect(page.locator("#timetable-shell")).toBeVisible({ timeout: 15_000 });
  const widths = await page.evaluate(() => ({
    body: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    timetable: document.querySelector<HTMLElement>("#timetable-scroll")?.scrollWidth ?? 0,
    timetableClient: document.querySelector<HTMLElement>("#timetable-scroll")?.clientWidth ?? 0,
  }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
  expect(widths.timetable).toBeGreaterThan(widths.timetableClient);
});
