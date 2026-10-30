# Listings To Confirm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A published listing still on the market that nobody has confirmed for 3 months (1 for a rental) shows as "To confirm" in the panel until someone presses "Still available" after calling the owner (ADM-04).

**Architecture:** One column, `listings.confirmed_at`, set by the actions that prove the listing is still on the market. One SQL fragment, `TO_CONFIRM` in `server/listing.js`, decides "due" at read time. The listings list, every listing read and the bar's counts poll all use it, so nothing is stored and the clock (AUT-07) isn't involved. The panel shows the count next to Listings, a "To confirm" tab, a badge, and a note with the button in the editor.

**Tech Stack:** Cloudflare Pages Functions, D1, React panel (`admin/src`), node:test with the node:sqlite D1 double, Python unittest for the import, Playwright e2e (`tests/e2e.cjs`).

**Spec:** `docs/superpowers/specs/2026-10-30-hampton-app-to-confirm-design.md` (T1–T12).

## Global Constraints

- Due when, all at once: `published = 1`, `archived_at IS NULL`, `availability IN ('for_sale','to_let','lease','not_stated')`, and `confirmed_at + 3 months <= now` (operation `sale` or `business`) or `confirmed_at + 1 month <= now` (operation `rent`). Calendar months, added to `confirmed_at` (never subtracted from now), so a listing's due moment is fixed and never flips back. `confirmed_at` NULL is never due (T1, T3, T10).
- `confirmed_at` = the time of: Publish; an editor save that changes `availability`, `sale_price`, `rent` or `premium` by value; a Sales availability move (`availabilityTo`); "Still available". Nothing else, including text, photos, specs, star, home order (T2).
- "Still available" leaves `updated_at` alone (T8) and is accepted on any listing (T11).
- The website and `GET /api/listings` are unchanged (T6). No owner contact and no other personal data (T7). No Inbox notice: the count is its own number like `sales` and `rentals`, outside `action`.
- Copy (D19), exactly: tab and badge `To confirm`; button `Still available`; editor note `Last confirmed {date}: call the owner to check it is still available.` (changed after the final review); confirmed line `Availability confirmed {date}` (T12); empty tab `No listings to confirm. A listing on the website asks for a call to its owner 3 months after its last confirmation, or 1 month for a rental.`; after confirming `{title}: confirmed as still available.`; bar count followed by the screen-reader text ` to confirm`. `{date}` is the Jersey day of `confirmed_at` as "27 Oct 2026".
- DESIGN.md:
  - badge `.badge.attention` ("To confirm" sits in the *attention* row of «Badges de estado»);
  - note `.warn` and button `.btn.sm`;
  - bar number `.count` with `.sr` text, as Sales and Rentals;
  - *Text-Not-Color*: the state always carries its text;
  - messages as `<p role="status" class="ok">` or `role="alert" class="err"` next to the action;
  - empty state with its cause, different from the filtered-to-nothing one;
  - no new token, font or `style=` attribute; spacing 4/8/12/16/24;
  - no `dangerouslySetInnerHTML`; API errors as text;
  - targets at least 24px (32px advised in the panel).
- Performance: no new request. The count rides the existing 30 s counts poll, and the list and the editor get `to_confirm` from the reads they already make. The poll's count reads the partial index `listings_live`, never `SCAN listings`.
- `/avanzar`: one commit at the end with code, tests, migration, `docs/roadmap/ESTADO.md`, the checklist, the architecture (Hermes, §6.6), spec, plan and ledger. Luis applies 0017 remotely before the push.

## Review Focus

1. The editor has unsaved edits and the user presses "Still available": the typed edits stay, and the next Save doesn't get a false 409. Unit test in Task 1 (`updated_at` unchanged); e2e in Task 2 (title typed, then confirm, value kept).
2. The editor sends every field on each save, so an unchanged price must not confirm: the comparison is by value, and an integer price stored as REAL counts as unchanged. Test in Task 1.
3. Month ends: a sale confirmed on 2 Mar 2027 12:00 is not due on 31 May or 1 Jun and is due from 2 Jun 12:00 onwards. A sale confirmed on 30 Nov 2026 is due on 2 Mar 2027 (SQLite rolls 30 Feb over), never on 28 Feb. Test in Task 1.
4. Sales: an accepted offer moves the listing to Under offer, so it leaves "To confirm". A fall-through puts it back to For sale, freshly confirmed. Test in Task 1.
5. The list with a parish filter binds the time before the parish, so a due listing still shows `to_confirm: 1`. Test in Task 1.

