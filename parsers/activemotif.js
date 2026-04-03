(function () {
  const U = window.ParserUtils;

  function normalizeCatalogNumber(raw) {
    return U.normalizeWhitespace(String(raw || ""))
      .replace(/^(?:catalog|cat\.?\s*no\.?|product|sku|商品コード)\s*[:#-]?\s*/i, "")
      .trim();
  }

  function normalizePackSize(raw) {
    return U.normalizeWhitespace(String(raw || ""))
      .replace(/\bUL\b/g, "uL")
      .replace(/\bul\b/g, "uL")
      .replace(/\bµl\b/g, "µL")
      .replace(/\bML\b/g, "mL")
      .replace(/\bml\b/g, "mL")
      .trim();
  }

  function getCatalogFromUrl() {
    const match = location.pathname.match(/\/details\/([^/?#]+)/i);
    return match?.[1] ? normalizeCatalogNumber(match[1]) : "";
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

      if (!option.catalogNumber && !option.packSize && !option.listPrice) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function extractPackSize(text) {
    const normalized = U.normalizeWhitespace(text);
    if (!normalized) return "";

    const labeledMatch = normalized.match(
      /\b(?:format|size)\b\s*[:#-]?\s*(\d+(?:\.\d+)?\s*(?:µL|µl|uL|ul|UL|mL|ML|ml|L|µg|ug|mg|g|kg|tests?|units?|reactions?|rxns?))\b/i
    );
    if (labeledMatch?.[1]) return normalizePackSize(labeledMatch[1]);

    const genericMatch = normalized.match(
      /\b(\d+(?:\.\d+)?\s*(?:µL|µl|uL|ul|UL|mL|ML|ml|L|µg|ug|mg|g|kg|tests?|units?|reactions?|rxns?))\b/i
    );
    return genericMatch?.[1] ? normalizePackSize(genericMatch[1]) : "";
  }

  function extractOptionFromLine(line) {
    const normalized = U.normalizeWhitespace(line);
    if (!normalized) return null;

    const catalogMatch = normalized.match(
      /\b(?:商品コード|catalog(?:\s*(?:number|no\.?|#))?|cat\.?\s*no\.?|product\s*(?:code|number|no\.?|#)|sku)\b\s*[:#-]?\s*([A-Z0-9-]+)/i
    );
    if (!catalogMatch?.[1]) return null;

    const catalogNumber = normalizeCatalogNumber(catalogMatch[1]);
    const packSize = extractPackSize(normalized);
    const price = U.parsePrice(normalized);

    if (!packSize && !price.unitPrice) return null;

    return {
      catalogNumber,
      packSize,
      listPrice: price.unitPrice,
      yourPrice: "",
      currency: price.currency
    };
  }

  function extractOptionsFromBodyText(bodyText) {
    const lines = String(bodyText || "")
      .split("\n")
      .map(line => U.normalizeWhitespace(line))
      .filter(Boolean);

    const options = [];
    for (const line of lines) {
      const option = extractOptionFromLine(line);
      if (option) options.push(option);
    }

    return dedupeOptions(options);
  }

  function extractOptionsFromElements() {
    const elements = Array.from(document.querySelectorAll("p,li,div,span"));
    const options = [];

    for (const el of elements) {
      const text = U.normalizeWhitespace(el.textContent || "");
      if (!text || text.length > 180) continue;
      const option = extractOptionFromLine(text);
      if (option) options.push(option);
    }

    return dedupeOptions(options);
  }

  function parseActiveMotif() {
    const title = U.firstNonEmpty([
      U.textOf("h1"),
      U.attrOf('meta[property="og:title"]', "content"),
      document.title
    ]);
    const bodyText = document.body?.innerText || "";
    const options = dedupeOptions([
      ...extractOptionsFromBodyText(bodyText),
      ...extractOptionsFromElements()
    ]);
    const selectedOptionIndex = 0;
    const selected = options[selectedOptionIndex] || null;
    const fallbackPrice = U.parsePrice(
      U.extractLabeledValue(["price", "list price"]) || bodyText
    );

    return {
      vendor: "Active Motif",
      itemName: U.normalizeWhitespace(title),
      catalogNumber: U.firstNonEmpty([
        selected?.catalogNumber,
        normalizeCatalogNumber(
          U.extractLabeledValue([
            "catalog number",
            "catalog no",
            "cat. no",
            "product code",
            "sku",
            "商品コード"
          ])
        ),
        getCatalogFromUrl()
      ]),
      packSize: U.firstNonEmpty([
        selected?.packSize,
        normalizePackSize(U.extractLabeledValue(["format", "size"])),
        extractPackSize(bodyText)
      ]),
      unitPrice: selected?.listPrice || fallbackPrice.unitPrice,
      currency: selected?.currency || fallbackPrice.currency,
      sourceUrl: location.href,
      parserUsed: "activemotif",
      confidence: title && options.length ? 0.97 : title ? 0.82 : 0.45,
      options,
      selectedOptionIndex,
      priceSource: selected?.listPrice || fallbackPrice.unitPrice ? "listPrice" : "none"
    };
  }

  window.ActiveMotifParser = { parseActiveMotif };
})();
