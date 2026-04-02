const QUARTZY_SETTINGS_KEY = "quartzySettings";
const QUARTZY_TOKEN_SESSION_KEY = "quartzyAccessTokenSession";
const QUARTZY_TOKEN_LOCAL_KEY = "quartzyAccessTokenLocal";
const QUARTZY_SUBMISSION_STATE_KEY = "quartzySubmissionState";

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function getField(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setDebugMessage(message) {
  const debugEl = getField("debug");
  if (!debugEl) return;
  debugEl.textContent = message || "";
}

function setQuartzyStatus(message, kind = "", linkUrl = "") {
  const statusEl = getField("quartzyStatus");
  if (!statusEl) return;

  statusEl.className = kind ? `status ${kind}` : "status";
  statusEl.innerHTML = "";

  if (!message) return;

  const text = document.createElement("span");
  text.textContent = message;
  statusEl.appendChild(text);

  if (linkUrl) {
    statusEl.appendChild(document.createTextNode(" "));
    const link = document.createElement("a");
    link.href = linkUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open in Quartzy";
    statusEl.appendChild(link);
  }
}

function setReceipt(submission) {
  const receiptEl = getField("submissionReceipt");
  const submitBtn = getField("submitBtn");
  if (!receiptEl || !submitBtn) return;

  if (!submission) {
    receiptEl.innerHTML = "";
    receiptEl.classList.add("hidden");
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit to Quartzy";
    return;
  }

  const createdAt = submission.createdAt
    ? new Date(submission.createdAt).toLocaleString()
    : "just now";

  receiptEl.innerHTML = [
    "<strong>Submitted to Quartzy</strong>",
    submission.requestId ? `Request ID: ${escapeHtml(submission.requestId)}` : "",
    `Submitted: ${escapeHtml(createdAt)}`,
    submission.appUrl
      ? `<a href="${escapeHtml(submission.appUrl)}" target="_blank" rel="noreferrer">Open in Quartzy</a>`
      : ""
  ].filter(Boolean).join("<br />");

  receiptEl.classList.remove("hidden");
  submitBtn.disabled = true;
  submitBtn.textContent = "Already submitted";
}

function setValue(id, value) {
  const el = getField(id);
  if (!el) return;

  if (el.type === "checkbox") {
    el.checked = !!value;
    return;
  }

  el.value = value ?? "";
}

function getValue(id) {
  const el = getField(id);
  if (!el) return "";
  if (el.type === "checkbox") return el.checked;
  return (el.value || "").trim();
}

function applySelectedOption(payload, index) {
  const options = payload?.options || [];
  const selected = options[index];
  if (!selected) return;

  payload.selectedOptionIndex = index;
  payload.catalogNumber = selected.catalogNumber || "";
  payload.concentration = selected.concentration || "";
  payload.packSize = selected.packSize || "";
  payload.unitPrice = selected.yourPrice || selected.listPrice || "";
  payload.currency = selected.currency || payload.currency || "";
  payload.priceSource = selected.yourPrice ? "yourPrice" : selected.listPrice ? "listPrice" : "none";
  payload.priceMissing = !payload.unitPrice;
  payload.quoteRequired = !payload.unitPrice;
}

function populateSelect(selectId, items, placeholder) {
  const select = getField(selectId);
  if (!select) return;

  select.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);

  items.forEach(item => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  });

  select.disabled = items.length === 0;
}

function upsertItem(items, item) {
  if (!item?.id) return items;

  const next = items.slice();
  const index = next.findIndex(entry => entry.id === item.id);
  if (index === -1) {
    next.push(item);
  } else {
    next[index] = item;
  }

  return next;
}

function populateOptionDropdown(payload) {
  const select = getField("productOption");
  if (!select) return;

  select.innerHTML = "";

  const options = payload?.options || [];
  if (!options.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No multiple options detected";
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  select.disabled = false;

  options.forEach((optData, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);

    const priceText =
      optData.yourPrice
        ? `${optData.currency || ""} ${optData.yourPrice} (Your Price)`
        : optData.listPrice
        ? `${optData.currency || ""} ${optData.listPrice} (List Price)`
        : "No price";

    opt.textContent = [
      optData.catalogNumber,
      optData.packSize,
      priceText
    ].filter(Boolean).join(" | ");

    select.appendChild(opt);
  });

  const selectedIndex = payload.selectedOptionIndex ?? 0;
  select.value = String(selectedIndex);
}

