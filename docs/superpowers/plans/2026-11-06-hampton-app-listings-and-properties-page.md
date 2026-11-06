# Listings filters (SPR-06, SPR-07) and the public Properties page (PUB-22) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the team Operation, Bedrooms, Price and «last 7 days» filters plus Checked / Matched / Interested
columns in /admin › Listings, and give the website a `/properties` page of its own with three big photo
buttons (Rent, Buy, Businesses), while the home page shows only the 5 newest listings with View all.

**Architecture:** The panel filters on the list it already loads; the list API adds `bedrooms`, a matched
count and the active-interest count in the same query. Migration 0021 adds `listings.published_at`, written by
the single publish path (`setState`) and sent by the public API as `publishedAt`. The site stays one
`site/index.html` with pushState routing: a new `/properties` route renders the catalogue; pure helpers live in
`site/lib.js` so `tests/lib.test.js` can pin them.

**Tech Stack:** Cloudflare Pages + Functions, D1 (SQLite), React 19 panel (Vite), vanilla JS site, `node --test`.

**Specs:** `docs/superpowers/specs/2026-11-05-hampton-app-listing-filters-design.md` (SPR-06),
`docs/superpowers/specs/2026-11-05-hampton-app-listing-tracking-design.md` (SPR-07),
`docs/superpowers/specs/2026-11-06-hampton-app-properties-page-design.md` (PUB-22).

## Global Constraints

- English UI copy on the site and panel; docs in Spanish.
- DESIGN.md tokens only: ink #151515, paper #ffffff, mist #f4f3f0, line #e3e0da, stone, bronze #a56b3d;
  Tenor Sans for display words, Montserrat for body; big buttons use `--r-lg` (24px).
- 44 px minimum targets, visible focus, `prefers-reduced-motion` disables zoom/width animation, no horizontal
  scroll at 390 px.
- No new dependencies, no new cookies (PRE-11), public API sends public data only.
- No destructive migration: `home_order` stays in the database.
- Tests: `npm test` after each task; `npm run build`; e2e per the header of `tests/e2e.cjs`.

## Review Focus

1. A listing whose `bedrooms` is NULL (commercial) must vanish as soon as either bedrooms bound is set, and
   show again when both go back to Any → test in Task 2.
2. A rental with `rent_period = 'week'` or `'year'` is compared by its monthly rent; a listing with no price
   (price_text only) is excluded once Min or Max is set → test in Task 2.
3. Republishing a listing that was unpublished moves it to the top of «newest»; saving an already
   published listing does not → test in Task 4.
4. `/properties?op=bogus` (or any unknown value) shows the mixed catalogue, never an empty page or an error
   → test in Task 5.
5. The home page with 0 unsold listings among the newest (all sold) still renders the section with View all,
   and never more than 5 cards → test in Task 5.

---

### Task 1: List API sends bedrooms, matched and interested

**Files:**
- Modify: `server/routes/listings.js` (`LIST_SQL`, `list()`)
- Test: `tests/server/admin.test.mjs`

**Interfaces:**
- Produces: each row of `GET /admin/listings` gains `bedrooms` (number|null), `matched` (count of `matches`
  rows for the listing, the same rows the editor lists), `interested` (`interestSql("l.id")`, bound with
  `interestDates()` after `now()`).

- [ ] **Step 1:** Test `list carries bedrooms, matched and interested`: seed a listing with bedrooms 3, two
  matches and one viewing that shows interest; assert `{bedrooms: 3, matched: 2, interested: 1}`, and a
  listing with none gets `{matched: 0, interested: 0}`.
- [ ] **Step 2:** Run `node --test tests/server/admin.test.mjs` → FAIL (fields undefined).
- [ ] **Step 3:** Add `l.bedrooms`, `(SELECT COUNT(*) FROM matches mm WHERE mm.listing_id = l.id) AS matched`,
  `(${interestSql("l.id")}) AS interested` to `LIST_SQL`; bind `...interestDates()` in `list()` (the parish
  branch too). Order of binds: the ones the SELECT uses first.
- [ ] **Step 4:** Run the test → PASS; `npm test` → all pass.

### Task 2: Pure filter rules for Listings

**Files:**
- Create: `admin/src/listing-filters.js`
- Test: `tests/server/listing-filters.test.mjs`

**Interfaces:**
- Produces:
  - `monthlyPrice(l) -> number|null`: sale → `sale_price`, business → `premium ?? sale_price`, rent → `rent`
    per month (`week` ×52/12, `year` /12, `month` or null as is); null when no amount.
  - `bedsRange(from, to) -> {from, to}`: strings "" (Any) or "0".."6"; when both set and from > to, `to = from`.
  - `passesExtra(l, f, today = new Date()) -> boolean` with `f = {op, bedsFrom, bedsTo, min, max, recent}`:
    op matches `l.operation`; beds bounds inclusive, NULL bedrooms fails once any bound is set; `min`/`max`
    (numbers or "") compare `monthlyPrice`, null price fails once any is set; `recent` keeps `updated_at` within
    the last 7 × 24 h.
  - `bedsLabel(n) -> string`: 0 → "Studio", n → `${n} bed`, null → "".
  - `daysAgo(iso, today = new Date()) -> string`: "today", "1 day ago", "12 days ago", "—" for null.
  - `OPERATION_FILTER = {sale: "To Buy", rent: "To Let", business: "Business"}`.

