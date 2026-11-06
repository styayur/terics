import { chromeHandoffStorage, handleExternalHandoffClaim } from "../src/extension/handoff-service";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ tericsInstalledVersion: chrome.runtime.getManifest().version });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if ((message as { type?: string } | null)?.type === "terics.ping") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }
  return false;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  void handleExternalHandoffClaim(
    message,
    {
      origin: sender.origin,
      url: sender.url,
      id: sender.id,
    },
    chromeHandoffStorage,
    new Date(),
    chrome.runtime.id,
  )
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        code: "invalid_request",
        error: error instanceof Error ? error.message : "扩展 handoff 处理失败",
      });
    });
  return true;
});