---

### Task 1: The rule, the column and the panel API

**Files:**
- Create: `migrations/0017_to_confirm.sql`
- Modify: `server/listing.js` (new export `TO_CONFIRM`), `server/routes/listings.js` (`loadListing`, `LIST_SQL`, `list`, `update`, `setState`, new `confirm` route), `server/routes/sales.js:69-77` (`availabilityTo`), `server/routes/notifications.js:24-37` (`openCounts`), `scripts/import_hampton.py:99` (`map_listing`)
- Test: `tests/server/to-confirm.test.mjs` (new), `tests/server/notifications.test.mjs` (the five `counts` objects gain `to_confirm: 0`), `tests/test_import.py` (`test_sale`)

**Interfaces:**
- Produces: `TO_CONFIRM: string` in `server/listing.js`, a boolean SQL expression for a query on `listings l` with exactly one `?`, bound to the ISO time now.
- Produces: every listing the panel API returns from `loadListing` (detail, update, publish and the other state changes, media) and every row of `GET /admin/listings` (not `slim=1`) carries `confirmed_at: string|null` and `to_confirm: 0|1`.
- Produces: `POST /admin/listings/:id/confirm` (admin, same origin) → `200 {confirmed_at}`; `404 "Listing not found"`.
- Produces: `GET /admin/notifications/counts`, and the `counts` of `GET /admin/notifications`, gain `to_confirm: number`; `action` is unchanged.

- [ ] **Step 1: Write the failing tests** in `tests/server/to-confirm.test.mjs`. Seed with `seedListing(env, {id, operation, availability, published, archived_at, confirmed_at, ...})`; set now with `t.mock.timers.enable({apis: ["Date"], now})`; read `to_confirm` via `GET /admin/listings` and `GET /admin/listings/:id` with `adminCookie()`.
  - `test("ADM-04: on the market and unconfirmed for 3 months, or 1 for a rental, is To confirm")`. With now `2026-10-30T12:00:00.000Z`:
    - sale confirmed `2026-07-30T12:00:00.000Z` → 1; sale `2026-07-31T12:00:00.000Z` → 0;
    - business confirmed `2026-07-01…` → 1;
    - rent to_let confirmed `2026-09-30T12:00:00.000Z` → 1; rent `2026-10-01…` → 0;
    - counts `to_confirm` equals the number of 1s, and `action` is 0.
  - `test("only listings on the website and still on the market")`. All confirmed `2026-01-01…`:
    - lease → 1; not_stated → 1; published with no media → 1;
    - draft (`published: 0`) → 0; archived → 0; under_offer → 0; sold → 0; withdrawn → 0; `confirmed_at: null` → 0.
  - `test("month ends: the due moment is fixed and never flips back")`:
    - sale confirmed `2027-03-02T12:00:00.000Z`: 0 at `2027-05-31T12:00Z` and at `2027-06-01T12:00Z`; 1 at `2027-06-02T12:00Z` and at `2027-06-03T12:00Z`;
    - sale confirmed `2026-11-30T12:00:00.000Z`: 0 at `2027-02-28T12:00Z`, 1 at `2027-03-02T12:00Z`.
  - `test("Still available confirms at once and leaves updated_at alone")`:
    - POST confirm on a due listing → 200 `{confirmed_at: now}`;
    - the row's `updated_at` is unchanged, `to_confirm` is 0 and counts `to_confirm` drops;
    - unknown `HE-R999` → 404; no cookie → 401.
  - `test("publishing, a new availability or a new price confirms; other edits do not")`:
    - a full editor body (every field as stored, `sale_price: 779000` against REAL 779000) with only `title` changed → `confirmed_at` unchanged;
    - the same body with `sale_price: 750000` → `confirmed_at` = save time;
    - with `availability: "not_stated"` → save time;
    - unpublish, then `POST …/publish` → publish time;
    - `PUT /admin/listings/:id/featured` and `PUT /admin/listings/order` → unchanged.
  - `test("Sales: accepting an offer and a fall-through confirm")`. Build the offer with the existing helpers of `tests/server/offers.test.mjs`. Accept → availability `under_offer`, `confirmed_at` = accept time, `to_confirm` 0. Fall through → `for_sale` with `confirmed_at` = that time.
  - `test("a parish filter keeps the time bound first")`: due listing with `parish: "St Saviour"`; `GET /admin/listings?parish=St%20Saviour` → its row has `to_confirm: 1`.
  - `test("the counts poll reads only the listings on the website")`: `captured(env, /COUNT\(\*\) AS n FROM listings l/)` during `GET /admin/notifications/counts`; `plan()` matches `/USING INDEX listings_live/` and does not match `/SCAN listings\b(?! USING)/`.
  - `tests/test_import.py` `test_sale`: `self.assertEqual(l["confirmed_at"], l["updated_at"])`.