- [ ] **Step 1:** Tests: `beds range is inclusive and studio is 0` (from 3 to 5 keeps 3,4,5; 2–2 keeps only 2;
  0–0 keeps the studio); `unknown bedrooms leave once a bound is set` (Review Focus 1); `rent is compared per
  month` (week 500 → 2166.67 passes max 2200, year 24000 → 2000); `no price leaves once min or max is set`
  (Review Focus 2); `from above to raises to`; `recent means the last 7 days`; `daysAgo wording`.
- [ ] **Step 2:** Run `node --test tests/server/listing-filters.test.mjs` → FAIL (module missing).
- [ ] **Step 3:** Implement the module (plain ES module, no React import).
- [ ] **Step 4:** Run → PASS.

### Task 3: Listings screen: new filters and columns, no drag-to-order

**Files:**
- Modify: `admin/src/Listings.jsx`, `admin/src/admin.css` (only if the wider table needs it)
- Modify: `server/routes/listings.js` (remove `reorder` and its route), `tests/server/admin.test.mjs`,
  `tests/server/to-confirm.test.mjs` (drop the `/admin/listings/order` assertions)

**Interfaces:**
- Consumes: Task 1 fields, Task 2 helpers.

- [ ] **Step 1:** Remove `reorder`, `dragId`, `moveTo`, `canDrag`, the Order column and the drag hint; remove the
  `PUT /admin/listings/order` route and its tests. The ★ star stays.
- [ ] **Step 2:** Filters row, in this order after Search and Use: `Operation` select (All + `OPERATION_FILTER`),
  Region, Availability, Parish, `Bedrooms` as a fieldset with two selects `From` / `To` (Any, Studio, 1–6;
  `bedsRange` on change), `Min price` / `Max price` number inputs (£, step 1, min 0), and a checkbox
  `Changed in the last 7 days`. Clear filters and the empty-state condition include every new filter.
- [ ] **Step 3:** Columns after Price: `Checked` (`daysAgo(l.confirmed_at)`), `Matched` (`l.matched`),
  `Interested` (`l.interested`), each with `data-label` for the mobile cards. The grey line under the title:
  `${id} · ${OPERATION[op]}${bedsLabel ? " · " + bedsLabel : ""}`.
- [ ] **Step 4:** `npm test` and `npm run build` → pass.

### Task 4: Publish date (migration 0021) and the public `publishedAt`

**Files:**
- Create: `migrations/0021_published_at.sql`
- Modify: `server/routes/listings.js` (`setState`), `server/listing.js` (`toPublic`), `tests/server/schema.test.mjs`
  if it lists columns
- Test: `tests/server/listing.test.mjs` or `admin.test.mjs`, `tests/server/public.test.mjs`

**Interfaces:**
- Produces: `listings.published_at TEXT` (ISO, like `updated_at`); public field `publishedAt` (string|null).

- [ ] **Step 1:** Tests: `publishing stamps published_at only when it was hidden` (publish → set; save/publish
  again while published → unchanged; unpublish keeps it; publish again → newer) (Review Focus 3); public
  API sends `publishedAt`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Migration: `ALTER TABLE listings ADD COLUMN published_at TEXT;` then
  `UPDATE listings SET published_at = updated_at WHERE published = 1;`. In `setState`, the publish patch adds
  `published_at` written as `CASE WHEN published = 0 THEN ? ELSE published_at END` (the generic patch builder
  needs this one column special-cased). `toPublic` adds `publishedAt: l.published_at ?? null`.
- [ ] **Step 4:** Run → PASS; `npm test`.

### Task 5: Site helpers for the catalogue

**Files:**
- Modify: `site/lib.js` (and its `module.exports`)
- Test: `tests/lib.test.js`

**Interfaces:**
- Produces:
  - `newestFirst(a, b)`: `publishedAt` descending (null last), then id.
  - `homePicks(pub, n = 5)`: the first n of `pub` (already newest-first) that are not `isSold`.
  - `readCatalogQuery(search) -> {op, region, beds, max}`: `op` in sale|rent|business else "all"; `region` in
    jersey|uk|international else "all"; `beds` 0|2|3|4 else 0; `max` positive integer else 0.
  - `catalogQuery(f) -> string`: the inverse ("" when everything is default, `?op=rent&beds=2` otherwise).
  - `buttonPhoto(pub, op) -> string|null`: `image` of the newest listing of that operation, else null.

