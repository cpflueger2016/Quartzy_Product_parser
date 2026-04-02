chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CAPTURE_RESULT") {
    chrome.storage.session.set({ latestCapture: message.payload }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
});