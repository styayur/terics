import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

if (process.platform !== "win32") {
  console.error("This smoke test requires Windows Microsoft Edge.");
  process.exit(2);
}
const extensionPath = resolve("extension-dist");
const context = await chromium.launchPersistentContext("", {
  channel: "msedge",
  headless: false,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
let workers = context.serviceWorkers();
if (workers.length === 0) workers = [await context.waitForEvent("serviceworker", { timeout: 15_000 })];
const worker = workers[0];
if (!worker) throw new Error("MV3 service worker did not register");
const extensionId = new URL(worker.url()).host;
const page = await context.newPage();
await page.setViewportSize({ width: 410, height: 900 });
await page.goto(`chrome-extension://${extensionId}/popup.html`);
await page.locator("h1").waitFor();
const manifest = await page.evaluate(() => chrome.runtime.getManifest());
if (manifest.manifest_version !== 3) throw new Error("manifest is not MV3");
const fixture = JSON.parse(readFileSync(resolve("fixtures/exchange/whut-real-shape.terics.json"), "utf8"));
await page.evaluate(async (value) => chrome.storage.local.set({ tericsLastExtraction: value }), fixture);
await page.reload();
await page.locator("#week-ruler .week-notch").first().waitFor({ timeout: 15_000 });
const weekCount = await page.locator("#week-ruler .week-notch").count();
const agendaCount = await page.locator("#week-agenda .agenda-item").count();
if (weekCount === 0) throw new Error("week ruler did not render");
if (agendaCount === 0) throw new Error("week agenda did not render");
mkdirSync("test-results", { recursive: true });
const screenshot = resolve("test-results/extension-popup-v0.5.0-rc.2.png");
await page.screenshot({ path: screenshot, fullPage: true });
const boardScreenshot = resolve("test-results/extension-week-board-v0.5.0-rc.2.png");
await page.locator(".week-board").screenshot({ path: boardScreenshot });
console.log(
  JSON.stringify(
    {
      extensionId,
      heading: await page.locator("h1").innerText(),
      version: manifest.version_name ?? manifest.version,
      permissions: manifest.permissions,
      worker: worker.url(),
      weekCount,
      agendaCount,
      screenshot,
      boardScreenshot,
    },
    null,
    2,
  ),
);
await Promise.race([context.close(), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000))]);
process.exit(0);
