const CONTENT_SCRIPT_FILES = [
  "parsers/base.js",
  "parsers/thermo.js",
  "parsers/neb.js",
  "parsers/sigma.js",
  "parsers/index.js",
  "content.js"
];

function isSupportedUrl(url) {
  if (!url) return false;

  try {
    const { hostname, protocol } = new URL(url);
    if (!/^https?:$/.test(protocol)) return false;

    return [
      "thermofisher.com",
      "neb.com",
      "sigmaaldrich.com",
      "milliporesigma.com"
    ].some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch (_) {
    return false;
  }
}

async function sendCaptureMessage(tabId) {
  return chrome.tabs.sendMessage(tabId, { type: "RUN_CAPTURE" });
}

async function ensureContentScriptAndCapture(tab) {
  if (!tab?.id) {
    throw new Error("No active tab available.");
  }

  if (!isSupportedUrl(tab.url)) {
    throw new Error("Current tab is not on a supported vendor product page.");
  }

  try {
    return await sendCaptureMessage(tab.id);
  } catch (error) {
    const message = error?.message || "";
    const needsInjection =
      /Receiving end does not exist/i.test(message) ||
      /Could not establish connection/i.test(message);

    if (!needsInjection) throw error;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: CONTENT_SCRIPT_FILES
    });

    return sendCaptureMessage(tab.id);
  }
}

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

  if (message?.type === "RUN_CAPTURE_FOR_TAB") {
    chrome.tabs.get(message.tabId).then(ensureContentScriptAndCapture).then(async (response) => {
      if (response?.payload) {
        await chrome.storage.session.set({ latestCapture: response.payload });
      }

      sendResponse({ ok: true, payload: response?.payload || null });
    }).catch(error => {
      sendResponse({
        ok: false,
        error: error?.message || "Failed to capture from page."
      });
    });

    return true;
  }
});
