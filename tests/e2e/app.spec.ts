import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import ICAL from "ical.js";
import { encodeTericsFragment, parseTericsJson } from "../../src/v2/exchange";
import { createPendingHandoff } from "../../src/extension/handoff";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bring your timetable." })).toBeVisible();
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

test("resolves a known university URL and keeps file fallback available", async ({ page }) => {
  await page.locator("#url-input").fill("https://jwxt.whut.edu.cn/jwapp/sys/homeapp/index.html#/home");
  await page.locator("#url-submit").click();
  await expect(page.locator("#url-result")).toBeVisible();
  await expect(page.locator("#url-result-school")).toContainText("武汉理工");
  await expect(page.locator("#url-result-status")).toHaveText("VERIFIED");
  await expect(page.locator("#url-result-connector")).toHaveText("whut-wisedu-jwapp");
  await expect(page.locator("#url-result-confidence")).toHaveText("99%");
  await expect(page.locator("#file-input")).toHaveCount(1);
});

test("resolves unknown systems without guessing an API and rejects unsafe URLs", async ({ page }) => {
  await page.locator("#url-input").fill("https://timetable.example.edu.cn/student");
  await page.locator("#url-submit").click();
  await expect(page.locator("#url-result-status")).toHaveText("UNKNOWN");
  await expect(page.locator("#url-result-connector")).toContainText("generic-dom");
  await expect(page.locator("#url-evidence")).toContainText("不会对未知网址发起自动抓取");

  await page.locator("#url-input").fill("javascript:alert(1)");
  await page.locator("#url-submit").click();
  await expect(page.locator("#url-input")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#issue-list")).toContainText("仅允许 HTTP 或 HTTPS");
});

test("extracts a URL from safe HTML drag data without rendering it", async ({ page }) => {
  await page.locator("#url-dropzone").evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.setData("text/html", '<script>window.__dropXss=1</script><a href="https://jwxt.whut.edu.cn/jwapp/sys/homeapp/index.html">portal</a>');
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.locator("#url-result-school")).toContainText("武汉理工");
  expect(await page.evaluate(() => (window as unknown as { __dropXss?: number }).__dropXss ?? 0)).toBe(0);
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

test("claims an opaque extension handoff and consumes the fragment", async ({ page }) => {
  const fixtureText = await readFile("fixtures/exchange/terics-example.terics.json", "utf8");
  const timetable = parseTericsJson(fixtureText);
  const handoff = await createPendingHandoff({
    timetable,
    extensionId: "a".repeat(32),
    now: new Date(),
  });
  const handoffPage = await page.context().newPage();
  await handoffPage.addInitScript(`
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          lastError: undefined,
          sendMessage: function (_extensionId, _message, callback) {
            callback({ ok: true, envelope: ${JSON.stringify(handoff.record.envelope)} });
          }
        }
      }
    });
  `);
  await handoffPage.goto(`/#${new URL(handoff.url).hash.slice(1)}`);
  await expect(handoffPage.locator("#parsed-course-count")).toHaveText("2", { timeout: 15_000 });
  await expect(handoffPage.locator("#event-count")).toHaveText("11");
  expect(new URL(handoffPage.url()).hash).toBe("");
  await handoffPage.close();
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

test("removes one whole course by exact courseId and downloads a non-overwriting JSON", async ({ page }) => {
  await page.getByRole("button", { name: /\.terics\.json \/ 扩展交接/ }).click();
  await expect(page.locator("#timetable-shell")).toBeVisible({ timeout: 15_000 });
  await page.locator(".course-block").first().click();
  await expect(page.locator("#remove-course")).toBeEnabled();
  await page.locator("#remove-course").click();
  await expect(page.locator("#course-removal")).toBeVisible();
  await expect(page.locator("#removal-course-id")).not.toBeEmpty();
  await page.locator("#removal-confirm").check();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#removal-submit").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("course-removed.terics.json");
  await expect(page.locator("#removal-report")).toContainText("本地文件 · SUCCESS");
  await expect(page.locator("#parsed-course-count")).toHaveText("1");
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
