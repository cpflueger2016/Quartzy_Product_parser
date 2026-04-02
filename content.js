(function () {
  function capture() {
    const payload = window.PageParsers.parseCurrentPage();

    payload.priceMissing = !payload.unitPrice;
    payload.quoteRequired = !payload.unitPrice;

    chrome.runtime.sendMessage({
      type: "CAPTURE_RESULT",
      payload
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    capture();
  } else {
    window.addEventListener("DOMContentLoaded", capture);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "RUN_CAPTURE") {
      const payload = window.PageParsers.parseCurrentPage();
      payload.priceMissing = !payload.unitPrice;
      payload.quoteRequired = !payload.unitPrice;

      sendResponse({ ok: true, payload });
      return true;
    }
  });
})();