# Quartzy Capture Extension — Project Handoff

## Project goal

Build a **Chrome extension** that captures reagent/product information from supplier product pages and prepares it for later submission into Quartzy.

The project is intentionally split into phases:

1. **Phase 1:** parser-first MVP
2. **Phase 2:** human-in-the-loop review UI refinement
3. **Phase 3:** Quartzy API integration
4. **Phase 4:** history, favorites, shared lab workflows, and broader vendor support

The current focus is **Phase 1 only**:
- detect supported vendor product pages
- extract product metadata
- present it in a side panel
- support multiple purchasable variants when present
- let the user inspect the parsed result before any submission workflow exists

---

## Why this architecture

The user’s pain point is repeated manual copy-paste from vendor websites into Quartzy:
- vendor
- item name
- catalog number / SKU
- pack size
- quantity
- price

The most feasible and scalable approach is:

**Chrome extension + vendor-specific parsers + human review + later Quartzy API submission**

Why:
- avoids fragile scraping of Quartzy’s web UI
- keeps a human confirmation step
- allows high reliability on a small number of important supplier sites first
- maps well to Chrome extension architecture

---

## MVP scope

### In scope
- Chrome extension, Manifest V3
- Product-page parsing for:
  - Thermo Fisher
  - NEB
  - Sigma-Aldrich / MilliporeSigma
- Side panel UI to display extracted values
- Multi-option handling where pages expose multiple orderable variants
- Optional / missing price support
- Manual review before anything else happens

### Out of scope for now
- Quartzy submission
- authentication to Quartzy
- batch ordering
- cart scraping
- search-result page scraping
- OCR / PDF scraping
- Safari build
- shared backend

---

## Current implementation concept

### Extension components

#### 1. `manifest.json`
Defines:
- MV3 manifest
- permissions
- host permissions for supported vendors
- service worker
- side panel
- content scripts

#### 2. `background.js`
Responsible for:
- opening side panel on extension click
- receiving capture payloads
- later can manage on-demand script injection if needed

#### 3. `content.js`
Runs inside supported vendor pages.
Responsibilities:
- detect vendor
- run vendor-specific parser
- assemble normalized payload
- return payload to side panel / storage

#### 4. `sidepanel.html` + `sidepanel.js`
User-facing review interface.
Responsibilities:
- show extracted fields
- support refresh from page
- support product option dropdown
- later allow quantity / notes / Quartzy destination fields

#### 5. `parsers/`
Vendor-specific parsing logic:
- `base.js`
- `thermo.js`
- `neb.js`
- `sigma.js`
- `index.js`

---

## Proposed file structure

```text
quartzy-capture/
  manifest.json
  background.js
  content.js
  sidepanel.html
  sidepanel.js
  styles.css
  parsers/
    base.js
    thermo.js
    neb.js
    sigma.js
    index.js
```

---

## Data model

Use a normalized internal object.

```ts
type CaptureOption = {
  catalogNumber?: string;
  concentration?: string;
  packSize?: string;
  listPrice?: string;
  yourPrice?: string;
  currency?: string;
};

type CapturedItem = {
  vendor: string;
  itemName: string;
  catalogNumber: string;
  concentration?: string;
  packSize?: string;
  unitPrice?: string;
  currency?: string;
  sourceUrl: string;
  parserUsed: string;
  confidence: number;
  priceMissing: boolean;
  quoteRequired: boolean;
  priceSource?: "yourPrice" | "listPrice" | "none";
  options?: CaptureOption[];
  selectedOptionIndex?: number;
};
```

### Design note
There is an important distinction between:
- **product family**: e.g. “Hot Start Taq DNA Polymerase”
- **orderable variant**: e.g. `M0495S` or `M0495L`

That is why `options[]` is part of the model.

---

## Parsing strategy

### General rule
Prefer **structured extraction** over generic regex.

