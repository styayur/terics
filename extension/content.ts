import { handleExtractMessage } from "../src/extension/messages";

declare global {
  interface Window {
    __tericsContentInstalled?: boolean;
  }
}

if (!window.__tericsContentInstalled) {
  window.__tericsContentInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if ((message as { type?: string } | null)?.type !== "terics.extract") return false;
    void handleExtractMessage(message).then(sendResponse);
    return true;
  });
}
