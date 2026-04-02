(function () {
  const U = window.ParserUtils;

  function getPreferredCurrency() {
    if (/\/au\//i.test(location.pathname) || /\.com\.au$/i.test(location.hostname)) {
      return "AUD";
    }

    return "";
  }

  function getCatalogFromUrl() {
    const segment = location.pathname.split("/").filter(Boolean).pop() || "";
    return /^[A-Z0-9\-]+$/i.test(segment) ? segment.toUpperCase() : "";
  }

  function extractPriceFromJsonLd(preferredCurrency) {
    const jsonLd = U.readJsonLd();
    const queue = [...jsonLd];

    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;

      if (Array.isArray(current)) {
        queue.push(...current);
        continue;
      }

      if (typeof current !== "object") continue;

      const offers = current.offers;
      if (offers) {
        const offerList = Array.isArray(offers) ? offers : [offers];
        for (const offer of offerList) {
          if (!offer || typeof offer !== "object") continue;

          const priceValue = offer.price ?? offer.lowPrice ?? offer.highPrice ?? "";
          const currency = String(offer.priceCurrency || preferredCurrency || "").toUpperCase();
          if (priceValue) {
            return `${priceValue} ${currency}`.trim();
          }
        }
      }

      queue.push(...Object.values(current));
    }

    return "";
  }

  function getPriceScore(text, el, preferredCurrency) {
    if (!text) return Number.NEGATIVE_INFINITY;

    const compact = U.normalizeWhitespace(text);
    if (!compact) return Number.NEGATIVE_INFINITY;

    const hasPriceSignal =
      /A\$|\$|€|£|\b(AUD|USD|EUR|GBP)\b/i.test(compact) ||
      /\bprice\b/i.test(compact);

    if (!hasPriceSignal && !/^\d+(?:\.\d{1,2})?$/.test(compact)) {
      return Number.NEGATIVE_INFINITY;
    }

    if (/\b(?:mg\/mL|ug\/mL|µg|uL|mL|g|kg|dilution|clone)\b/i.test(compact)) {
      return Number.NEGATIVE_INFINITY;
    }

    let score = 0;

    if (/A\$|\$|€|£|\b(AUD|USD|EUR|GBP)\b/i.test(compact)) score += 50;
    if (preferredCurrency && new RegExp(`\\b${preferredCurrency}\\b`, "i").test(compact)) score += 20;
    if (/\bprice\b/i.test(compact)) score += 15;
    if (/\beach\b/i.test(compact)) score += 10;
    if (compact.length <= 40) score += 15;
    if (compact.length <= 18) score += 10;

    const attrText = [
      el?.id || "",
      el?.className || "",
      el?.getAttribute?.("data-testid") || "",
      el?.getAttribute?.("aria-label") || ""
    ].join(" ");

    if (/price/i.test(attrText)) score += 35;

    if (typeof el?.getBoundingClientRect === "function") {
      const rect = el.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < 900) score += 10;
      if (typeof window.innerWidth === "number" && rect.left > window.innerWidth / 2) score += 10;
    }

    return score;
  }

  function extractBestPriceText(preferredCurrency) {
    const selectors = [
      '[itemprop="price"]',
      '[itemprop="offers"] [itemprop="price"]',
      'meta[itemprop="price"]',
      '[data-testid*="price" i]',
      '[class*="price" i]',
      '[id*="price" i]',
      '[aria-label*="price" i]'
    ];

    const seen = new Set();
    const candidates = [];

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
          U.normalizeWhitespace(el.getAttribute?.("content") || ""),
          U.normalizeWhitespace(el.getAttribute?.("data-price") || "")
        ].filter(Boolean);

        for (const text of texts) {
          if (seen.has(text)) continue;
          seen.add(text);
          candidates.push({ text, el });
        }
      }
    }

    for (const el of Array.from(document.querySelectorAll("*"))) {
      const text = U.normalizeWhitespace(el.textContent || "");
      if (!text || text.length > 80 || seen.has(text)) continue;
      seen.add(text);
      candidates.push({ text, el });
    }

    const ranked = candidates
      .map(candidate => ({
        ...candidate,
        score: getPriceScore(candidate.text, candidate.el, preferredCurrency)
      }))
      .filter(candidate => Number.isFinite(candidate.score))
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.text || "";
  }

  function parseThermo() {
    const title = U.firstNonEmpty([
      U.textOf("h1"),
      U.attrOf('meta[property="og:title"]', "content")
    ]);

    const bodyText = document.body.innerText || "";
    const preferredCurrency = getPreferredCurrency();
    const urlCatalog = getCatalogFromUrl();

    const catalogMatch =
      bodyText.match(/\bCatalog\s*(?:number|no\.?)\s*[:\-]?\s*([A-Z0-9\-]+)/i) ||
      bodyText.match(/\bCat(?:alog)?\.?\s*(?:No\.?|#)\s*[:\-]?\s*([A-Z0-9\-]+)/i) ||
      bodyText.match(/\bProduct\s*#\s*([A-Z0-9\-]+)/i);

    const catalogNumber = /^(number|no)$/i.test(catalogMatch?.[1] || "")
      ? urlCatalog
      : (catalogMatch?.[1] || urlCatalog);

    const labeledAmount = U.extractLabeledValue(["Amount", "Quantity", "Size"]);
    const priceText = U.firstNonEmpty([
      extractBestPriceText(preferredCurrency),
      extractPriceFromJsonLd(preferredCurrency),
      U.extractLabeledValue(["Price", "Unit Price", "List Price"]),
      bodyText
    ]);
    const priceParsed = U.parsePrice(priceText, { preferredCurrency });

    const packSizeMatch = bodyText.match(
      /\b(\d+(?:\.\d+)?)\s?(?:µg|ug|mg|g|kg|mL|µL|uL|L|reactions|rxns|tests|units)\b/i
    );

    return {
      vendor: "Thermo Fisher Scientific",
      itemName: U.normalizeWhitespace(title),
      catalogNumber,
      packSize: labeledAmount || (packSizeMatch ? packSizeMatch[0] : ""),
      unitPrice: priceParsed.unitPrice,
      currency: priceParsed.currency,
      sourceUrl: location.href,
      parserUsed: "thermo",
      confidence: title && (labeledAmount || priceParsed.unitPrice) ? 0.9 : title ? 0.75 : 0.35
    };
  }

  window.ThermoParser = { parseThermo };
})();
