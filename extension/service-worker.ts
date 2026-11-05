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

