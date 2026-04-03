(function () {
  const U = window.ParserUtils;

  function normalizeCatalogNumber(raw) {
    return U.normalizeWhitespace(String(raw || ""))
      .replace(/^(?:catalog|cat\.?\s*no\.?|product|item|order|part|article|sku|商品コード)\s*[:#-]?\s*/i, "")
      .replace(/[()[\]]/g, "")
      .trim();
  }

  function normalizePackSize(raw) {
    return U.normalizeWhitespace(String(raw || ""))
      .replace(/\bug\b/gi, "µg")
      .replace(/\bUL\b/g, "uL")
      .replace(/\bul\b/g, "uL")
      .replace(/\bµl\b/g, "µL")
      .replace(/\bML\b/g, "mL")
      .replace(/\bml\b/g, "mL")
      .trim();
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

  function traverseJsonLd(visitor) {
    const queue = [...U.readJsonLd()];

    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;

      if (Array.isArray(current)) {
        queue.push(...current);
        continue;
      }

      if (typeof current !== "object") continue;
      visitor(current);
      queue.push(...Object.values(current));
    }
  }

  function getSiteName() {
    return U.firstNonEmpty([
      U.attrOf('meta[property="og:site_name"]', "content"),
      U.attrOf('meta[name="application-name"]', "content"),
      U.attrOf('meta[name="apple-mobile-web-app-title"]', "content")
    ]);
  }

  function humanizeVendorFromHost() {
    const hostname = location.hostname.replace(/^www\./i, "");
    const parts = hostname.split(".");
    const root = parts.length > 1 ? parts[parts.length - 2] : hostname;

    return root
      .replace(/[-_]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function cleanItemName(raw, vendor) {
    const text = U.normalizeWhitespace(String(raw || ""));
    if (!text) return "";

    const parts = text
      .split(/\s+[|:-]\s+/)
      .map(part => U.normalizeWhitespace(part))
      .filter(Boolean);

    if (!parts.length) return text;
    if (!vendor) return parts[0];

    const vendorLower = vendor.toLowerCase();
    const filtered = parts.filter(part => !part.toLowerCase().includes(vendorLower));
    return filtered[0] || parts[0];
  }

  function extractItemName(vendor) {
    return cleanItemName(U.firstNonEmpty([
      U.textOf("h1"),
      U.attrOf('meta[property="og:title"]', "content"),
      U.attrOf('meta[name="twitter:title"]', "content"),
      document.title
    ]), vendor);
  }

  function extractCatalogFromJsonLd() {
    let catalogNumber = "";

    traverseJsonLd(entry => {
      if (catalogNumber) return;

      const candidate = U.firstNonEmpty([
        entry.sku,
        entry.productID,
        entry.mpn
      ]);

      if (candidate) {
        catalogNumber = normalizeCatalogNumber(candidate);
      }
    });

    return catalogNumber;
  }

  function extractPriceFromJsonLd(preferredCurrency) {
    let parsed = { unitPrice: "", currency: "" };

    traverseJsonLd(entry => {
      if (parsed.unitPrice) return;
      if (!entry.offers) return;

      const offers = Array.isArray(entry.offers) ? entry.offers : [entry.offers];
      for (const offer of offers) {
        if (!offer || typeof offer !== "object") continue;

        const priceText = [
          offer.price,
          offer.lowPrice,
          offer.highPrice
        ].find(Boolean);

        if (!priceText) continue;

        parsed = U.parsePrice(
          `${priceText} ${offer.priceCurrency || preferredCurrency || ""}`.trim(),
          { preferredCurrency }
        );

        if (parsed.unitPrice) return;
      }
    });

    return parsed;
  }

  function extractPackSizeFromText(text) {
    const normalized = U.normalizeWhitespace(text);
    if (!normalized) return "";

    const labeledMatch = normalized.match(
      /\b(?:format|size|pack(?:\s*size)?|amount|volume|quantity)\b\s*[:#-]?\s*(\d+(?:\.\d+)?(?:\s*x\s*\d+(?:\.\d+)?)?\s*(?:µg|ug|mg|g|kg|mL|ML|ml|µL|µl|uL|ul|UL|L|l|tests?|units?|reactions?|rxns?|vials?|tubes?|assays?))\b/i
    );
    if (labeledMatch?.[1]) return normalizePackSize(labeledMatch[1]);

    const genericMatch = normalized.match(
      /\b(\d+(?:\.\d+)?(?:\s*x\s*\d+(?:\.\d+)?)?\s*(?:µg|ug|mg|g|kg|mL|ML|ml|µL|µl|uL|ul|UL|L|l|tests?|units?|reactions?|rxns?|vials?|tubes?|assays?))\b/i
    );
    return genericMatch?.[1] ? normalizePackSize(genericMatch[1]) : "";
  }

  function extractCatalogFromLine(line) {
    const labeledMatch = line.match(
      /\b(?:catalog(?:\s*(?:number|no\.?|#))?|cat\.?\s*no\.?|product\s*(?:code|number|no\.?|#)|item\s*(?:number|no\.?|#)|order\s*(?:number|no\.?|#)|part\s*(?:number|no\.?|#)|article\s*(?:number|no\.?|#)|sku|商品コード)\b\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{1,})/i
    );
    if (labeledMatch?.[1]) return normalizeCatalogNumber(labeledMatch[1]);

    const tokenMatch = line.match(/\b([A-Z]{1,6}[-.]?\d{2,}[A-Z0-9._/-]*)\b/);
    return tokenMatch?.[1] ? normalizeCatalogNumber(tokenMatch[1]) : "";
  }

  function findHeaderIndex(headers, patterns) {
    return headers.findIndex(header => patterns.some(pattern => pattern.test(header)));
  }

  function extractOptionsFromTables(preferredCurrency) {
    const options = [];
    const tables = Array.from(document.querySelectorAll("table"));

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 2) continue;

      const headerCells = Array.from(rows[0].querySelectorAll("th,td"))
        .map(cell => U.normalizeWhitespace(cell.textContent || "").toLowerCase());
      if (!headerCells.length) continue;

      const catalogIdx = findHeaderIndex(headerCells, [
        /catalog/,
        /cat\.?\s*no/,
        /product/,
        /item/,
        /order/,
        /part/,
        /article/,
        /sku/,
        /商品コード/
      ]);
      const sizeIdx = findHeaderIndex(headerCells, [
        /^size$/,
        /format/,
        /pack/,
        /amount/,
        /volume/,
        /quantity/
      ]);
      const priceIdx = findHeaderIndex(headerCells, [
        /your price/,
        /list price/,
        /^price$/,
        /unit price/
      ]);

      if (catalogIdx === -1 && sizeIdx === -1 && priceIdx === -1) continue;

      for (const row of rows.slice(1)) {
        const cells = Array.from(row.querySelectorAll("th,td"));
        if (!cells.length) continue;

        const texts = cells.map(cell => U.normalizeWhitespace(cell.textContent || ""));
        const rowText = texts.join(" ");
        const catalogNumber = normalizeCatalogNumber(
          texts[catalogIdx] || extractCatalogFromLine(rowText)
        );
        const packSize = normalizePackSize(
          texts[sizeIdx] || extractPackSizeFromText(rowText)
        );
        const priceCandidates = [];

        if (texts[priceIdx]) {
          priceCandidates.push(U.parsePrice(texts[priceIdx], { preferredCurrency }));
        }

        for (const text of texts) {
          const parsed = U.parsePrice(text, { preferredCurrency });
          if (parsed.unitPrice) priceCandidates.push(parsed);
        }

        const price = priceCandidates.find(candidate => candidate.unitPrice) || {
          unitPrice: "",
          currency: ""
        };

        if (!catalogNumber && !packSize && !price.unitPrice) continue;

        options.push({
          catalogNumber,
          packSize,
          listPrice: price.unitPrice,
          yourPrice: "",
          currency: price.currency || preferredCurrency
        });
      }
    }

    return dedupeOptions(options);
  }

  function extractOptionsFromLines(bodyText, preferredCurrency) {
    const lines = String(bodyText || "")
      .split("\n")
      .map(line => U.normalizeWhitespace(line))
      .filter(Boolean);

    const options = [];
    for (const line of lines) {
      const price = U.parsePrice(line, { preferredCurrency });
      const packSize = extractPackSizeFromText(line);
      const catalogNumber = extractCatalogFromLine(line);

      if (!catalogNumber || (!packSize && !price.unitPrice)) continue;

      options.push({
        catalogNumber,
        packSize,
        listPrice: price.unitPrice,
        yourPrice: "",
        currency: price.currency || preferredCurrency
      });
    }

    return dedupeOptions(options);
  }

  function extractSinglePrice(preferredCurrency) {
    const selectors = [
      '[itemprop="price"]',
      'meta[itemprop="price"]',
      '[data-testid*="price" i]',
      '[class*="price" i]',
      '[id*="price" i]'
    ];

    for (const selector of selectors) {
      const text = U.firstNonEmpty([
        U.textOf(selector),
        U.attrOf(selector, "content")
      ]);
      const parsed = U.parsePrice(text, { preferredCurrency });
      if (parsed.unitPrice) return parsed;
    }

    const labeledText = U.firstNonEmpty([
      U.extractLabeledValue(["price", "list price", "unit price", "your price"]),
      document.body?.innerText || ""
    ]);

    return U.parsePrice(labeledText, { preferredCurrency });
  }

  function parseGeneric() {
    const bodyText = document.body?.innerText || "";
    const siteName = getSiteName();
    const vendor = U.firstNonEmpty([siteName, humanizeVendorFromHost()]);
    const itemName = extractItemName(vendor);
    const preferredCurrency = "";

    const options = dedupeOptions([
      ...extractOptionsFromTables(preferredCurrency),
      ...extractOptionsFromLines(bodyText, preferredCurrency)
    ]);
    const selectedOptionIndex = 0;
    const selected = options[selectedOptionIndex] || null;

    const jsonLdCatalog = extractCatalogFromJsonLd();
    const labeledCatalog = U.extractLabeledValue([
      "catalog number",
      "catalog no",
      "cat. no",
      "product number",
      "product no",
      "product code",
      "sku",
      "item number",
      "item no",
      "order number",
      "part number",
      "article number",
      "商品コード"
    ]);

    const jsonLdPrice = extractPriceFromJsonLd(preferredCurrency);
    const pagePrice = extractSinglePrice(preferredCurrency);
    const selectedPrice = selected?.yourPrice || selected?.listPrice || "";
    const fallbackPrice = selectedPrice
      ? { unitPrice: selectedPrice, currency: selected?.currency || "" }
      : jsonLdPrice.unitPrice
      ? jsonLdPrice
      : pagePrice;

    const catalogNumber = U.firstNonEmpty([
      selected?.catalogNumber,
      normalizeCatalogNumber(labeledCatalog),
      jsonLdCatalog
    ]);
    const packSize = U.firstNonEmpty([
      selected?.packSize,
      normalizePackSize(U.extractLabeledValue(["format", "size", "pack size", "amount", "volume"])),
      extractPackSizeFromText(bodyText)
    ]);

    const signalCount = [
      itemName,
      catalogNumber,
      packSize,
      fallbackPrice.unitPrice,
      options.length ? "options" : ""
    ].filter(Boolean).length;

    return {
      vendor,
      itemName,
      catalogNumber,
      packSize,
      unitPrice: fallbackPrice.unitPrice,
      currency: fallbackPrice.currency,
      sourceUrl: location.href,
      parserUsed: "generic",
      confidence: Math.min(0.85, 0.15 + signalCount * 0.14),
      options,
      selectedOptionIndex,
      priceSource: selected?.yourPrice ? "yourPrice" : fallbackPrice.unitPrice ? "listPrice" : "none"
    };
  }

  window.GenericParser = { parseGeneric };
})();
