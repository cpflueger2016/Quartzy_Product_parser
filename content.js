(function () {
  if (window.__quartzyCaptureInitialized) return;
  window.__quartzyCaptureInitialized = true;

  function applyCurrencyDefaults(payload) {
    const defaultCurrency = payload.currency || "AUD";
    payload.currency = defaultCurrency;

    if (Array.isArray(payload.options)) {
      payload.options = payload.options.map(option => ({
        ...option,
        currency: option?.currency || defaultCurrency
      }));
    }
  }

  function buildPayload() {
    const payload = window.PageParsers.parseCurrentPage();
    applyCurrencyDefaults(payload);

    payload.priceMissing = !payload.unitPrice;
    payload.quoteRequired = !payload.unitPrice;

    return payload;
  }

  function capture() {
    const payload = buildPayload();

    chrome.runtime.sendMessage({
      type: "CAPTURE_RESULT",
      payload
    });
  }

  function scheduleFollowUpCaptures() {
    const delays = [1200, 3000];
    delays.forEach(delay => {
      window.setTimeout(capture, delay);
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    capture();
    scheduleFollowUpCaptures();
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      capture();
      scheduleFollowUpCaptures();
    }, { once: true });
  }

  window.addEventListener("load", capture, { once: true });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "RUN_CAPTURE") {
      sendResponse({ ok: true, payload: buildPayload() });
      return true;
    }

    if (message?.type === "PING_CAPTURE") {
      sendResponse({ ok: true });
      return true;
    }
  });
})();