- [ ] **Step 1:** Tests: `newest first, unknown dates last`; `home picks skip sold and stop at 5`, including an
  all-sold list → `[]` (Review Focus 5); `catalog query ignores unknown values` (`?op=bogus` → all; Review
  Focus 4); `catalog query round-trips`; `button photo is the newest of its operation`.
- [ ] **Step 2:** Run `node --test tests/lib.test.js` → FAIL.
- [ ] **Step 3:** Implement in `site/lib.js`, export them.
- [ ] **Step 4:** Run → PASS.

### Task 6: `/properties` page, home page changes, redirects and sitemap

**Files:**
- Modify: `site/index.html`, `site/_redirects`, `server/seo.js` (`sitemapXml`), `tests/server/seo.test.mjs`,
  `tests/e2e.cjs`

**Interfaces:**
- Consumes: Task 4 `publishedAt`, Task 5 helpers.

- [ ] **Step 1:** Sitemap test: `/properties` is listed right after `/`. Run → FAIL; add it; → PASS.
- [ ] **Step 2:** Data: sort `PROPS` with `newestFirst` (replaces `rank`/`home_order`); parse `publishedAt` as a
  string or null. The hero carousel and `feat` follow that order.
- [ ] **Step 3:** Routing: the link interceptor and `route()` accept `/properties` (and `/properties/`, replaced
  by `/properties`); `route()` calls `properties()` there, with `document.title = "Properties · " + BRAND`;
  popstate re-renders with the query. Header nav «Properties» → `/properties`; not-found «See our properties»
  and the breadcrumb region link → `/properties` (the region link → `/properties?region=<r>`; drop the
  breadcrumb preset of `filter`).
- [ ] **Step 4:** `properties()`: eyebrow «Properties», `h1` «Find your home in Jersey», three photo buttons
  (`<button aria-pressed>` inside a `role="group" aria-label="Operation"`): Rent «Homes to let», Buy «Homes
  for sale», Businesses «Businesses for sale». Photo = `buttonPhoto(PUB, op)`, else `/og-image.jpg`. Pressing
  one sets `op` (pressing the pressed one, or «Show all», returns to all), `history.replaceState` with
  `catalogQuery`, and re-renders the grid only. Grid uses `card(p)`, newest first. With more than 5 published
  listings (the existing `FEW_MAX` rule) the Location tabs and the bedrooms + max-price line (moved from
  `home()`) appear under the buttons. Empty: «No properties here yet.» + «Register your search» (`#/apply`).
- [ ] **Step 5:** CSS (design A): `.op-buttons {display:flex; gap:12px; height:clamp(160px,28vw,320px)}`, each
  button `flex:1; border-radius:var(--r-lg); overflow:hidden; position:relative;` with a photo layer and a
  bottom dark gradient; hover/focus-visible: `flex:1.6` and photo `scale(1.06)` (0.6 s / 1.2 s,
  `cubic-bezier(.2,.8,.2,1)`); `[aria-pressed=true]` keeps the widened state plus a bronze underline on the word.
  ≤ 700 px: column, each 140 px high, no width change. `prefers-reduced-motion: reduce`: no transitions/scale.
- [ ] **Step 6:** `home()`: the section keeps `id="portfolio"`, eyebrow «Properties», h2 «Latest properties»,
  grid = `homePicks(PUB)`, then `View all properties` (`<a class="btn ghost" href="/properties">`). Remove the
  home's tabs, `#more` and its filter `render`; in full mode the quick-search form submits by navigating to
  `/properties` + `catalogQuery(...)`.
- [ ] **Step 7:** `_redirects`: `/properties` line removed (it is now a page); `/residential-properties
  /properties 301`; `/commercial-properties /properties?op=business 301`; `/copy-of-residential-properties
  /properties 301`.
- [ ] **Step 8:** e2e: home shows ≤ 5 cards and View all → `/properties`; header Properties → `/properties`;
  Rent/Buy/Businesses buttons set `aria-pressed` and the URL; `/properties?op=bogus` shows all; breadcrumb and
  not-found links land on `/properties`; `/commercial-properties` 301 → `/properties?op=business`; the panel's
  Listings: Operation/Bedrooms/Price/7 days filters, the three columns, no drag handle. Screenshots at 1280
  and 390.
- [ ] **Step 9:** `npm test`, `npm run build`, e2e from a clean seed → «e2e OK».

### Task 7: Docs in the same commit

**Files:** `docs/roadmap/checklist-hampton-app.html`, `docs/roadmap/ESTADO.md`,
`docs/roadmap/2026-10-23-arquitectura-hampton-app.md`, ledger
`docs/superpowers/plans/2026-11-06-hampton-app-listings-and-properties-page-ledger.md`.

- [ ] SPR-06 → hecho; SPR-07 → parcial (only Source left, block «Búsqueda del mercado con Hermes»); new PUB-22
  (section «Publicar propiedades», estado hecho once live); `actualizado` dates; ESTADO.md lines; architecture
  §5.3 and the public site paragraph mention `/properties` and the 5 newest; migration 0021 in §3's table list.