- [ ] **Step 2: Run** `node --test tests/server/to-confirm.test.mjs` and `python3 -m unittest tests/test_import.py`. Expected: they fail (no column `confirmed_at`, no `to_confirm`).
- [ ] **Step 3: Implement.**
  - `0017_to_confirm.sql` holds three statements:
    - `ALTER TABLE listings ADD COLUMN confirmed_at TEXT;`
    - `UPDATE listings SET confirmed_at = updated_at;`
    - `CREATE INDEX listings_live ON listings(confirmed_at) WHERE published = 1 AND archived_at IS NULL;`
    - plus a comment saying what confirms a listing and that the poll's count reads the index.
  - `TO_CONFIRM` is the Global Constraints rule, with `strftime('%Y-%m-%dT%H:%M:%fZ', l.confirmed_at, CASE l.operation WHEN 'rent' THEN '+1 month' ELSE '+3 months' END) <= ?`.
  - `loadListing`: `SELECT l.*, (${TO_CONFIRM}) AS to_confirm FROM listings l WHERE l.id = ?`, bound `now(), id`.
  - `LIST_SQL`: adds `l.confirmed_at, (${TO_CONFIRM}) AS to_confirm`. `list` binds `now()` before the parish.
  - `update`: when any of `availability`, `sale_price`, `rent` or `premium` is in `r.value` and differs from the stored value, set `patch.confirmed_at = ts` before taking `cols`.
  - `setState` publish patch: `{ published: 1, confirmed_at: ts }`.
  - `confirm`: `UPDATE listings SET confirmed_at = ? WHERE id = ?`; 404 when nothing changed. Route `["POST", new RegExp(`^/admin/listings/${ID}/confirm$`), confirm, true]`.
  - `availabilityTo`: `SET availability = ?, confirmed_at = ?, updated_at = ?, …`, bound with `ctx.ts` for both times.
  - `openCounts`: a last batch statement `SELECT COUNT(*) AS n FROM listings l WHERE ${TO_CONFIRM}` bound `now()`, returned as `to_confirm`.
  - `map_listing` in `import_hampton.py`: `"confirmed_at": stamp`.
  - Each change gets a one-line `ADM-04` comment in the file's style.
- [ ] **Step 4: Run** `npm test`. Expected: all pass, including the updated `notifications.test.mjs` counts.

### Task 2: The panel

**Files:**
- Modify: `admin/src/App.jsx` (Listings nav count; `onChange={loadCounts}` to `Listings` and `ListingEditor`), `admin/src/Listings.jsx` (tab, badge, row action, empty state), `admin/src/ListingEditor.jsx` (badge, note and button, confirmed line), `tests/fixtures/seed.sql` (end: `HE-R018` and `HE-C001` confirmed 4 months ago, relative to now), `tests/e2e.cjs` (after the `admin-list` shot)
- Test: `tests/e2e.cjs`

