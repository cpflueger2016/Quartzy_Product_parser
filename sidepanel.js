async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.type === "checkbox") {
    el.checked = !!value;
  } else {
    el.value = value ?? "";
  }
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

function populateOptionDropdown(payload) {
  const select = document.getElementById("productOption");
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

  document.getElementById("debug").textContent = JSON.stringify(payload, null, 2);
}

async function loadLatest() {
  const data = await chrome.storage.session.get("latestCapture");
  render(data.latestCapture);
}

async function refreshFromPage() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const response = await chrome.tabs.sendMessage(tab.id, { type: "RUN_CAPTURE" });
  if (response?.payload) {
    await chrome.storage.session.set({ latestCapture: response.payload });
    render(response.payload);
  }
}

document.getElementById("refreshBtn").addEventListener("click", refreshFromPage);

document.getElementById("productOption")?.addEventListener("change", async (e) => {
  const idx = Number(e.target.value);
  const data = await chrome.storage.session.get("latestCapture");
  const payload = data.latestCapture;
  if (!payload) return;

  applySelectedOption(payload, idx);
  await chrome.storage.session.set({ latestCapture: payload });
  render(payload);
});

loadLatest();