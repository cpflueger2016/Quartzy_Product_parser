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

  function normalizePackSize(raw) {
    return String(raw || "")
      .replace(/\bML\b/g, "mL")
      .replace(/\bUL\b/g, "uL")
      .replace(/\bEA\b/g, "each")
      .trim();
  }

  function extractSizeAndPriceFromSelectSection(bodyText, preferredCurrency) {
    const lines = bodyText
      .split("\n")
      .map(line => U.normalizeWhitespace(line))
      .filter(Boolean);

    const start = lines.findIndex(line => /select\s+a\s+size/i.test(line));
    if (start === -1) return null;

    const stopPattern = /^(about this item|key documents|properties|description|safety information|documentation|peer reviewed papers)$/i;
    const section = [];

    for (let i = start + 1; i < lines.length && section.length < 12; i++) {
      const line = lines[i];
      if (stopPattern.test(line)) break;
      section.push(line);
    }

    if (!section.length) return null;

    const packSize = section.find(line =>
      /^\d+(?:\.\d+)?\s*(?:mg|g|kg|mL|ML|L|µL|uL|each|EA)$/i.test(line)
    ) || "";

    const priceLine = section.find(line => U.parsePrice(line, { preferredCurrency }).unitPrice) || "";
    const priceParsed = U.parsePrice(priceLine, { preferredCurrency });

    const optionCatalog = section.find(line => /^[A-Z0-9-]{4,}$/i.test(line) && /\d/.test(line)) || "";

    return {
      packSize,
      unitPrice: priceParsed.unitPrice,
      currency: priceParsed.currency,
      optionCatalog: normalizeCatalogNumber(optionCatalog)
    };
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
    const urlCatalog = getCatalogFromUrl();

    const catalogMatch =
      bodyText.match(/\bProduct\s*(?:No\.?|#)\s*[:\-]?\s*([A-Z0-9\-]+)/i) ||
      bodyText.match(/\bCatalog\s*(?:No\.?|#)?\s*[:\-]?\s*([A-Z0-9\-]+)/i) ||
      bodyText.match(/\b([A-Z]-\d{3}-[A-Z])\b/i);

    const preferredCurrency = /\/au\//i.test(location.pathname) ? "AUD" : "";
    const sizeSection = extractSizeAndPriceFromSelectSection(bodyText, preferredCurrency);
    const priceSelectors = [
      '[itemprop="price"]',
      '[data-testid*="price" i]',
      '[class*="price" i]',
      '[id*="price" i]'
    ];

    const priceText = U.firstNonEmpty([
      sizeSection?.unitPrice ? `${sizeSection.unitPrice} ${sizeSection.currency || preferredCurrency}`.trim() : "",
      ...priceSelectors.map(selector => U.textOf(selector)),
      ...priceSelectors.map(selector => U.attrOf(selector, "content")),
      bodyText
    ]);

    const priceParsed = U.parsePrice(priceText, { preferredCurrency });

    const packSizeMatch =
      bodyText.match(/\b(\d+(?:\.\d+)?)\s?(mg|g|kg|mL|ML|L|µL|uL|each|EA)\b/i);
    const packSize = U.firstNonEmpty([
      normalizePackSize(sizeSection?.packSize),
      extractPhysicalFormPackSize(bodyText),
      packSizeMatch ? normalizePackSize(`${packSizeMatch[1]} ${packSizeMatch[2]}`) : ""
    ]);

    return {
      vendor: "Sigma-Aldrich",
      itemName: U.normalizeWhitespace(title),
      catalogNumber: urlCatalog || catalogMatch?.[1] || "",
      packSize,
      unitPrice: priceParsed.unitPrice,
      currency: priceParsed.currency,
      sourceUrl: location.href,
      parserUsed: "sigma",
      confidence: title && (urlCatalog || catalogMatch?.[1]) ? 0.9 : title ? 0.75 : 0.35
    };
  }

  window.SigmaParser = { parseSigma };
})();
