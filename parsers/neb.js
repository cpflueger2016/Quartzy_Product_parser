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

  function extractOptionRowsFromBodyText(bodyText) {
    const options = [];
    const lines = bodyText
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Example row from NEB page text:
      // M0495S 5,000 units/ml  200 units  $150.10 Sign In Sign In
      const m = line.match(
        /^([A-Z]\d{3,6}[A-Z0-9\-]*)\s+([\d,]+(?:\.\d+)?\s*[A-Za-z\/µμ]+)\s+([\d,]+(?:\.\d+)?\s*(?:units|unit|reactions|rxns|mL|µL|uL|L))\s+(\$[\d,]+(?:\.\d{1,2})?)(?:\s+(.+?))?(?:\s+(.+?))?$/i
      );

      if (!m) continue;

      const catalogNumber = m[1];
      const concentration = m[2];
      const packSize = m[3];
      const listPriceRaw = m[4];
      const yourPriceRaw = (m[6] || m[5] || "").trim();

      const listPrice = parseMoney(listPriceRaw);
      const yourPrice =
        /sign in/i.test(yourPriceRaw) || !yourPriceRaw
          ? { amount: "", currency: listPrice.currency }
          : parseMoney(yourPriceRaw);

      options.push({
        catalogNumber,
        concentration,
        packSize,
        listPrice: listPrice.amount,
        yourPrice: yourPrice.amount,
        currency: yourPrice.currency || listPrice.currency || "AUD"
      });
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

      fallbackPackSize = packFallback ? packFallback[0] : "";
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