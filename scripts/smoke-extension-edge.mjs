import { chromium } from "@playwright/test";
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
await page.goto(`chrome-extension://${extensionId}/popup.html`);
await page.locator("h1").waitFor();
const manifest = await page.evaluate(() => chrome.runtime.getManifest());
if (manifest.manifest_version !== 3) throw new Error("manifest is not MV3");
console.log(
  JSON.stringify(
    {
      extensionId,
      heading: await page.locator("h1").innerText(),
      version: manifest.version_name ?? manifest.version,
      permissions: manifest.permissions,
      worker: worker.url(),
    },
    null,
    2,
  ),
);
await Promise.race([context.close(), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000))]);
process.exit(0);