function getCaptureFromForm() {
  return {
    vendor: getValue("vendor"),
    itemName: getValue("itemName"),
    catalogNumber: getValue("catalogNumber"),
    concentration: getValue("concentration"),
    packSize: getValue("packSize"),
    unitPrice: getValue("unitPrice"),
    currency: getValue("currency"),
    sourceUrl: getValue("sourceUrl"),
    parserUsed: getValue("parserUsed"),
    confidence: getValue("confidence"),
    quoteRequired: !!getValue("quoteRequired")
  };
}

function buildSubmissionSignature(capture, settings) {
  return JSON.stringify({
    sourceUrl: capture.sourceUrl || "",
    vendor: capture.vendor || "",
    itemName: capture.itemName || "",
    catalogNumber: capture.catalogNumber || "",
    packSize: capture.packSize || "",
    unitPrice: capture.unitPrice || "",
    currency: capture.currency || "",
    labId: settings.labId || "",
    typeId: settings.typeId || ""
  });
}

async function loadSubmissionState() {
  const stored = await chrome.storage.session.get(QUARTZY_SUBMISSION_STATE_KEY);
  return stored?.[QUARTZY_SUBMISSION_STATE_KEY] || null;
}

async function saveSubmissionState(state) {
  await chrome.storage.session.set({ [QUARTZY_SUBMISSION_STATE_KEY]: state });
}

async function syncSubmissionReceipt() {
  const capture = getCaptureFromForm();
  const settings = await saveQuartzySettings();
  const currentSignature = buildSubmissionSignature(capture, settings);
  const submissionState = await loadSubmissionState();

  if (submissionState?.signature === currentSignature) {
    setReceipt(submissionState);
    return;
  }

  setReceipt(null);
}

function render(payload) {
  if (!payload) return;

  populateOptionDropdown(payload);

  setValue("vendor", payload.vendor);
  setValue("itemName", payload.itemName);
  setValue("catalogNumber", payload.catalogNumber);
  setValue("concentration", payload.concentration || "");
  setValue("packSize", payload.packSize);
  setValue("unitPrice", payload.unitPrice);
  setValue("currency", payload.currency);
  setValue("sourceUrl", payload.sourceUrl);
  setValue("parserUsed", payload.parserUsed);
  setValue("confidence", payload.confidence);
  setValue("quoteRequired", payload.quoteRequired);

  setDebugMessage(JSON.stringify(payload, null, 2));
  syncSubmissionReceipt().catch(() => {});
}

function buildSubmissionNotes(capture, extraNotes) {
  const lines = [];
  if (extraNotes) lines.push(extraNotes);
  if (capture.packSize) lines.push(`Pack size: ${capture.packSize}`);
  if (capture.concentration) lines.push(`Concentration: ${capture.concentration}`);
  if (capture.sourceUrl) lines.push(`Source URL: ${capture.sourceUrl}`);
  return lines.join("\n");
}

function toMinorUnits(amount) {
  const normalized = String(amount || "").replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Unit price must be a valid decimal amount.");
  }

  const value = Math.round(Number.parseFloat(normalized) * 100);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Unit price must be a valid positive amount.");
  }

  return String(value);
}

function buildQuartzyPayload(capture, settings) {
  const quantity = Number.parseInt(settings.quantity, 10);
  if (!settings.accessToken) throw new Error("Quartzy access token is required.");
  if (!settings.labId) throw new Error("Select a Quartzy lab.");
  if (!settings.typeId) throw new Error("Select a Quartzy request type.");
  if (!capture.itemName) throw new Error("Item name is required.");
  if (!capture.vendor) throw new Error("Vendor is required.");
  if (!capture.catalogNumber) throw new Error("Catalog number is required.");
  if (!capture.unitPrice) throw new Error("Unit price is required before submission.");
  if (!capture.currency) throw new Error("Currency is required before submission.");
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity must be at least 1.");

  const payload = {
    lab_id: settings.labId,
    type_id: settings.typeId,
    name: capture.itemName,
    vendor_name: capture.vendor,
    catalog_number: capture.catalogNumber,
    price: {
      amount: toMinorUnits(capture.unitPrice),
      currency: capture.currency
    },
    quantity
  };

  if (settings.requiredBefore) {
    payload.required_before = settings.requiredBefore;
  }

  const notes = buildSubmissionNotes(capture, settings.notes);
  if (notes) {
    payload.notes = notes;
  }

  return payload;
}