Parsing priority:
1. page-specific DOM selectors
2. structured metadata (JSON-LD, schema.org, embedded product data)
3. vendor-specific row/table parsing
4. text heuristics / regex fallback
5. manual correction in the UI

### Why
Supplier sites vary widely.
A parser that tries to be “generic” too early becomes brittle.

---

## Vendor-specific strategy

## 1. NEB
This is currently the best early target.

### Observed page pattern
NEB product pages may contain a table with:
- Catalog #
- Concentration
- Size
- List Price
- Your Price
- Quantity

### Required parser behavior
- parse all options / rows, not just one product-level value
- capture:
  - catalog number
  - concentration
  - pack size
  - list price
  - your price
  - currency
- expose options via dropdown in side panel
- default to **Your Price** when numeric
- otherwise fall back to **List Price**
- if neither is available, leave blank and mark as quote/manual

### Current known issue already identified
A regex-based pack-size parser captured `000 units` instead of `1000 units`.
Root cause:
- parsing from a broad text block instead of row-level extraction

### Fix direction
- parse row-level option data first
- use regex only as fallback

---

## 2. Thermo Fisher
Likely to be more variable than NEB.

### Expected challenges
- dynamic content
- region/account-specific pricing
- multiple packaging options
- price visibility varies by login/account

### Parser priority
- get title and catalog number robustly first
- then support options / packaging variants
- treat price as optional

---

## 3. Sigma-Aldrich / MilliporeSigma
Likely one of the more complex suppliers.

### Expected challenges
- regional differences
- account-specific pricing
- multiple packaging variants
- quote-driven workflows
- variable product page structure

### Parser priority
- identify product and catalog number reliably
- support multiple package sizes where visible
- price optional
- stronger review UI warnings when confidence is low

---

## UI plan

## Side panel MVP fields

### Read-only or editable extracted fields
- Vendor
- Item name
- Product option dropdown
- Catalog number
- Concentration
- Pack size
- Unit price
- Currency
- Source URL
- Parser used
- Confidence
- Quote required checkbox

### UX behavior
- if multiple options exist, dropdown appears
- selecting a different option updates:
  - catalog number
  - concentration
  - pack size
  - unit price
  - currency
  - price source
- if price missing, mark `quoteRequired = true`

---

## Messaging flow

### Current conceptual flow
1. user opens supported product page
2. user clicks extension
3. side panel opens
4. content script parses the current page
5. payload is stored in session storage
6. side panel renders payload
7. user can click “Refresh from page”

### Known Chrome extension caveat
If `chrome.tabs.sendMessage()` is called but the content script is not currently loaded into the tab, Chrome throws:

> Could not establish connection. Receiving end does not exist.

### Recommended fix
Either:
- refresh the vendor page after reloading the extension

or better:
- add `"scripting"` permission
- inject parser/content scripts on demand via `chrome.scripting.executeScript(...)`

This is the more robust development workflow.

---

## Recommended technical stack

- **Manifest V3**
- **TypeScript** if refactoring soon
- **Plain JS acceptable** for initial iteration
- **React** optional for side panel if UI grows
- **Vite** if converting to structured extension build
- Chrome Storage API for local/session state
- saved vendor HTML snapshots for parser regression tests

### Practical note
If moving this into Codex for rapid iteration, it would be worth considering an early refactor from plain `.js` files to a small TypeScript + Vite extension project once the parsing logic stabilizes.

---

## Development milestones

## Milestone 1 — parser-first capture
Goal:
- reliable capture into side panel without Quartzy submission

Tasks:
- set up extension shell
- detect supported vendors
- build parser dispatcher
- implement NEB parser
- implement Thermo parser
- implement Sigma parser
- side panel rendering
- refresh/capture workflow
- handle missing prices

Success criteria:
- parsed payload visible in side panel
- at least one real product page per vendor works end to end

---

## Milestone 2 — multi-option products
Goal:
- support products with multiple purchasable variants

