# Interest Count Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The team can take a person out of a listing's interest count with a reason, join two bookings of the same person into one, and undo both, from a "who counts" card in Viewings.

**Architecture:** Migration 0016 adds four columns to `viewing_requests`. The C10 rule in `server/viewings.js` gains one `personSql` expression (a joined row counts as the person it was joined to) and skips removed rows. The count (panel and website), the card's lists and the four corrections all use that expression. A new `server/routes/interest.js` serves the card (`GET`, moved from `listings.js`) and the corrections (`PUT`), and `admin/src/Interest.jsx` renders the card inside the filtered Viewings screen.

**Tech Stack:** Cloudflare Pages Functions, D1 (SQLite), React 19 panel (`admin/src`), node:test with the node:sqlite D1 double, Playwright e2e (`tests/e2e.cjs`).

**Spec:** `docs/superpowers/specs/2026-10-29-hampton-app-interest-removal-design.md` (R1–R15, copy in §3).

## Global Constraints

- One rule (R4, R7, R14): the count, the two lists and every correction use `personSql`. A removed row never counts; a joined row counts as the person it was joined to.
- Corrections never change a viewing's `status`, `date`, `time`, `notes`, `email`, `phone`, `updated_at` or `updated_by` (R5). They don't touch `contacts.last_activity_at` either (R11, no `touchByViewing`).
- A removal lasts until Count again, whatever happens to the viewing afterwards. A viewing created after the removal counts (R3, R9).
- Events `viewing.uncounted` `{reason}`, `viewing.recounted`, `viewing.joined` `{same_as: <viewing id>}` and `viewing.separated` go on the viewing acted on, with the admin as actor. Never a note, email or phone in event data. Written only if a row changed, in the same batch (R10).
- Copy exactly as spec §3 (D19 English, sentence case, `·` separators, no `—` in new sentences, no emoji). Dates as in the rest of the panel (`fmtDay`, `fmtDate`); the panel never shows who made a change (R10).
- DESIGN.md: only existing classes (`.card`, `.btn.ghost.sm`, `.view-form`, `.choices-set`, `.choices`, `.check`, `.muted`, `.empty`, `.inline`, `.kv`). No new colour, font, weight, shadow or `style=` attribute; spacing from 4/8/12/16 (panel density); panel body 14px; state said in text (Text-Not-Color); targets of at least 24px, as the existing `.btn.sm`.
- Accessibility: native radio, select, textarea and buttons, each with its label; errors with `aria-invalid` + `aria-describedby`; messages `role="status"` / `role="alert"`; focus moves into an opened form and back to its button on Close, and to the card heading after a change; at 390px no sideways scroll.
- Security: admin-only routes (4th route element `true`) behind `server/api.js`'s same-origin check; the server validates the id, the action, the reason (closed list), the note (string, trimmed, ≤ 200) and the other viewing (same listing); 0016's CHECKs back them; `GET /api/listings` carries the number only; no `dangerouslySetInnerHTML`.
- Performance: the count still reads through `viewing_listing (listing_id=? AND date>?)`, never a scan; the card makes one request when it opens and one after each change.
- `/avanzar`: no task commits on its own; one commit at the end with code, tests, ESTADO.md, checklist, spec, plan and ledger. Deploy: Luis applies 0016 remotely **before** the push.

## Review Focus

1. Two people on one phone (a couple: different emails, same mobile). Removing or joining one must leave the other counted. Task 2 test `remove: only the person the count makes of that viewing`.
2. The kept side of a join is cancelled, expires or is deleted. The person must still count once while any joined booking counts. Task 2 test `join: one person while either side counts`.
3. Two of the team press the same correction at once. The second gets 409, and there is still one event and the first reason. Task 2 test `a second identical correction changes nothing`.
4. A removed viewing is later confirmed, moved or completed with Proceed. It stays out until Count again. Task 2 test `a removal outlasts later actions on the viewing`.
5. The website never learns who was removed or joined, or why. `GET /api/listings` holds no reason, note or joined key. Task 2 test `the public answer carries only the number`.

