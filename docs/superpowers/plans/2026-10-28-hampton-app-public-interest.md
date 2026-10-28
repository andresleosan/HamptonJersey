# Public Interest Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A listing page on the website says "N people interested" above "Book a viewing" when 2 or more people are, with the panel's own count.

**Architecture:** The panel's interest rule (F3-A C10) moves to one shared SQL builder in `server/viewings.js`. `GET /api/listings` reads it for every live listing in the statement it already runs, `toPublic` keeps it only from 2, and `site/index.html` prints the line.

**Tech Stack:** Cloudflare Pages Functions, D1, plain JS site (`site/index.html`, `site/lib.js`), node:test with the node:sqlite D1 double, Playwright e2e (`tests/e2e.cjs`).

**Spec:** `docs/superpowers/specs/2026-10-28-hampton-app-public-interest-design.md` (P1–P9).

## Global Constraints

- Visible copy, exactly: `N people interested` and the note `Upcoming viewings, and those of the last 30 days that went well` (P1, D19 English).
- Below 2 the API sends `interest: null`, never 0 or 1 (P6). No name, email or phone in `GET /api/listings` (anti-goal).
- One rule for the panel and the website (P4): the panel's `active_interest` and the website's `interest` come from the same SQL builder.
- Shown on the listing page only, never on a Sold listing, never on cards, metadata or the mobile bar (P2, P5, P8).
- DESIGN.md: no new font, request, colour or `style=` attribute; Montserrat 14px 600 ink plus `.hint` (12px stone); a CSS dot in ink, no emoji, no bronze (P9); spacing from 4/8/12/16.
- No migration, no new endpoint (P7).
- `/avanzar`: one commit at the end with code, tests, `docs/roadmap/ESTADO.md`, the checklist, spec, plan and ledger. Tasks do not commit on their own.

## Review Focus

1. Exactly one interested person: `interest: null` and no line, never "1 people interested". Test in Task 1.
2. The same person twice (two viewings, email in another case, or phone only): counted once. Covered by the existing panel test plus the shared builder, and asserted in Task 1.
3. A Sold listing with interest: no line. Asserted in Task 2's e2e with the listings answer intercepted.
4. Expired or negative viewings (past request, proceed 31 days ago, cancelled, no-show, not interested) never count. Covered by the existing panel test, which now runs the shared builder.
5. Interest on a draft or archived listing never reaches the website, because `readLive` only returns live listings. Asserted in Task 1.

---

### Task 1: One interest rule, sent with the public listings

**Files:**
- Modify: `server/viewings.js` (new exports next to `plusDays`), `server/routes/listings.js:25-32` (`interestStatement`), `server/routes/public.js:15-24` (`readLive`), `server/listing.js:90-108` (`toPublic`)
- Move: the `captured` and `plan` helpers from `tests/server/viewings-admin.test.mjs:339-350` into `tests/server/helpers.mjs` (exported), so both test files use them
- Test: `tests/server/public.test.mjs`, `tests/server/listing.test.mjs`

**Interfaces:**
- Produces: `interestSql(id: string): string` in `server/viewings.js`, the scalar subquery `(SELECT COUNT(DISTINCT COALESCE(lower(email), phone)) FROM viewing_requests WHERE listing_id = <id> AND ((status IN ('requested', 'confirmed') AND date >= ?) OR (status = 'completed' AND outcome IN ('proceed', 'more_info') AND date >= ?)))`, where `id` is SQL (`"?"` or `"l.id"`); and `interestDates(today = jerseyToday()): [string, string]` = `[today, plusDays(today, -30)]`, bound right after any of `id`'s own binds.
- Produces: each public listing (`toPublic`) gains `interest: number | null`, the row's `active_interest` when it is 2 or more, else `null`.