**Interfaces:**
- Consumes: `to_confirm`, `confirmed_at`, `counts.to_confirm` and `POST /admin/listings/:id/confirm` from Task 1.

- [ ] **Step 1: Write the failing e2e steps**, right after `await shot(page, "admin-list")`:
  - the bar's Listings link `.count` reads `2 to confirm`;
  - the Status group has a `To confirm` button with count 2, after Published; it lists exactly HE-R018 and HE-C001, each row with a `To confirm` badge;
  - the `…` menu of HE-C001 has `Still available`; it shows `Café and Accommodation: confirmed as still available.` and the tab's count becomes 1;
  - in HE-R018's editor, the sidebar shows the badge and the note says `Last confirmed …` (after the final review); typing in `#f-title`, then `Still available` keeps the typed title, shows `Pathfield Road: confirmed as still available.` and `Availability confirmed …`, removes the note and the bar's count; then Discard;
  - an empty To confirm tab shows the empty text;
  - shots `admin-to-confirm` (tab) and `editor-to-confirm` (note).
- [ ] **Step 2: Implement.**
  - **Tab:** `to_confirm` goes after `published`; its filter and count use `l.to_confirm`.
  - **Badge:** `<span className="badge attention">To confirm</span>`, after the availability text and in the editor next to the state badge.
  - **Row menu:** `Still available` only when `l.to_confirm`, through the existing `act(e, l, "confirm", "confirmed as still available.")`. `act` calls `onChange` after a success.
  - **Editor:** `stillAvailable` posts confirm and merges `{confirmed_at, to_confirm: 0}` into `data.listing` in place, without `setListing`, so the form is kept. Then it shows the message and calls `onChange`.
  - **Note and line:** the note, then the button, under "Edited" in the sidebar. The confirmed line shows for a published listing on the market that is not due.
  - **Date:** `fmtDayMonth(jerseyToday(new Date(confirmed_at)))`.
- [ ] **Step 3: Run** `npm test`, `npm run build`, then reseed and run the e2e as in the header of `tests/e2e.cjs`. Expected: all pass.
- [ ] **Step 4: Look** locally with chrome-devtools MCP (Playwright MCP can't launch Chrome as root) at 1280 and 390:
  - Listings › To confirm;
  - the row menu;
  - the editor note and button;
  - after confirming.

  Nothing overlaps, wraps badly or scrolls sideways. Save the shots to the scratchpad.

### Task 3: Records, review and the single commit

**Files:**
- Modify:
  - `docs/roadmap/ESTADO.md`: the header (migrations up to 0017), the F4 row, a section on Hermes, and «Siguiente tarea»;
  - `docs/roadmap/checklist-hampton-app.html`: ADM-04 to `hecho`, plus EST-17, PUB-09 and NOT-01; the Hermes items AUT-01, 02, 05, 06, 08, 10, 11, 12, the new AUT-13, AUT-14, PRE-31, PRE-32, and the AI items PUB-13, REG-13, AGE-06, VIS-15, BUS-09, BUS-11, PRE-13, PRE-19, PRE-28; and `actualizado`.
- Already modified: `docs/roadmap/2026-10-23-arquitectura-hampton-app.md` (§6.6, P-18, questions 15–16).
- Create: `docs/superpowers/plans/2026-10-30-hampton-app-to-confirm-ledger.md`

- [ ] **Step 1:** Update ESTADO.md and the checklist JSON. Keep `json.dumps(…, ensure_ascii=False, indent=1)`, and check that the `datos` block parses. The evidence holds no tailnet address, port or private path (public repo).
- [ ] **Step 2:** Run an independent review workflow over the diff with these lenses:
  - correctness;
  - security and privacy;
  - design and copy against DESIGN.md;
  - too much code;
  - the docs' accuracy and public-repo hygiene.

  Each lens's findings go to a skeptic. Fix what survives, then run `npm test`, `npm run build` and the e2e again.
- [ ] **Step 3:** Write the ledger. Give Luis the steps to apply 0017 remotely and wait for his output.
- [ ] **Step 4: Commit** everything in one commit, `Ask the team to confirm listings left unchanged`. Then push.
