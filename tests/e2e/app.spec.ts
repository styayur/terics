import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import ICAL from "ical.js";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "把课表变成日历事件" })).toBeVisible();
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

test("applies a custom period time to the generated event preview", async ({ page }) => {
  await page.getByRole("button", { name: /CSV \/ 结构化清单/ }).click();
  await expect(page.locator("#parsed-course-count")).toHaveText("6", { timeout: 15_000 });
  await page.getByLabel("第 1 节开始时间").fill("08:15");
  await page.getByLabel("第 1 节开始时间").dispatchEvent("change");
  await expect(page.locator("#event-table-body tr").first()).toContainText("08:15");
  await expect(page.locator("#export-button")).toBeEnabled();
});
