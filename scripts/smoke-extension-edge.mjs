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
const screenshot = resolve("test-results/extension-popup-v0.6.0-rc.1.png");
await page.screenshot({ path: screenshot, fullPage: true });
const boardScreenshot = resolve("test-results/extension-week-board-v0.6.0-rc.1.png");
await page.locator(".week-board").screenshot({ path: boardScreenshot });
const webPagePromise = context.waitForEvent("page");
await page.locator("#web-button").click();
const webPage = await webPagePromise;
const webUrl = webPage.url();
if (!webUrl.includes("#terics-handoff=1")) throw new Error("Web handoff URL is missing the opaque protocol marker");
if (webUrl.includes("payload") || webUrl.includes("terics-data=")) throw new Error("Web handoff URL leaked timetable payload");
const pending = await page.evaluate(async () => {
  const result = await chrome.storage.local.get("tericsPendingHandoff");
  const record = result.tericsPendingHandoff;
  return record ? { consumed: record.consumed, requestId: record.envelope?.requestId, nonce: record.envelope?.nonce } : null;
});
if (!pending || pending.consumed !== false) throw new Error("pending handoff was not stored");
await webPage.close();

const params = new URLSearchParams(new URL(webUrl).hash.slice(1));
const claimMessage = {
  type: "terics.handoff.claim",
  protocolVersion: Number(params.get("terics-handoff")),
  requestId: params.get("requestId"),
  nonce: params.get("nonce"),
  targetOrigin: params.get("targetOrigin"),
};
const claimHtml = `<!doctype html><meta charset="utf-8"><div id="result">pending</div><script>
const message = ${JSON.stringify(claimMessage)};
function claim() {
  return new Promise((resolve) => chrome.runtime.sendMessage(${JSON.stringify(extensionId)}, message, (response) => resolve(response)));
}
(async () => {
  const first = await claim();
  const second = await claim();
  document.querySelector('#result').textContent = JSON.stringify({ first, second });
})();
</script>`;
await context.route("https://styayur.github.io/terics/handoff-smoke.html", (route) =>
  route.fulfill({ status: 200, contentType: "text/html", body: claimHtml }),
);
const claimPage = await context.newPage();
await claimPage.goto("https://styayur.github.io/terics/handoff-smoke.html");
await claimPage.waitForFunction(() => document.querySelector("#result")?.textContent !== "pending", null, { timeout: 15_000 });
const claimResult = await claimPage.locator("#result").textContent();
const parsedClaim = JSON.parse(claimResult ?? "{}");
if (parsedClaim.first?.ok !== true) throw new Error(`external handoff claim failed: ${claimResult}`);
if (parsedClaim.second?.code !== "replay") throw new Error(`handoff replay was not rejected: ${claimResult}`);
await claimPage.close();
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
      handoffUrlOpaque: true,
      externalClaim: parsedClaim.first.ok,
      replayRejected: parsedClaim.second.code === "replay",
      screenshot,
      boardScreenshot,
    },
    null,
    2,
  ),
);
await Promise.race([context.close(), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000))]);
process.exit(0);