Tasks:
- return `options[]` from parser
- add dropdown to side panel
- apply selected option to displayed fields
- prefer `yourPrice` over `listPrice`
- fix pack-size extraction bug

Success criteria:
- NEB multi-size page works correctly
- selecting option updates displayed fields cleanly

---

## Milestone 3 — reliability hardening
Goal:
- reduce parser brittleness

Tasks:
- move from broad regex matching to targeted DOM parsing
- add on-demand content script injection
- improve error handling in side panel
- add unsupported-page messaging
- create parser test cases from saved HTML

Success criteria:
- fewer messaging failures after extension reload
- repeatable parser behavior on sample pages

---

## Milestone 4 — Quartzy integration
Goal:
- submit reviewed capture to Quartzy

Planned tasks:
- token setup
- fetch labs
- fetch request types
- submit order request
- quantity/project/notes fields in side panel
- response handling / success state

Not currently being implemented.

---

## Known issues and lessons learned so far

### 1. Chrome messaging error
Error:
`Could not establish connection. Receiving end does not exist.`

Meaning:
- side panel tried to message a tab without an active content script listener

Fix:
- refresh tab after extension reload
- or better, inject scripts on demand

### 2. NEB pack size parsing bug
Observed:
- `1000 units` became `000 units`

Fix:
- parse option rows rather than broad text regex

### 3. Multi-option product pages need structured option handling
Observed:
- product pages can have several purchasable sizes/SKUs

Fix:
- model `options[]`
- give the user a dropdown selector

### 4. Price source hierarchy matters
Preferred order:
1. Your Price
2. List Price
3. blank + quote/manual

---

## Immediate next priorities

### Priority 1
Stabilize NEB parser:
- row-level extraction
- multi-option dropdown
- price preference logic

### Priority 2
Refactor messaging:
- add graceful error handling
- optionally implement script injection with `chrome.scripting`

### Priority 3
Collect and test with real product URLs:
- 5–10 NEB examples
- 5–10 Thermo examples
- 5–10 Sigma examples

### Priority 4
Introduce regression-style parser testing
Recommended:
- save representative HTML pages
- run parser functions against local snapshots

---

## Suggested Codex prompt / handoff summary

Use something like this:

> Build and iterate a Chrome Manifest V3 extension called Quartzy Capture.  
> Phase 1 is parser-only.  
> It should parse reagent/product pages from Thermo Fisher, NEB, and Sigma-Aldrich / MilliporeSigma.  
> Show extracted product metadata in a side panel.  
> Support multiple orderable options on a single page via an `options[]` model and a dropdown in the UI.  
> For NEB, prefer `Your Price` over `List Price`, but fall back to `List Price` if necessary.  
> Price may be missing and should not block capture.  
> Add robust handling for extension reloads by avoiding messaging failures when content scripts are not loaded.  
> Keep Quartzy API integration out of scope for now.

---

## Engineering recommendations for next iteration

1. Keep parser logic separate from UI logic.
2. Favor row-level / selector-level parsing over body-text regex.
3. Add test fixtures early.
4. Keep all fields editable in the side panel.
5. Do not attempt full automation without review.
6. Delay Quartzy submission until parsing quality is good.

---

## Future roadmap beyond parser MVP

### Short-term
- quantity field
- notes field
- save recent captures
- parser confidence warnings
- unsupported page messaging

### Medium-term
- Quartzy API submission
- project / cost code fields
- duplicate request detection
- favorites / reorder support

### Longer-term
- Safari packaging
- shared lab item memory
- admin settings
- broader vendor library
- batch/cart-based capture

---

## Definition of success for Phase 1

The extension is successful when a user can:
1. open a supported vendor product page
2. click the extension
3. see the correct product details in the side panel
4. choose the right product variant if multiple options exist
5. manually correct anything if needed
6. trust that the captured data is good enough for later Quartzy submission

That is the right stopping point before building the Quartzy connector.
