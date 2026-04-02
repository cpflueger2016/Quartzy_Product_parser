(function () {
  const U = window.ParserUtils;

  function isCssNoise(text) {
    const normalized = U.normalizeWhitespace(text);
    return /[{};]/.test(normalized) && /(fill|clip-rule|stroke|opacity|display|font|margin|padding)/i.test(normalized);
  }

  function normalizePackSize(raw) {
    return U.normalizeWhitespace(String(raw || ""))
      .replace(/\bug\b/gi, "µg")
      .replace(/\bUL\b/g, "uL")
      .replace(/\bML\b/g, "mL")
      .trim();
  }

  function looksLikeStandalonePrice(text) {
    const normalized = U.normalizeWhitespace(text).replace(/,/g, "");
    if (!normalized) return false;

    if (/A\$|\$|€|£|\b(AUD|USD|EUR|GBP)\b/i.test(normalized)) return true;
    return /^\d{1,5}(?:\.\d{2})$/.test(normalized);
  }

  function isPlausiblePackSize(text) {
    const normalized = normalizePackSize(text);
    if (!normalized || isCssNoise(normalized)) return false;
    return /\b\d+(?:\.\d+)?\s*(?:µg|mg|g|kg|mL|µL|uL|L|reactions|reaction|rxns|tests|test|units|unit)\b/i.test(normalized);
  }

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

    if (!hasPriceSignal && !looksLikeStandalonePrice(compact)) {
      return Number.NEGATIVE_INFINITY;
    }

    if (/\b(?:mg\/mL|ug\/mL|µg|uL|mL|g|kg|dilution|clone)\b/i.test(compact)) {
      return Number.NEGATIVE_INFINITY;
    }

    if (!/A\$|\$|€|£|\b(AUD|USD|EUR|GBP)\b/i.test(compact) && !looksLikeStandalonePrice(compact)) {
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

  function extractAmountFromLines(text) {
    const lines = String(text || "")
      .split("\n")
      .map(line => U.normalizeWhitespace(line))
      .filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      if (!/^(amount|quantity|size)$/i.test(lines[i])) continue;

      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (isPlausiblePackSize(lines[j])) return normalizePackSize(lines[j]);
      }
    }

    return "";
  }

  function extractAmountFromText(text) {
    const normalized = U.normalizeWhitespace(text);
    if (!normalized) return "";

    const labeledMatch = normalized.match(
      /\b(?:amount|quantity|size)\b\s*[:\-]?\s*(\d+(?:\.\d+)?\s*(?:µg|ug|mg|g|kg|mL|µL|uL|L|reactions|reaction|rxns|tests|test|units|unit))\b/i
    );
    if (labeledMatch?.[1] && isPlausiblePackSize(labeledMatch[1])) {
      return normalizePackSize(labeledMatch[1]);
    }

    return "";
  }

  function extractPriceFromText(text, preferredCurrency) {
    const normalized = U.normalizeWhitespace(text);
    if (!normalized) return { unitPrice: "", currency: "" };

    const labeledMatch = normalized.match(
      /\b(?:price|list price|unit price)\b[^$A-Z0-9]{0,20}((?:A\$|\$)?\s*[\d,]+(?:\.\d{1,2})?\s*(?:\(?\s*AUD\s*\)?)?)/i
    );
    if (labeledMatch?.[1]) {
      const parsed = U.parsePrice(labeledMatch[1], { preferredCurrency });
      if (parsed.unitPrice) return parsed;
    }

    const audMatch = normalized.match(/((?:A\$|\$)?\s*[\d,]+(?:\.\d{1,2})?\s*(?:\(?\s*AUD\s*\)?))/i);
    if (audMatch?.[1]) {
      const parsed = U.parsePrice(audMatch[1], { preferredCurrency });
      if (parsed.unitPrice) return parsed;
    }

    return { unitPrice: "", currency: "" };
  }

  function scoreMarkupPriceSnippet(snippet, preferredCurrency, catalogNumber) {
    const normalized = U.normalizeWhitespace(snippet);
    if (!normalized) return Number.NEGATIVE_INFINITY;
    if (!/A\$|\$|€|£|\b(AUD|USD|EUR|GBP)\b|\d+\.\d{2}/i.test(normalized)) {
      return Number.NEGATIVE_INFINITY;
    }

    const parsed = U.parsePrice(normalized, { preferredCurrency });
    if (!parsed.unitPrice) return Number.NEGATIVE_INFINITY;

    let score = 0;
    if (/\b(price|listprice|unitprice|saleprice|offerprice|amount|yourprice|formattedprice)\b/i.test(normalized)) score += 40;
    if (/A\$|\bAUD\b/i.test(normalized)) score += 30;
    if (catalogNumber && normalized.includes(catalogNumber)) score += 20;
    if (normalized.length <= 220) score += 10;
    if (/["'{:,]/.test(normalized)) score += 5;

    return score;
  }

  function extractPriceFromMarkup(markup, preferredCurrency, catalogNumber) {
    const source = String(markup || "");
    if (!source) return { unitPrice: "", currency: "" };

    const snippets = [];
    const patterns = [
      /.{0,120}(?:price|listPrice|unitPrice|salePrice|offerPrice|formattedPrice|amount).{0,120}/gi,
      /.{0,80}(?:A\$|\$)\s*[\d,]+(?:\.\d{1,2})?.{0,40}/gi,
      /.{0,80}[\d,]+(?:\.\d{1,2})?\s*(?:AUD|USD|EUR|GBP).{0,40}/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(source)) !== null) {
        snippets.push(match[0]);
      }
    }

    if (catalogNumber) {
      const escapedCatalog = U.escapeRegExp(catalogNumber);
      const catalogPattern = new RegExp(`.{0,160}${escapedCatalog}.{0,160}`, "gi");
      let match;
      while ((match = catalogPattern.exec(source)) !== null) {
        snippets.push(match[0]);
      }
    }

    const ranked = snippets
      .map(snippet => ({
        snippet,
        score: scoreMarkupPriceSnippet(snippet, preferredCurrency, catalogNumber)
      }))
      .filter(item => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score);

    if (!ranked.length) return { unitPrice: "", currency: "" };
    return U.parsePrice(ranked[0].snippet, { preferredCurrency });
  }

  function parseThermo() {
    const title = U.firstNonEmpty([
      U.textOf("h1"),
      U.attrOf('meta[property="og:title"]', "content")
    ]);

    const bodyText = document.body.innerText || "";
    const textContent = document.body.textContent || "";
    const htmlContent = document.documentElement?.innerHTML || "";
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
    const amount = [
      labeledAmount,
      extractAmountFromLines(bodyText),
      extractAmountFromText(bodyText),
      extractAmountFromText(textContent)
    ].map(normalizePackSize).find(isPlausiblePackSize) || "";

    const textPrice = [
      extractPriceFromText(bodyText, preferredCurrency),
      extractPriceFromText(textContent, preferredCurrency),
      extractPriceFromMarkup(htmlContent, preferredCurrency, catalogNumber)
    ].find(price => price.unitPrice) || { unitPrice: "", currency: "" };

    const priceText = U.firstNonEmpty([
      textPrice.unitPrice ? `${textPrice.unitPrice} ${textPrice.currency || preferredCurrency}`.trim() : "",
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
      packSize: amount || (packSizeMatch ? normalizePackSize(packSizeMatch[0]) : ""),
      unitPrice: priceParsed.unitPrice,
      currency: priceParsed.currency,
      sourceUrl: location.href,
      parserUsed: "thermo",
      confidence: title && (amount || priceParsed.unitPrice) ? 0.9 : title ? 0.75 : 0.35
    };
  }

  window.ThermoParser = { parseThermo };
})();
