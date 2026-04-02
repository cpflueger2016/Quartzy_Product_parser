(function () {
  const U = window.ParserUtils;

  function getCatalogFromUrl() {
    const match = location.pathname.match(/\/product\/[^/]+\/([^/?#]+)/i);
    if (!match?.[1]) return "";
    return match[1].replace(/[^a-z0-9]/gi, "").toUpperCase();
  }

  function normalizeCatalogNumber(raw) {
    return String(raw || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  }

  function normalizeSku(raw) {
    return U.normalizeWhitespace(String(raw || ""))
      .replace(/[^A-Z0-9-]/gi, "")
      .toUpperCase();
  }

  function normalizePackSize(raw) {
    return String(raw || "")
      .replace(/\bML\b/g, "mL")
      .replace(/\bUL\b/g, "uL")
      .replace(/\bEA\b/g, "each")
      .replace(/\bKG\b/g, "kg")
      .replace(/\bG\b/g, "g")
      .trim();
  }

  function sizeToSigmaSuffix(packSize) {
    const compact = String(packSize || "").replace(/\s+/g, "");
    const match = compact.match(/^(\d+(?:\.\d+)?)(mg|g|kg|mL|uL|L|each)$/i);
    if (!match) return compact.toUpperCase();

    const amount = match[1];
    const unitMap = {
      mg: "MG",
      g: "G",
      kg: "KG",
      ml: "ML",
      ul: "UL",
      l: "L",
      each: "EA"
    };

    return `${amount}${unitMap[match[2].toLowerCase()] || match[2].toUpperCase()}`;
  }

  function inferOptionCatalogNumber(baseCatalog, packSize) {
    if (!baseCatalog || !packSize) return "";
    return `${baseCatalog}-${sizeToSigmaSuffix(packSize)}`;
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

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function isPackSizeLine(line) {
    return /^\d+(?:\.\d+)?\s*(?:mg|g|kg|mL|ML|L|µL|uL|each|EA)$/i.test(line);
  }

  function isSkuLine(line) {
    return /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/i.test(line) && /\d/.test(line);
  }

  function extractSigmaOptions(bodyText, preferredCurrency, baseCatalog) {
    const lines = bodyText
      .split("\n")
      .map(line => U.normalizeWhitespace(line))
      .filter(Boolean);

    const stopPattern = /^(about this item|key documents|properties|description|safety information|documentation|peer reviewed papers)$/i;
    const start = lines.findIndex(line => /select\s+a\s+size/i.test(line));
    const section = [];

    for (let i = Math.max(0, start + 1); i < lines.length && section.length < 80; i++) {
      const line = lines[i];
      if (stopPattern.test(line)) break;
      section.push(line);
    }

    if (!section.length) return [];

    const options = [];
    for (let i = 0; i < section.length; i++) {
      const current = section[i];
      if (!isPackSizeLine(current)) continue;

      const block = [];
      for (let j = i; j < section.length; j++) {
        const line = section[j];
        if (j > i && isPackSizeLine(line)) break;
        block.push(line);
      }

      const packSize = normalizePackSize(current);
      const catalogLine = block.find(line => isSkuLine(line));
      const priceLine = block.find(line => U.parsePrice(line, { preferredCurrency }).unitPrice);
      const priceParsed = U.parsePrice(priceLine || "", { preferredCurrency });

      if (!priceParsed.unitPrice) continue;

      options.push({
        catalogNumber: normalizeSku(catalogLine) || inferOptionCatalogNumber(baseCatalog, packSize),
        packSize,
        listPrice: priceParsed.unitPrice,
        yourPrice: "",
        currency: priceParsed.currency || preferredCurrency
      });
    }

    if (options.length) return dedupeOptions(options);

    const packSizes = section.filter(isPackSizeLine).map(normalizePackSize);
    const prices = section
      .map(line => U.parsePrice(line, { preferredCurrency }))
      .filter(price => price.unitPrice);
    const skus = section.filter(isSkuLine).map(normalizeSku);

    const zipped = [];
    const count = Math.min(packSizes.length, prices.length);
    for (let i = 0; i < count; i++) {
      zipped.push({
        catalogNumber: skus[i] || inferOptionCatalogNumber(baseCatalog, packSizes[i]),
        packSize: packSizes[i],
        listPrice: prices[i].unitPrice,
        yourPrice: "",
        currency: prices[i].currency || preferredCurrency
      });
    }

    return dedupeOptions(zipped);
  }

  function extractSigmaOptionsFromTextBlock(rawText, preferredCurrency, baseCatalog) {
    const normalized = U.normalizeWhitespace(rawText);
    if (!normalized) return [];

    const startMatch = normalized.match(/select\s+a\s+size/i);
    const startIndex = startMatch ? startMatch.index : 0;

    const stopRegex = /\b(about this item|key documents|properties|description|safety information|documentation|peer reviewed papers)\b/i;
    const tail = normalized.slice(startIndex);
    const stopMatch = tail.match(stopRegex);
    const section = stopMatch ? tail.slice(0, stopMatch.index) : tail;

    const optionRegex = /(\d+(?:\.\d+)?\s*(?:mg|g|kg|mL|ML|L|µL|uL|each|EA))(?:(?!\d+(?:\.\d+)?\s*(?:mg|g|kg|mL|ML|L|µL|uL|each|EA)).){0,200}?((?:[A-Z0-9]+(?:-[A-Z0-9]+)+))?(?:(?!\d+(?:\.\d+)?\s*(?:mg|g|kg|mL|ML|L|µL|uL|each|EA)).){0,200}?((?:A\$|\$)\s*[\d,]+(?:\.\d{1,2})?)/gi;

    const options = [];
    let match;
    while ((match = optionRegex.exec(section)) !== null) {
      const packSize = normalizePackSize(match[1]);
      const sku = normalizeSku(match[2]);
      const priceParsed = U.parsePrice(match[3], { preferredCurrency });
      if (!packSize || !priceParsed.unitPrice) continue;

      options.push({
        catalogNumber: sku || inferOptionCatalogNumber(baseCatalog, packSize),
        packSize,
        listPrice: priceParsed.unitPrice,
        yourPrice: "",
        currency: priceParsed.currency || preferredCurrency
      });
    }

    return dedupeOptions(options);
  }

  function extractPhysicalFormPackSize(bodyText) {
    const physicalFormMatch = bodyText.match(
      /\bPhysical\s+form\b[\s\S]{0,120}?\b(\d+(?:\.\d+)?)\s*(mg|g|kg|mL|ML|L|µL|uL)\b/i
    );

    if (!physicalFormMatch) return "";
    return normalizePackSize(`${physicalFormMatch[1]} ${physicalFormMatch[2]}`);
  }

  function parseSigma() {
    const title = U.firstNonEmpty([
      U.textOf("h1"),
      U.attrOf('meta[property="og:title"]', "content")
    ]);

    const bodyText = document.body.innerText || "";
    const textContent = document.body.textContent || "";
    const urlCatalog = getCatalogFromUrl();
    const baseCatalog = urlCatalog || "";

    const catalogMatch =
      bodyText.match(/\bProduct\s*(?:No\.?|#)\s*[:\-]?\s*([A-Z0-9\-]+)/i) ||
      bodyText.match(/\bCatalog\s*(?:No\.?|#)?\s*[:\-]?\s*([A-Z0-9\-]+)/i) ||
      bodyText.match(/\b([A-Z]-\d{3}-[A-Z])\b/i);

    const preferredCurrency = /\/au\//i.test(location.pathname) ? "AUD" : "";
    const options = dedupeOptions([
      ...extractSigmaOptions(bodyText, preferredCurrency, baseCatalog),
      ...extractSigmaOptions(textContent, preferredCurrency, baseCatalog),
      ...extractSigmaOptionsFromTextBlock(bodyText, preferredCurrency, baseCatalog),
      ...extractSigmaOptionsFromTextBlock(textContent, preferredCurrency, baseCatalog)
    ]);
    const selectedOptionIndex = 0;
    const selected = options[selectedOptionIndex] || null;
    const priceSelectors = [
      '[itemprop="price"]',
      '[data-testid*="price" i]',
      '[class*="price" i]',
      '[id*="price" i]'
    ];

    const priceText = U.firstNonEmpty([
      selected?.listPrice ? `${selected.listPrice} ${selected.currency || preferredCurrency}`.trim() : "",
      ...priceSelectors.map(selector => U.textOf(selector)),
      ...priceSelectors.map(selector => U.attrOf(selector, "content")),
      bodyText
    ]);

    const priceParsed = U.parsePrice(priceText, { preferredCurrency });

    const packSizeMatch =
      bodyText.match(/\b(\d+(?:\.\d+)?)\s?(mg|g|kg|mL|ML|L|µL|uL|each|EA)\b/i);
    const packSize = U.firstNonEmpty([
      selected?.packSize,
      extractPhysicalFormPackSize(bodyText),
      packSizeMatch ? normalizePackSize(`${packSizeMatch[1]} ${packSizeMatch[2]}`) : ""
    ]);

    return {
      vendor: "Sigma-Aldrich",
      itemName: U.normalizeWhitespace(title),
      catalogNumber: selected?.catalogNumber || urlCatalog || catalogMatch?.[1] || "",
      packSize,
      unitPrice: priceParsed.unitPrice,
      currency: priceParsed.currency,
      sourceUrl: location.href,
      parserUsed: "sigma",
      confidence: title && (options.length || urlCatalog || catalogMatch?.[1]) ? 0.92 : title ? 0.75 : 0.35,
      options,
      selectedOptionIndex,
      priceSource: selected?.listPrice ? "listPrice" : priceParsed.unitPrice ? "listPrice" : "none"
    };
  }

  window.SigmaParser = { parseSigma };
})();