async function saveQuartzySettings() {
  const rememberToken = !!getValue("quartzyRememberToken");
  const accessToken = getValue("quartzyAccessToken");
  const settings = {
    rememberToken,
    organizationId: getValue("quartzyOrganizationId"),
    labId: getValue("quartzyLabId") || getValue("quartzyLab"),
    typeId: getValue("quartzyTypeId") || getValue("quartzyType"),
    quantity: getValue("quartzyQuantity") || "1",
    requiredBefore: getValue("quartzyRequiredBefore"),
    notes: getValue("quartzyNotes")
  };

  await chrome.storage.local.set({ [QUARTZY_SETTINGS_KEY]: settings });

  if (rememberToken) {
    await chrome.storage.local.set({ [QUARTZY_TOKEN_LOCAL_KEY]: accessToken });
    await chrome.storage.session.remove(QUARTZY_TOKEN_SESSION_KEY);
  } else {
    await chrome.storage.session.set({ [QUARTZY_TOKEN_SESSION_KEY]: accessToken });
    await chrome.storage.local.remove(QUARTZY_TOKEN_LOCAL_KEY);
  }

  return {
    ...settings,
    accessToken
  };
}

async function loadQuartzySettings() {
  const [localStored, sessionStored] = await Promise.all([
    chrome.storage.local.get([QUARTZY_SETTINGS_KEY, QUARTZY_TOKEN_LOCAL_KEY]),
    chrome.storage.session.get(QUARTZY_TOKEN_SESSION_KEY)
  ]);

  const savedSettings = localStored?.[QUARTZY_SETTINGS_KEY] || {};
  const settings = {
    accessToken:
      localStored?.[QUARTZY_TOKEN_LOCAL_KEY] ||
      sessionStored?.[QUARTZY_TOKEN_SESSION_KEY] ||
      "",
    rememberToken: !!savedSettings.rememberToken,
    organizationId: savedSettings.organizationId || "",
    labId: savedSettings.labId || "",
    typeId: savedSettings.typeId || "",
    quantity: savedSettings.quantity || "1",
    requiredBefore: savedSettings.requiredBefore || "",
    notes: savedSettings.notes || ""
  };

  setValue("quartzyAccessToken", settings.accessToken);
  setValue("quartzyRememberToken", settings.rememberToken);
  setValue("quartzyOrganizationId", settings.organizationId);
  setValue("quartzyLabId", settings.labId);
  setValue("quartzyTypeId", settings.typeId);
  setValue("quartzyQuantity", settings.quantity);
  setValue("quartzyRequiredBefore", settings.requiredBefore);
  setValue("quartzyNotes", settings.notes);

  return settings;
}

async function loadQuartzyLabs() {
  const settings = await saveQuartzySettings();
  setQuartzyStatus("Loading Quartzy labs...", "");

  const response = await chrome.runtime.sendMessage({
    type: "QUARTZY_LIST_LABS",
    accessToken: settings.accessToken,
    organizationId: settings.organizationId
  });

  if (!response?.ok) {
    populateSelect("quartzyLab", [], "Unable to load labs");
    populateSelect("quartzyType", [], "Select a lab first");
    setQuartzyStatus(response?.error || "Failed to load Quartzy labs.", "error");
    return { settings, labs: [] };
  }

  let labs = response.labs || [];

  if (settings.labId && !labs.some(lab => lab.id === settings.labId)) {
    const directLabResponse = await chrome.runtime.sendMessage({
      type: "QUARTZY_GET_LAB",
      accessToken: settings.accessToken,
      labId: settings.labId
    });

    if (directLabResponse?.ok && directLabResponse.lab) {
      labs = upsertItem(labs, directLabResponse.lab);
    }
  }

  populateSelect("quartzyLab", labs, "Select a lab");

  const selectedLabId = labs.some(lab => lab.id === settings.labId)
    ? settings.labId
    : (labs[0]?.id || "");
  setValue("quartzyLab", selectedLabId);
  if (selectedLabId) {
    setValue("quartzyLabId", selectedLabId);
  }

  await saveQuartzySettings();
  setQuartzyStatus(
    labs.length ? "Quartzy labs loaded." : "No Quartzy labs available.",
    labs.length ? "success" : ""
  );
  return { settings: { ...settings, labId: selectedLabId }, labs };
}