---

### Task 1: The rule — 0016, one person expression, removed rows don't count, the rule's edges

**Files:**
- Create: `migrations/0016_interest_corrections.sql`
- Modify: `server/viewings.js:36-51` (`tel`, `interestSql`, `interestDates`; new exports beside them)
- Test: `tests/server/schema.test.mjs`, create `tests/server/interest.test.mjs`

**Interfaces:**
- Produces: `INTEREST_REASONS = ["no_longer_interested", "not_buyer", "other"]`.
- Produces: `ownSql(t: string): string`, the row's own identity, the current expression: `COALESCE(lower(t.email), <email of another viewing of t's listing with the same phone>, <t.phone's last 10 digits>)`. `t` is the table name or alias in scope.
- Produces: `personSql(t: string): string`. When `t.interest_same_as` is null it is `ownSql(t)`; otherwise it is that key read the same way: the email of a viewing of the listing whose phone's last 10 digits equal the key, else the key itself.
- Produces: `interestSql(id)`, same signature and binds as today (`id`'s own, then `interestDates()`). Now `COUNT(DISTINCT personSql)` over rows with `interest_removed_at IS NULL`.
- Produces: `interestRowsSql: string`. It selects `id, name, email, phone, date, time, status, outcome, interest_removed_at, interest_reason, interest_note, interest_same_as`, `personSql(...) AS person` and `ownSql(...) AS own` for `listing_id = ?` rows meeting the rule (removed ones included), ordered `date DESC, time DESC, id DESC`. Binds: the id, then `interestDates()`.

- [ ] **Step 1: Write the failing tests**
  - `schema.test.mjs`, `test("0016: interest corrections refuse what the app never writes")`. Each insert throws `/CHECK/`: a reason outside the list; a reason without `interest_removed_at`, or the other way round; a note without a reason; `other` without a note; a 201-character note; an empty `interest_same_as`; a 255-character `interest_same_as`.
  - `interest.test.mjs`, with a mocked clock and a local `seedViewing` (as in `viewings-admin.test.mjs:20-27`). Interest is read through `GET /admin/listings/HE-R001` (`active_interest`).
    - `test("the rule's edges: today all day, no-show never, 30 days in, 31 out")`. At 2026-10-28 12:05 Jersey: requested at 10:00 today and confirmed at 09:00 today count; a no-show today and one yesterday don't; proceed on day −30 counts and on −31 doesn't.
    - `test("the day is Jersey's, also in summer")`. A requested viewing on 2026-07-01 counts at `2026-07-01T22:30:00Z` (23:30 BST) and not at `2026-07-01T23:30:00Z` (00:30 on the 2nd). At `2026-07-31T23:30:00Z`, proceed on 2026-07-02 counts and on 2026-07-01 doesn't.
    - `test("removed rows don't count; a joined row counts as its person")`. Ann (email) and Bo (phone only) give 2. Bo with `interest_same_as: "ann@x.je"` gives 1, and still 1 once Ann's viewing is `cancelled`. Ann with `interest_removed_at` set gives 1 (Bo). A row joined to `"7797123456"` counts as `kim@x.je` when another viewing of the listing has `kim@x.je` with phone `07797 123456`.
- [ ] **Step 2: Run** `node --test tests/server/schema.test.mjs tests/server/interest.test.mjs`. Expected: the 0016 test fails with `no such column`, the removed/joined test fails (2 ≠ 1), and the edge tests pass (they pin today's behaviour).
- [ ] **Step 3: Implement.** The migration adds `interest_removed_at TEXT`, then `interest_reason` (list CHECK, plus "set together with `interest_removed_at`"), then `interest_note` (≤ 200, only with a reason, required for `other`), then `interest_same_as` (1 to 254). Each column's CHECK may name the columns added before it. Then rewrite `interestSql` on `personSql`/`ownSql` and add `interestRowsSql` and `INTEREST_REASONS`, with the comments saying why (R4, R14).
- [ ] **Step 4: Run** `npm test`. Expected: all pass, including the existing interest tests and the index assertions (`viewings-admin.test.mjs:339-357`, `public.test.mjs:83-90`), now on the new expression.

### Task 2: The routes — who counts, and the four corrections

**Files:**
- Create: `server/routes/interest.js`
- Modify: `server/routes/listings.js:67-73,223` (the `interest` handler and its route move out; `interestStatement` stays for `detail`), `server/api.js:3-21` (register the new routes), `server/events.js:9-10` (`ifChanged`)
- Test: `tests/server/interest.test.mjs`, `tests/server/viewings-admin.test.mjs:374-386` (the moved route's test), `tests/server/public.test.mjs`

**Interfaces:**
- Consumes: Task 1's `personSql`, `interestRowsSql`, `interestDates`, `INTEREST_REASONS`.
- Produces: `logEvent(env, event, notice, { ifInserted, ifChanged, newest })`. With `ifChanged`, the event is written only when the statement just before changed at least one row (`changes() > 0`).
- Produces: `GET /admin/listings/:id/interest` → `{ title, active_interest, people, removed }`. `people`: one entry per person with an unremoved row: `{ viewing_id, name, email, phone, date, time, status, outcome, also: [{ email, phone }], joined }`, from that person's latest unremoved row. `also` holds the contacts of the person's other own identities; `joined` is true when any of its rows has `interest_same_as`. `removed`: one entry per person whose rows are all removed: `{ viewing_id, name, email, phone, date, time, status, outcome, removed_at, reason, note }`, from the latest one. Both lists keep the rows' order; `active_interest === people.length`. 404 `Listing not found`.
- Produces: `PUT /admin/viewings/:id/interest`, body `{ action }`:
  - `remove` + `reason`, `note`: sets `interest_removed_at`/`_reason`/`_note` on every unremoved row of the listing whose `personSql` equals the acted viewing's.
  - `restore`: clears the three columns on that person's removed rows.
  - `join` + `same_as` (another viewing's id): sets `interest_same_as` = `personSql` of the `same_as` viewing on every row of the acted viewing's person.
  - `separate`: clears `interest_same_as` on that person's joined rows.

  Read the acted viewing's `listing_id` and person (and the other viewing's, for `join`) first, then run `UPDATE … WHERE listing_id = ? AND <personSql> = ?` with those as binds, plus the event with `ifChanged`, in one batch. Answers: 200 `{ ok: true }`. 400 `Unknown action`. 400 with `fields` (`reason: "Choose a reason"`, `note: "Use 200 characters or fewer"` / `"Add a note for Other"`, `same_as: "Choose who they are"`). 400 `This viewing isn't for a listing.` 400 `They already count as one person.` 404 `Viewing not found`. 409 `Someone else changed this person's count. The list now shows the latest.` when no row changed.

- [ ] **Step 1: Write the failing tests** in `interest.test.mjs` (interest read through the route and `GET /admin/listings/HE-R001`):
  - `test("the card's lists: each person once, with the viewing that counts, joined contacts and the removed")`. The lists and `active_interest` match the listing detail's count. A `joined` person lists the other contact in `also`. A person removed and then booked again is in `people`, not `removed`. A removed person whose only viewing is now 31 days old is in neither list (R8).
  - `test("remove: only the person the count makes of that viewing")`. Ann has `ann@x.je` with phone `07797 1`, plus a phone-only viewing on `07797 1`. Ben has `ben@x.je` on the same phone. Removing Ann's phone-only viewing flags both of Ann's rows (reason and note stored) and leaves Ben counted. It writes one `viewing.uncounted` event on that viewing, with actor `luismadef45@gmail.com` and data `{"reason":"not_buyer"}` (no note). Then Count again restores both.
  - `test("join: one person while either side counts")`. Web Jane (email only) and phone Jane (phone only) give 2. Joining the phone one to the web one gives 1, and phone Jane's `interest_same_as` is `jane@x.je`. Cancelling the web viewing keeps 1, and so does deleting it (`DELETE /admin/viewings/:id`). A later phone-only booking on Jane's phone gives 2 (R15: it counts on its own).
  - `test("a join follows its person into a later join, and separate undoes it")`. Web Jane, with phone Jane joined to her, plus Kay give 2. Joining web Jane to Kay gives 1, and phone Jane's `interest_same_as` is now `kay@x.je` (R14). `separate` on Kay's viewing gives 3.
  - `test("a second identical correction changes nothing")`. Two removes of the same person: 200 then 409, one `viewing.uncounted` event, the first reason kept. The same for `restore`, `join` and `separate`.
  - `test("a removal outlasts later actions on the viewing")`. Remove a requested viewing, then confirm it, reschedule it and complete it with `proceed` (the existing actions): still not counted, flag kept. A new booking of that email counts.
  - `test("corrections leave the viewing and the contact as they were")`. `status`, `date`, `time`, `notes`, `email`, `phone`, `updated_at`, `updated_by` and `contacts.last_activity_at` are unchanged.
  - `test("corrections are checked")`. Unknown action; reason outside the list; `other` without a note; a 201-character note; `same_as` from another listing, missing, or the same person; a viewing without a listing; 404; 401 without a cookie; 403 cross-origin.
  - `test("the card's rows and the corrections read through the listing index")`, with `captured`/`plan`. `interestRowsSql` matches `SEARCH viewing_requests USING INDEX viewing_listing (listing_id=?` and not `SCAN viewing_requests`.
  - `public.test.mjs`, `test("the public answer carries only the number")`. 3 people give `interest` 3. Remove one with note `Owner's brother` → 2; join another → `null`. `JSON.stringify` of the answer holds no `Owner`, `not_buyer` or joined key.
  - `viewings-admin.test.mjs:374-386`: the route's answer now also holds `people` and `removed`. Keep the title, the count, the 404 and the 401 assertions.
- [ ] **Step 2: Run** `node --test tests/server/interest.test.mjs tests/server/public.test.mjs tests/server/viewings-admin.test.mjs`. Expected: the new tests fail (`404 Not found` for the `PUT`, no `people`).
- [ ] **Step 3: Implement** `server/routes/interest.js`, `ifChanged`, the move out of `listings.js`, and the registration in `api.js`. Group the rows in JS by `person`, latest first. Comments only where the why isn't obvious: R5 for why `updated_at` stays, R14 for the key.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.

### Task 3: The card in Viewings, the viewing's line, fresh numbers

**Files:**
- Create: `admin/src/Interest.jsx`
- Modify: `admin/src/Viewings.jsx:25-157` (interest state and load in filtered mode, the card, `Detail` props), `admin/src/Viewings.jsx:160-240` (`Detail`: count from the parent when filtered, the removed line with Count again), `admin/src/format.js` (`INTEREST_REASON`), `admin/src/styles.css` (the card's list)
- Test: `tests/e2e.cjs` (new `interestCount(page, phone, noSideScroll)` called from `admin()` beside `ownerReport`)

**Interfaces:**
- Consumes: Task 2's `GET` and `PUT` shapes; `INTEREST_REASONS`.
- Produces: `INTEREST_REASON = { no_longer_interested: "No longer interested", not_buyer: "Not a buyer or tenant", other: "Other" }` in `format.js`.
- Produces: `export default function Interest({ data, error, reload, onDirty })`. `data` is the `GET` answer or null while loading. `reload()` resolves once both the card and the viewings list are read again. `onDirty("interest", bool)` follows the open form's unsaved choice.

- [ ] **Step 1: Write the failing e2e** `interestCount`, with the seed's HE-R001: Tom Renouf requested (confirmed earlier in the run) and Mark Querée viewed with Proceed. It runs on `#/viewings?listing=HE-R001`:
  - The heading reads `Interested now: 2 people` and lists both. Mark's line reads `Viewed <d Mon> · Proceed`.
  - Remove Mark with `Other` and no note: `Add a note for Other`, and the note field has `aria-invalid`. Then `Not a buyer or tenant` with note `Neighbour`: the message `Mark Querée no longer counts. The website shows the new number within a minute.`, the heading `Interested now: 1 person`, and `Not counted` shows `Not a buyer or tenant · Neighbour · …`. `GET /api/listings` gives HE-R001 `interest: null`.
  - In Past, Mark's viewing shows `Not counted in this listing's interest: Not a buyer or tenant · Neighbour · …`. Its Count again brings the card back to 2.
  - Remove Mark with `Counted twice`, `Same person as` Tom Renouf: `Mark Querée now counts as the same person as Tom Renouf.`, `1 person`, and Tom shows `Also booked as mark.queree@example.je`. Count separately gives 2.
  - The phone shot: `noSideScroll(BASE + "admin/#/viewings?listing=HE-R001", "#h-interest")`, then `shot(phone, "admin-interest-mobile")`. Desktop `shot(page, "admin-interest")`.
- [ ] **Step 2: Run** `npm run build`, reseed and run the e2e as in the header of `tests/e2e.cjs`. Expected: it fails waiting for `Interested now`.
- [ ] **Step 3: Implement.**
  - **`Viewings`.** When `listing` is set, it reads the interest with every list load (and drops a read a newer one superseded). That answer replaces the title-only fetch (`Viewings.jsx:49-51`) and passes `count` to `Detail`. It renders `<Interest>` under the filter line, and its `onDirty` key `interest` joins `setUnsaved`.
  - **`Detail`.** It takes `count` when given, else fetches as today, now also when `v.interest_removed_at` changes. A removed viewing shows the line with a `Count again` button (`PUT … {action: "restore"}` through `send`, message `<name> counts again.`).
  - **`Interest`.** One card, `<h2 id="h-interest" tabIndex={-1}>`, the note, then the people list, each with its name, contact, viewing line, `Also booked as …` and buttons. The remove form uses `.view-form` with a `.choices-set` of radios. `Counted twice` is offered only when someone else counts, and swaps the note for `Same person as` (a `<select>` of the others as `name · contact`). The note label reads `Note` with `Other`, else `Note (optional)`. Then `Not counted` (an `h3`) with Count again, and the empty text. Copy exactly as spec §3.
  - **CSS.** A few `.interest` rules for the list (grid, gap 12px) and its rows (wrap at 390px).
- [ ] **Step 4: Run** `npm test`, `npm run build`, reseed, then the e2e. Expected: `e2e OK`.
- [ ] **Step 5: Look** at it with chrome-devtools MCP (Playwright MCP can't launch Chrome as root), locally at 1280 and 390, with keyboard only once: open, Close and Save the form; check the focus and the messages. Screenshots go to the scratchpad.

### Task 4: Review, records and the single commit

**Files:**
- Modify: `docs/roadmap/ESTADO.md` (date; F3 row: VIS-02 done, out of "Pendiente"; migrations up to 0016 once applied), `docs/roadmap/checklist-hampton-app.html` (`VIS-02` → `hecho`, `responsable` `—`, `hecho`, `falta` empty, `evidencia`; `VIS-01`'s `hecho` mentions the corrections; top-level `actualizado`)
- Create: `docs/superpowers/plans/2026-10-29-hampton-app-interest-removal-ledger.md`

- [ ] **Step 1:** An independent review: a workflow with four lenses (correctness, security and privacy, design per DESIGN.md and copy, excess code), each finding checked by a skeptic. Fix what survives, with a test where it is behaviour. Then run `npm test`, `npm run build` and the e2e again.
- [ ] **Step 2:** Update ESTADO.md, the checklist JSON (check it parses: `json.loads` on the `datos` block) and the ledger.
- [ ] **Step 3: Commit** everything in one commit, `Let the team correct who counts as interested`. Give Luis the remote 0016 steps; push only after his output shows it applied.
