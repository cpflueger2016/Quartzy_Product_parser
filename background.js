const CONTENT_SCRIPT_FILES = [
  "parsers/base.js",
  "parsers/thermo.js",
  "parsers/neb.js",
  "parsers/sigma.js",
  "parsers/index.js",
  "content.js"
];

const QUARTZY_API_BASE = "https://api.quartzy.com";

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

function buildQuartzyHeaders(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) {
    throw new Error("Quartzy access token is required.");
  }

  return {
    "Content-Type": "application/json",
    "Access-Token": token.replace(/^Bearer\s+/i, ""),
    Authorization: /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`
  };
}

async function quartzyApiRequest(path, options = {}) {
  const { accessToken, method = "GET", body, query } = options;
  const url = new URL(`${QUARTZY_API_BASE}${path}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: buildQuartzyHeaders(accessToken),
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    let message = `Quartzy API request failed (${response.status}).`;

    if (typeof payload === "string" && payload.trim()) {
      message = payload.trim();
    } else if (payload?.message) {
      message = payload.message;
    } else if (payload?.error) {
      message = payload.error;
    }

    throw new Error(message);
  }

  return payload;
}

function formatQuartzyLab(lab) {
  return {
    id: lab.id,
    name: lab.name || lab.display_name || "Unnamed lab"
  };
}

function formatQuartzyType(type) {
  return {
    id: type.id,
    name: type.name || type.display_name || "Unnamed type"
  };
}

function ensureArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
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

  if (message?.type === "QUARTZY_LIST_LABS") {
    quartzyApiRequest("/labs", {
      accessToken: message.accessToken,
      query: {
        organization_id: message.organizationId
      }
    }).then(labs => {
      sendResponse({
        ok: true,
        labs: ensureArrayPayload(labs).map(formatQuartzyLab)
      });
    }).catch(error => {
      sendResponse({
        ok: false,
        error: error?.message || "Failed to load Quartzy labs."
      });
    });

    return true;
  }

  if (message?.type === "QUARTZY_LIST_TYPES") {
    quartzyApiRequest("/types", {
      accessToken: message.accessToken,
      query: { lab_id: message.labId }
    }).then(types => {
      sendResponse({
        ok: true,
        types: ensureArrayPayload(types).map(formatQuartzyType)
      });
    }).catch(error => {
      sendResponse({
        ok: false,
        error: error?.message || "Failed to load Quartzy request types."
      });
    });

    return true;
  }

  if (message?.type === "QUARTZY_GET_LAB") {
    quartzyApiRequest(`/labs/${message.labId}`, {
      accessToken: message.accessToken
    }).then(lab => {
      sendResponse({
        ok: true,
        lab: lab?.data ? formatQuartzyLab(lab.data) : formatQuartzyLab(lab)
      });
    }).catch(error => {
      sendResponse({
        ok: false,
        error: error?.message || "Failed to load Quartzy lab."
      });
    });

    return true;
  }

  if (message?.type === "QUARTZY_CREATE_ORDER_REQUEST") {
    quartzyApiRequest("/order-requests", {
      accessToken: message.accessToken,
      method: "POST",
      body: message.payload
    }).then(result => {
      sendResponse({
        ok: true,
        result: result?.data || result
      });
    }).catch(error => {
      sendResponse({
        ok: false,
        error: error?.message || "Failed to create Quartzy order request."
      });
    });

    return true;
  }
});