async function loadQuartzyTypes() {
  const settings = await saveQuartzySettings();
  if (!settings.accessToken || !settings.labId) {
    populateSelect("quartzyType", [], "Select a lab first");
    return;
  }

  setQuartzyStatus("Loading Quartzy request types...", "");
  const response = await chrome.runtime.sendMessage({
    type: "QUARTZY_LIST_TYPES",
    accessToken: settings.accessToken,
    labId: settings.labId
  });

  if (!response?.ok) {
    populateSelect("quartzyType", [], "Unable to load types");
    setQuartzyStatus(response?.error || "Failed to load Quartzy request types.", "error");
    return;
  }

  const types = response.types || [];
  populateSelect("quartzyType", types, "Select a request type");

  const selectedTypeId = types.some(type => type.id === settings.typeId)
    ? settings.typeId
    : (types[0]?.id || "");
  setValue("quartzyType", selectedTypeId);
  if (selectedTypeId) {
    setValue("quartzyTypeId", selectedTypeId);
  }

  await saveQuartzySettings();
  setQuartzyStatus(
    types.length ? "Quartzy request types loaded." : "No request types available for this lab.",
    types.length ? "success" : ""
  );
}

async function refreshQuartzyContext() {
  const { settings } = await loadQuartzyLabs();
  if (settings.labId) {
    await loadQuartzyTypes();
  }
}

async function loadLatest() {
  const data = await chrome.storage.session.get("latestCapture");
  if (data.latestCapture) {
    render(data.latestCapture);
    return;
  }

  await refreshFromPage();
}

async function refreshFromPage() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const response = await chrome.runtime.sendMessage({
    type: "RUN_CAPTURE_FOR_TAB",
    tabId: tab.id
  });

  if (response?.payload) {
    render(response.payload);
    return;
  }

  setDebugMessage(response?.error || "Unable to capture product details from this page.");
}

async function submitToQuartzy() {
  try {
    const capture = getCaptureFromForm();
    const settings = await saveQuartzySettings();
    const payload = buildQuartzyPayload(capture, settings);
    const signature = buildSubmissionSignature(capture, settings);

    setQuartzyStatus("Submitting to Quartzy...", "");
    const response = await chrome.runtime.sendMessage({
      type: "QUARTZY_CREATE_ORDER_REQUEST",
      accessToken: settings.accessToken,
      payload
    });

    if (!response?.ok) {
      setQuartzyStatus(response?.error || "Quartzy submission failed.", "error");
      return;
    }

    const submissionState = {
      signature,
      requestId: response.result?.id || "",
      appUrl: response.result?.app_url || "",
      createdAt: response.result?.requested_at || new Date().toISOString()
    };
    await saveSubmissionState(submissionState);
    setReceipt(submissionState);
    setQuartzyStatus(
      `Created Quartzy order request${response.result?.id ? ` ${response.result.id}` : ""}.`,
      "success",
      response.result?.app_url || ""
    );
  } catch (error) {
    setQuartzyStatus(error?.message || "Quartzy submission failed.", "error");
  }
}

async function initializeQuartzyForm() {
  populateSelect("quartzyLab", [], "Enter token and load labs");
  populateSelect("quartzyType", [], "Select a lab first");
  setReceipt(null);

  const settings = await loadQuartzySettings();
  if (settings.labId) setValue("quartzyLab", settings.labId);
  if (settings.typeId) setValue("quartzyType", settings.typeId);

  if (settings.accessToken) {
    await refreshQuartzyContext();
  }
}

document.getElementById("refreshBtn").addEventListener("click", refreshFromPage);
document.getElementById("submitBtn").addEventListener("click", submitToQuartzy);
document.getElementById("loadQuartzyBtn").addEventListener("click", refreshQuartzyContext);

document.getElementById("productOption")?.addEventListener("change", async (e) => {
  const idx = Number(e.target.value);
  const data = await chrome.storage.session.get("latestCapture");
  const payload = data.latestCapture;
  if (!payload) return;

  applySelectedOption(payload, idx);
  await chrome.storage.session.set({ latestCapture: payload });
  render(payload);
});

document.getElementById("quartzyLab")?.addEventListener("change", async () => {
  setValue("quartzyLabId", getValue("quartzyLab"));
  await saveQuartzySettings();
  await loadQuartzyTypes();
  await syncSubmissionReceipt();
});

document.getElementById("quartzyType")?.addEventListener("change", async () => {
  setValue("quartzyTypeId", getValue("quartzyType"));
  await saveQuartzySettings();
  await syncSubmissionReceipt();
});

[
  "quartzyAccessToken",
  "quartzyRememberToken",
  "quartzyOrganizationId",
  "quartzyLabId",
  "quartzyTypeId",
  "quartzyQuantity",
  "quartzyRequiredBefore",
  "quartzyNotes"
].forEach(id => {
  document.getElementById(id)?.addEventListener("change", async () => {
    await saveQuartzySettings();
    await syncSubmissionReceipt();
  });
});

Promise.all([
  initializeQuartzyForm(),
  loadLatest()
]).catch(error => {
  setQuartzyStatus(error?.message || "Failed to initialize Quartzy Capture.", "error");
});
