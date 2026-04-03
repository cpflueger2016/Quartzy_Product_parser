(function () {
  const U = window.ParserUtils;

  function normalizePackSize(raw) {
    return U.normalizeWhitespace(String(raw || ""))
      .replace(/\bug\b/gi, "µg")
      .replace(/\bUL\b/g, "uL")
      .replace(/\bul\b/g, "uL")
      .replace(/\bµl\b/g, "µL")
      .replace(/\bML\b/g, "mL")
      .replace(/\bml\b/g, "mL")
      .replace(/\bL\b/g, "L")
      .trim();
  }

  function normalizeCatalogNumber(raw) {
    return U.normalizeWhitespace(String(raw || ""))
      .replace(/[^a-z0-9-]/gi, "")
      .toLowerCase();
  }

  function getCatalogFromUrl() {
    const match = location.pathname.match(/(ab\d+[a-z]?)/i);
    return match?.[1] ? normalizeCatalogNumber(match[1]) : "";
  }

  function extractPackSizeFromText(text) {
    const normalized = U.normalizeWhitespace(text);
    if (!normalized) return "";

    const match = normalized.match(
      /\b(\d+(?:\.\d+)?)\s*(µL|µl|uL|ul|UL|mL|ML|ml|L|µg|ug|mg|g|kg)\b/i
    );

    return match ? normalizePackSize(`${match[1]} ${match[2]}`) : "";
  }

  function isInTopRegion(el) {
    if (typeof el?.getBoundingClientRect !== "function") return false;
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.top < 1200;
  }

  function getElementStateText(el) {
    return [
      el?.className || "",
      el?.id || "",
      el?.getAttribute?.("data-testid") || "",
      el?.getAttribute?.("aria-label") || "",
      el?.getAttribute?.("name") || "",
      el?.getAttribute?.("data-state") || "",
      el?.getAttribute?.("data-selected") || "",
      el?.getAttribute?.("data-active") || "",
      el?.getAttribute?.("data-current") || ""
    ].join(" ");
  }

  function getAssociatedLabelText(el) {
    if (!el) return "";

    const labelTexts = [];
    const id = el.getAttribute?.("id");
    if (id) {
      const externalLabels = Array.from(document.querySelectorAll(`label[for="${CSS.escape(id)}"]`));
      for (const label of externalLabels) {
        labelTexts.push(U.normalizeWhitespace(label.textContent || ""));
      }
    }

    const wrappingLabel = el.closest?.("label");
    if (wrappingLabel) {
      labelTexts.push(U.normalizeWhitespace(wrappingLabel.textContent || ""));
    }

    const labelledBy = (el.getAttribute?.("aria-labelledby") || "")
      .split(/\s+/)
      .map(idRef => idRef.trim())
      .filter(Boolean);
    for (const ref of labelledBy) {
      const labelEl = document.getElementById(ref);
      if (labelEl) {
        labelTexts.push(U.normalizeWhitespace(labelEl.textContent || ""));
      }
    }

    return U.firstNonEmpty(labelTexts);
  }

  function extractPackSizeNearElement(el) {
    if (!el) return "";

    const directCandidates = [
      U.normalizeWhitespace(el.textContent || ""),
      U.normalizeWhitespace(el.getAttribute?.("aria-label") || ""),
      U.normalizeWhitespace(el.getAttribute?.("value") || ""),
      getAssociatedLabelText(el)
    ];

    for (const candidate of directCandidates) {
      const packSize = extractPackSizeFromText(candidate);
      if (packSize) return packSize;
    }

    const relatedNodes = [
      el.parentElement,
      el.closest?.('[role="tab"], [role="radio"], [role="option"], [class*="size" i], [data-testid*="size" i]') || null,
      el.previousElementSibling,
      el.nextElementSibling
    ].filter(Boolean);

    for (const node of relatedNodes) {
      const text = U.normalizeWhitespace(node.textContent || "");
      const packSize = extractPackSizeFromText(text);
      if (packSize) return packSize;
    }

    return "";
  }

  function isSelectedSizeElement(el) {
    if (!el) return false;
    if (el.getAttribute?.("aria-selected") === "true") return true;
    if (el.getAttribute?.("aria-pressed") === "true") return true;
    if (el.getAttribute?.("aria-checked") === "true") return true;
    if (el.getAttribute?.("aria-current") === "true") return true;
    if (el.checked === true || el.selected === true) return true;

    const stateText = getElementStateText(el);
    return /\b(active|selected|current|checked|chosen)\b/i.test(stateText);
  }

  function dedupeOptions(options) {
    const seen = new Set();
    return options.filter(option => {
      const key = [
        option.catalogNumber,
        option.packSize,
        option.listPrice,
        option.currency
      ].join("|");

      if (!option.packSize && !option.listPrice) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function scorePriceCandidate(text, el) {
    const normalized = U.normalizeWhitespace(text);
    if (!normalized) return Number.NEGATIVE_INFINITY;
    if (!/(?:A\$|\$|€|£|¥)\s*[\d,]+(?:\.\d{1,2})?/.test(normalized)) {
      return Number.NEGATIVE_INFINITY;
    }

    let score = 0;
    if (/\bprice\b/i.test(normalized)) score += 30;
    if (!/\bstarts from\b/i.test(normalized)) score += 20;
    if (normalized.length <= 32) score += 15;

    const attrText = [
      el?.className || "",
      el?.id || "",
      el?.getAttribute?.("data-testid") || "",
      el?.getAttribute?.("aria-label") || ""
    ].join(" ");
    if (/price|sales/i.test(attrText)) score += 40;

    if (typeof el?.getBoundingClientRect === "function") {
      const rect = el.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < 900) score += 15;
    }

    return score;
  }

  function extractCurrentPrice() {
    const selectors = [
      '[itemprop="price"]',
      'meta[itemprop="price"]',
      '[data-testid*="price" i]',
      '[class*="price" i]',
      '[id*="price" i]',
      '[aria-label*="price" i]'
    ];

    const candidates = [];
    const seen = new Set();

    for (const selector of selectors) {
      let nodes = [];
      try {
        nodes = Array.from(document.querySelectorAll(selector));
      } catch (_) {
        continue;
      }

      for (const el of nodes) {
        const texts = [
          U.normalizeWhitespace(el.textContent || ""),
          U.normalizeWhitespace(el.getAttribute?.("content") || "")
        ].filter(Boolean);

        for (const text of texts) {
          if (seen.has(text)) continue;
          seen.add(text);
          candidates.push({ text, el });
        }
      }
    }

    const topRegion = Array.from(document.querySelectorAll("button, a, span, div, p, label"))
      .filter(isInTopRegion);

    for (const el of topRegion) {
      const text = U.normalizeWhitespace(el.textContent || "");
      if (!text || text.length > 60 || seen.has(text)) continue;
      seen.add(text);
      candidates.push({ text, el });
    }

    const ranked = candidates
      .map(candidate => ({
        ...candidate,
        score: scorePriceCandidate(candidate.text, candidate.el)
      }))
      .filter(candidate => Number.isFinite(candidate.score))
      .sort((a, b) => b.score - a.score);

    const parsed = U.parsePrice(ranked[0]?.text || "");
    if (parsed.unitPrice) return parsed;

    return U.parsePrice(
      U.extractLabeledValue(["price", "list price", "sale price"]) || ""
    );
  }

  function extractSelectedPackSizeFromControls() {
    const candidates = [];
    const elements = Array.from(document.querySelectorAll("button, a, label, span, option, li, div, input"));

    for (const el of elements) {
      if (!isInTopRegion(el)) continue;

      const packSize = extractPackSizeNearElement(el);
      if (!packSize) continue;

      let score = 0;
      if (isSelectedSizeElement(el)) score += 100;
      if (/option|tab|radio/i.test(el.getAttribute?.("role") || "")) score += 15;
      if (/size|volume|amount|selling/i.test(getElementStateText(el))) score += 25;
      if (extractPackSizeFromText(U.normalizeWhitespace(el.textContent || "")) === packSize) score += 10;

      const parent = el.parentElement;
      if (parent && isSelectedSizeElement(parent)) score += 60;
      if (parent && /size|volume|amount|selling/i.test(getElementStateText(parent))) score += 15;

      const closest = el.closest?.('[role="tab"], [role="radiogroup"], [role="listbox"], [class*="size" i], [data-testid*="size" i]');
      if (closest) score += 20;

      const labelText = getAssociatedLabelText(el);
      if (extractPackSizeFromText(labelText)) score += 25;

      candidates.push({ packSize, score });
    }

    const ranked = candidates
      .filter(candidate => candidate.score > 0)
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.packSize || "";
  }

  function extractSelectedPackSize(bodyText) {
    const titleText = U.firstNonEmpty([
      U.attrOf('meta[property="og:title"]', "content"),
      document.title
    ]);

    const candidates = [
      extractSelectedPackSizeFromControls(),
      U.extractLabeledValue(["selling size", "size"]),
      titleText,
      ...String(bodyText || "")
        .split("\n")
        .map(line => U.normalizeWhitespace(line))
        .filter(line => /\bselling size\b/i.test(line))
        .slice(0, 5)
    ];

    for (const candidate of candidates) {
      const packSize = extractPackSizeFromText(candidate);
      if (packSize) return packSize;
    }

    return "";
  }

  function extractSizeOptionsFromElements(selectedPackSize, selectedPrice, catalogNumber) {
    const options = [];
    const elements = Array.from(document.querySelectorAll("button, a, label, span, option, li, div"));

    for (const el of elements) {
      const text = U.normalizeWhitespace(el.textContent || "");
      if (!text || text.length > 24) continue;

      const packSize = extractPackSizeFromText(text);
      if (!packSize) continue;

      const attrText = [
        el.className || "",
        el.id || "",
        el.getAttribute?.("data-testid") || "",
        el.getAttribute?.("aria-label") || "",
        el.getAttribute?.("name") || ""
      ].join(" ");

      const isLikelySizeControl =
        /size|volume|selling/i.test(attrText) ||
        text === packSize ||
        /\b(?:µL|uL|mL|µg|mg|g|kg)\b/i.test(text);

      if (!isLikelySizeControl) continue;

      options.push({
        catalogNumber,
        packSize,
        listPrice: packSize === selectedPackSize ? selectedPrice.unitPrice : "",
        yourPrice: "",
        currency: selectedPrice.currency
      });
    }

    return options;
  }

  function extractSizeOptionsFromBody(bodyText, selectedPackSize, selectedPrice, catalogNumber) {
    const options = [];
    const lines = String(bodyText || "")
      .split("\n")
      .map(line => U.normalizeWhitespace(line))
      .filter(Boolean);

    for (const line of lines) {
      if (
        !/\b(selling size|trial size|larger sizes|sizes|size)\b/i.test(line) &&
        !/^\d+(?:\.\d+)?\s*(?:µL|uL|mL|µg|mg|g|kg)\b/i.test(line)
      ) {
        continue;
      }

      const matches = Array.from(
        line.matchAll(/\b(\d+(?:\.\d+)?)\s*(µL|µl|uL|ul|UL|mL|ML|ml|L|µg|ug|mg|g|kg)\b/gi)
      );

      for (const match of matches) {
        const packSize = normalizePackSize(`${match[1]} ${match[2]}`);
        options.push({
          catalogNumber,
          packSize,
          listPrice: packSize === selectedPackSize ? selectedPrice.unitPrice : "",
          yourPrice: "",
          currency: selectedPrice.currency
        });
      }
    }

    return options;
  }

  function parseAbcam() {
    const title = U.firstNonEmpty([
      U.textOf("h1"),
      U.attrOf('meta[property="og:title"]', "content")
    ]);
    const bodyText = document.body?.innerText || "";
    const catalogNumber = U.firstNonEmpty([
      normalizeCatalogNumber(U.extractLabeledValue(["catalog number", "product code", "sku"])),
      normalizeCatalogNumber(bodyText.match(/\bAB\d+[A-Z]?\b/i)?.[0] || ""),
      getCatalogFromUrl()
    ]);
    const selectedPrice = extractCurrentPrice();
    const selectedPackSize = extractSelectedPackSize(bodyText);
    const options = dedupeOptions([
      ...extractSizeOptionsFromElements(selectedPackSize, selectedPrice, catalogNumber),
      ...extractSizeOptionsFromBody(bodyText, selectedPackSize, selectedPrice, catalogNumber)
    ]);
    const selectedOptionIndex = Math.max(
      0,
      options.findIndex(option => option.packSize === selectedPackSize)
    );
    const selectedOption = options[selectedOptionIndex] || null;
    const activeSizeDetected = !!extractSelectedPackSizeFromControls();
    const captureWarning =
      options.length > 1 && !activeSizeDetected
        ? "Abcam price refreshed, but the active size button could not be read confidently. Verify pack size before submitting."
        : "";

    return {
      vendor: "Abcam",
      itemName: U.normalizeWhitespace(title),
      catalogNumber,
      packSize: selectedOption?.packSize || selectedPackSize,
      unitPrice: selectedOption?.listPrice || selectedPrice.unitPrice,
      currency: selectedOption?.currency || selectedPrice.currency,
      sourceUrl: location.href,
      parserUsed: "abcam",
      confidence: title && catalogNumber && (selectedPackSize || options.length || selectedPrice.unitPrice)
        ? 0.9
        : title
        ? 0.72
        : 0.35,
      captureWarning,
      options,
      selectedOptionIndex,
      priceSource: selectedOption?.listPrice || selectedPrice.unitPrice ? "listPrice" : "none"
    };
  }

  window.AbcamParser = { parseAbcam };
})();
