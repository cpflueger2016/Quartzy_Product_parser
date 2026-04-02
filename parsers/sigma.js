(function () {
  const U = window.ParserUtils;

  function getCatalogFromUrl() {
    const match = location.pathname.match(/\/product\/[^/]+\/([^/?#]+)/i);
    if (!match?.[1]) return "";
    return match[1].replace(/[^a-z0-9]/gi, "").toUpperCase();
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
    const priceSelectors = [
      '[itemprop="price"]',
      '[data-testid*="price" i]',
      '[class*="price" i]',
      '[id*="price" i]'
    ];

    const priceText = U.firstNonEmpty([
      ...priceSelectors.map(selector => U.textOf(selector)),
      ...priceSelectors.map(selector => U.attrOf(selector, "content")),
      bodyText
    ]);

    const priceParsed = U.parsePrice(priceText, { preferredCurrency });

    const packSizeMatch =
      bodyText.match(/\b(\d+(?:\.\d+)?)\s?(mg|g|kg|mL|L|µL|uL|each|EA)\b/i);

    return {
      vendor: "Sigma-Aldrich",
      itemName: U.normalizeWhitespace(title),
      catalogNumber: urlCatalog || catalogMatch?.[1] || "",
      packSize: packSizeMatch ? packSizeMatch[0] : "",
      unitPrice: priceParsed.unitPrice,
      currency: priceParsed.currency,
      sourceUrl: location.href,
      parserUsed: "sigma",
      confidence: title && (urlCatalog || catalogMatch?.[1]) ? 0.9 : title ? 0.75 : 0.35
    };
  }

  window.SigmaParser = { parseSigma };
})();