- [ ] **Step 1: Write the failing tests**
  - `listing.test.mjs`, `test("P6: the public shape carries interest only from 2 people")`: `toPublic({...L, active_interest: n}, []).interest` is `null` for `undefined`, `0`, `1`, and `2`, `5` for `2`, `5`.
  - `public.test.mjs`, `test("GET /listings: interest is the panel's count from 2 people, null below, with no personal data")`. Sam requested on `nextWeekday()` gives `interest` `null`. Add `Ann@X.je` completed `proceed` 2 days ago (Jersey) and it is `2`, equal to the panel's `active_interest` (`GET /admin/listings/HE-R001` with `adminCookie()`). Sam again as `SAM@secret.je`, then a cancelled and a not-interested viewing: still `2`. Two people on draft `HE-R002`: absent from the answer. `JSON.stringify(r.data)` does not match `/Sam|secret|07797|Ann@X/i`.
  - `public.test.mjs`, `test("GET /listings reads interest through the (listing_id, date) index")`: `captured(env, /COUNT\(DISTINCT/)` during `GET /listings`, then `plan()` matches `/SEARCH viewing_requests USING INDEX viewing_listing \(listing_id=\? AND date>\?\)/` and does not match `/SCAN viewing_requests/`.
- [ ] **Step 2: Run** `node --test tests/server/public.test.mjs tests/server/listing.test.mjs`: the new tests fail (`interest` undefined).
- [ ] **Step 3: Implement.** `interestStatement` becomes `SELECT ${interestSql("?")} AS n` bound with `id, ...interestDates()`. Drop imports this leaves unused. `readLive`'s listings statement selects `l.*, ${interestSql("l.id")} AS active_interest`, bound with `...interestDates(), ...args`. `toPublic` adds `interest` with a comment citing §5.9 / P6.
- [ ] **Step 4: Run** `npm test`: everything passes, including the panel's interest tests in `viewings-admin.test.mjs`, which now run the shared builder.

### Task 2: The line on the listing page

**Files:**
- Modify: `site/index.html`: the CSS after `.summary .btns` (~line 286), `detail()` (~line 800, before `<div class="btns">`), the listings mapping (~line 1035, numeric keys)
- Test: `tests/e2e.cjs`

**Interfaces:**
- Consumes: `interest` from Task 1 (`null` or an integer of 2 or more).

- [ ] **Step 1: Write the failing e2e assertions** in `publicSite()`. Fixture: HE-R001 has 2 interested people (seed rows 1 and 4) and HE-C001 has 1.
  - On `/p/HE-R001`, `.summary .interest` reads `2 people interested` and the note, and its next element sibling is `.summary .btns`.
  - On `/p/HE-C001`, `.summary .interest` is absent.
  - On a fresh page with `/api/listings` intercepted so that HE-R001 is `status: "Sold"` with `interest: 3`, `.summary .interest` is absent.
  - The mobile detail shot keeps the line above the buttons.
- [ ] **Step 2: Implement.** Add `"interest"` to the mapping's `Number.isFinite` keys. In `detail()`, `${p.interest && !isSold(p) ? `<p class="interest"><b>${p.interest} people interested</b><span class="hint">…note…</span></p>` : ""}` just before `<div class="btns">`. CSS: `.interest{display:grid;gap:4px;margin:0}`, `.interest b{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}`, and `.interest b::before`, an 8px `currentColor` circle with `flex:none`.
- [ ] **Step 3: Run** `npm test`, `npm run build`, then reseed and run the e2e as in the header of `tests/e2e.cjs`. Expected: all pass.
- [ ] **Step 4: Look** at `/p/HE-R001` locally with Playwright MCP, desktop (1280) and phone (390): the line sits above the buttons, with no overlap or wrapping problem.

### Task 3: Records and the single commit

**Files:**
- Modify: `docs/roadmap/ESTADO.md` (F3 row and the date), `docs/roadmap/checklist-hampton-app.html` (`VIS-03` to `hecho`, `responsable` `—`, `hecho` text, `falta` empty, `evidencia` file:line, top-level `actualizado`)
- Create: `docs/superpowers/plans/2026-10-28-hampton-app-public-interest-ledger.md`

- [ ] **Step 1:** Update ESTADO.md, the checklist JSON and the ledger. Check that the JSON still parses: `python3 -c` with `json.loads` on the `datos` block.
- [ ] **Step 2:** Run `npm test` and `npm run build` again: they pass.
- [ ] **Step 3: Commit** everything in one commit, `Show how many people are interested on the listing page`.
