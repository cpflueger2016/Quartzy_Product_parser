(function () {
  function textOf(selector, root = document) {
    const el = root.querySelector(selector);
    return el?.textContent?.trim() || "";
  }

  function attrOf(selector, attr, root = document) {
    const el = root.querySelector(selector);
    return el?.getAttribute(attr)?.trim() || "";
  }

  function firstNonEmpty(values) {
    return values.find(v => v && String(v).trim()) || "";
  }

  function normalizeWhitespace(str) {
    return (str || "").replace(/\s+/g, " ").trim();
  }

  function escapeRegExp(str) {
    return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeLabel(str) {
    return normalizeWhitespace(str)
      .replace(/\s*[:*]+\s*$/, "")
      .toLowerCase();
  }

  function getTextContent(node) {
    return normalizeWhitespace(node?.textContent || "");
  }

  function findSiblingValue(el) {
    if (!el) return "";

    const next = getTextContent(el.nextElementSibling);
    if (next) return next;

    const parent = el.parentElement;
    if (!parent) return "";

    const children = Array.from(parent.children);
    const idx = children.indexOf(el);
    if (idx === -1) return "";

    for (let i = idx + 1; i < children.length; i++) {
      const text = getTextContent(children[i]);
      if (text) return text;
    }

    return "";
  }

  function extractLabeledValue(labels, root = document) {
    const wanted = (Array.isArray(labels) ? labels : [labels])
      .map(normalizeLabel)
      .filter(Boolean);

    if (!wanted.length) return "";

    const selector = [
      "dt",
      "dd",
      "th",
      "td",
      "label",
      "strong",
      "b",
      "span",
      "div",
      "p",
      "li",
      "h2",
      "h3",
      "h4",
      "h5"
    ].join(",");

    const elements = Array.from(root.querySelectorAll(selector));

    for (const el of elements) {
      const labelText = normalizeLabel(el.textContent || "");
      if (!wanted.includes(labelText)) continue;

      if (el.tagName === "DT") {
        const dd = getTextContent(el.nextElementSibling);
        if (dd) return dd;
      }

      if (el.tagName === "TH" || el.tagName === "TD") {
        const row = el.closest("tr");
        if (row) {
          const cells = Array.from(row.children);
          const idx = cells.indexOf(el);
          if (idx !== -1 && cells[idx + 1]) {
            const text = getTextContent(cells[idx + 1]);
            if (text) return text;
          }
        }
      }

      const siblingValue = findSiblingValue(el);
      if (siblingValue) return siblingValue;

      const parent = el.parentElement;
      if (parent) {
        const parentText = getTextContent(parent);
        if (parentText) {
          for (const label of wanted) {
            const regex = new RegExp(`^${escapeRegExp(label)}\\s*:?\\s*(.+)$`, "i");
            const match = parentText.match(regex);
            if (match?.[1]) return normalizeWhitespace(match[1]);
          }
        }
      }
    }

    const fallbackText = root.body?.innerText || root.documentElement?.innerText || "";
    for (const label of wanted) {
      const regex = new RegExp(
        `${escapeRegExp(label)}\\s*:?\\s*(?:\\n\\s*)?([^\\n]+)`,
        "i"
      );
      const match = fallbackText.match(regex);
      if (match?.[1]) return normalizeWhitespace(match[1]);
    }

    return "";
  }

  function parsePrice(text, options = {}) {
    if (!text) return { unitPrice: "", currency: "" };

    const normalized = normalizeWhitespace(text).replace(/,/g, "");
    const preferredCurrency = (options.preferredCurrency || "").toUpperCase();

    const symbolEntries = [
      { symbol: "A$", currency: "AUD" },
      { symbol: "$", currency: preferredCurrency || "USD" },
      { symbol: "€", currency: "EUR" },
      { symbol: "£", currency: "GBP" }
    ];

    for (const entry of symbolEntries) {
      const regex = new RegExp(`${escapeRegExp(entry.symbol)}\\s*(\\d+(?:\\.\\d{1,2})?)`, "i");
      const match = normalized.match(regex);
      if (match) {
        return { unitPrice: match[1], currency: entry.currency };
      }
    }

    const codeBefore = normalized.match(/\b(AUD|USD|EUR|GBP)\s*(\d+(?:\.\d{1,2})?)\b/i);
    if (codeBefore) {
      return { unitPrice: codeBefore[2], currency: codeBefore[1].toUpperCase() };
    }

    const codeAfter = normalized.match(/\b(\d+(?:\.\d{1,2})?)\s*(?:\(?\s*(AUD|USD|EUR|GBP)\s*\)?)\b/i);
    if (codeAfter) {
      return { unitPrice: codeAfter[1], currency: codeAfter[2].toUpperCase() };
    }

    if (/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      return { unitPrice: normalized, currency: preferredCurrency };
    }

    if (/\b(price|each|order|buy|quote)\b/i.test(normalized)) {
      const plain = normalized.match(/(\d+(?:\.\d{1,2})?)/);
      if (plain) {
        return {
          unitPrice: plain[1],
          currency: preferredCurrency
        };
      }
    }

    return { unitPrice: "", currency: "" };
  }

  function readJsonLd() {
    const scripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    );

    const parsed = [];
    for (const script of scripts) {
      try {
        const json = JSON.parse(script.textContent);
        parsed.push(json);
      } catch (_) {
        // ignore bad JSON-LD
      }
    }
    return parsed;
  }

  window.ParserUtils = {
    textOf,
    attrOf,
    firstNonEmpty,
    normalizeWhitespace,
    escapeRegExp,
    normalizeLabel,
    extractLabeledValue,
    parsePrice,
    readJsonLd
  };
})();
