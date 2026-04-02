(function () {
  const U = window.ParserUtils;

  function parseMoney(text) {
    if (!text) return { amount: "", currency: "" };

    const cleaned = text.replace(/\s+/g, " ").trim();

    // Prefer AUD on the /en-au site when "$" is used
    const currency =
      cleaned.includes("A$") ? "AUD" :
      cleaned.includes("$") ? "AUD" :
      cleaned.includes("€") ? "EUR" :
      cleaned.includes("£") ? "GBP" : "";

    const m = cleaned.match(/(?:A\$|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)/);
    return {
      amount: m ? m[1].replace(/,/g, "") : "",
      currency
    };
  }

  function looksLikeCatalogNumber(text) {
    return /^[A-Z]\d{3,6}[A-Z0-9\-]*$/i.test((text || "").trim());
  }

  function normalizePackSize(raw) {
    return U.normalizeWhitespace(String(raw || ""))
      .replace(/\bUL\b/g, "uL")
      .replace(/\bML\b/g, "mL")
      .trim();
  }

  function extractSingleOptionFromLine(line) {
    const normalized = U.normalizeWhitespace(line);
    const catalogMatch = normalized.match(/^([A-Z]\d{3,6}[A-Z0-9\-]*)\b/i);
    if (!catalogMatch) return null;

    const prices = Array.from(normalized.matchAll(/\$[\d,]+(?:\.\d{1,2})?/g)).map(match => match[0]);
    if (!prices.length) return null;

    const remainder = normalized.slice(catalogMatch[0].length).trim();
    const firstPriceIndex = remainder.indexOf(prices[0]);
    if (firstPriceIndex === -1) return null;

    const details = remainder.slice(0, firstPriceIndex).trim();
    const detailMatch = details.match(/^(.*?)\s+(\d[\d,]*(?:\.\d+)?\s*(?:units|unit|reactions|reaction|rxns|tests|test|mL|µL|uL|L))$/i);

    const concentration = detailMatch ? U.normalizeWhitespace(detailMatch[1]) : "";
    const packSize = detailMatch ? normalizePackSize(detailMatch[2]) : "";

    const listPrice = parseMoney(prices[0]);
    const yourPrice = parseMoney(prices[1] || "");

    return {
      catalogNumber: catalogMatch[1],
      concentration,
      packSize,
      listPrice: listPrice.amount,
      yourPrice: yourPrice.amount,
      currency: yourPrice.currency || listPrice.currency || "AUD"
    };
  }

  function extractOptionRowsFromBodyText(bodyText) {
    const options = [];
    const lines = bodyText
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const option = extractSingleOptionFromLine(line);
      if (!option) continue;
      options.push(option);
    }

    return dedupeOptions(options);
  }

  function dedupeOptions(options) {
    const seen = new Set();
    return options.filter(opt => {
      const key = [
        opt.catalogNumber,
        opt.packSize,
        opt.listPrice,
        opt.yourPrice
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function chooseDefaultOption(options) {
    if (!options?.length) return null;

    // Prefer option with Your Price, else first valid option
    const withYourPrice = options.find(o => o.yourPrice);
    return withYourPrice || options[0];
  }

  function parseNeb() {
    const title = U.firstNonEmpty([
      U.textOf("h1"),
      U.attrOf('meta[property="og:title"]', "content")
    ]);

    const bodyText = document.body.innerText || "";

    const options = extractOptionRowsFromBodyText(bodyText);
    const selected = chooseDefaultOption(options);

    // Fallback if no option rows were found
    let fallbackCatalog = "";
    let fallbackPackSize = "";

    if (!selected) {
      const catalogFallback =
        bodyText.match(/\bCatalog\s*(?:#|No\.?)\s*([A-Z]\d+[A-Z0-9\-]*)\b/i) ||
        bodyText.match(/\b([A-Z]\d{3,6}[A-Z0-9\-]*)\b/);

      fallbackCatalog = catalogFallback?.[1] || "";

      const packFallback =
        bodyText.match(/\b\d[\d,]*(?:\.\d+)?\s*(?:units|unit|reactions|rxns|mL|µL|uL|L)\b/i);

      fallbackPackSize = packFallback ? normalizePackSize(packFallback[0]) : "";
    }

    const defaultPrice = selected?.yourPrice || selected?.listPrice || "";
    const defaultCurrency = selected?.currency || "AUD";

    return {
      vendor: "New England Biolabs",
      itemName: U.normalizeWhitespace(title),
      catalogNumber: selected?.catalogNumber || fallbackCatalog,
      concentration: selected?.concentration || "",
      packSize: selected?.packSize || fallbackPackSize,
      unitPrice: defaultPrice,
      currency: defaultCurrency,
      sourceUrl: location.href,
      parserUsed: "neb",
      confidence: options.length ? 0.95 : title ? 0.75 : 0.4,
      options,
      selectedOptionIndex: 0,
      priceSource: selected?.yourPrice ? "yourPrice" : selected?.listPrice ? "listPrice" : "none"
    };
  }

  window.NebParser = { parseNeb };
})();
