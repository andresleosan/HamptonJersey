# Owner Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A printable per-listing report for the owner: website interest, viewings with feedback, matching demand, offers and sale progress for the last 7/30/90 days, with no applicant identities.

**Architecture:** One admin endpoint reads everything in one `batch` from existing tables; one panel page renders it and prints from the browser like `Statement.jsx`.

**Tech Stack:** Cloudflare Pages Functions, D1, React 19 panel (admin/src), node:test with the node:sqlite D1 double, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-25-hampton-app-owner-report-design.md` (O1–O12).

## Global Constraints

- All panel and API text in English (D19).
- The report JSON never contains an applicant's, viewer's or buyer's name, email, phone, contact id or applicant id (O6, O7, O8). Tests assert it by searching the serialized response for the seeded name, email and phone.
- Periods: `days` in `7`, `30`, `90` only (400 "Choose 7, 30 or 90 days" otherwise); `to = jerseyToday()`, `from = plusDays(to, 1 - days)` exactly as `server/routes/insights.js` does (reuse its helpers, don't copy them).
- No migration. Reads only, one `env.DB.batch`.
- Print: reuse the Statement page's print approach in `admin/src/styles.css` (`@media print` hides the bar, buttons and selectors).

## Review Focus

1. A listing with no stats, no viewings, no matches and no offers: the page shows the neutral empty sentences, never a bare 0 block or a crash.
2. A rental listing: no offers or sale blocks in the JSON or on the page.
3. Feedback notes off: nothing of `outcome_note` is printed (check the printed DOM, not just a hidden style).
4. Viewings on the period's edges (`date = from`, `date = to`, upcoming after `to`) land in the right counts.
5. An archived or `lost` applicant's match does not count as demand.

---

### Task 1: The report endpoint

**Files:**
- Create: `server/routes/report.js` (or add to `server/routes/listings.js` if that reads better; register in `server/api.js` route table like the others), `tests/server/owner-report.test.mjs`

**Interfaces:**
- Produces: `GET /admin/listings/:id/report?days=7|30|90` → `{ listing: { id, title, operation, availability, price_text, sale_price, rent, rent_period, currency }, period: { days, from, to }, web: { views, photos, tour, by_day: [{ day, views, photos, tour }], since: { first_day, views, photos, tour } }, viewings: { completed, upcoming, cancelled, no_show, feedback: [{ date, outcome, note }] }, demand: { matched, shortlisted }, offers: [{ n, created_at, amount, status, counter_amount }] | null, sale: { agreed_price, status, milestones: [{ key, label, done_on }], next: { key, label } | null } | null }`. `by_day` lists every day of the period (zeros included) so the panel only groups it. 404 "Listing not found".

- [ ] **Step 1: Write failing tests**: sums per metric in and out of the period; `since` from the first stats day; viewings counted on the edges (Review Focus 4); feedback ordered by date with outcome and note; demand excludes rejected, archived, `lost`, `completed` (Review Focus 5); offers numbered by arrival and only open-or-in-period ones; sale milestones from an in-progress sale; rent listing → `offers: null, sale: null`; 400 for `days=14`; 401 without admin; 404; the serialized JSON contains none of the seeded names, emails or phones.
- [ ] **Step 2: Run** `node --test tests/server/owner-report.test.mjs` → fails.
- [ ] **Step 3: Implement.** Milestone keys and labels come from `server/sales.js` (reuse its list).
- [ ] **Step 4: Run** `npm test` → all pass.
- [ ] **Step 5: Commit** `Add the owner report endpoint`.

### Task 2: The report page

**Files:**
- Create: `admin/src/OwnerReport.jsx`
- Modify: `admin/src/App.jsx` (route `#/listings/<id>/report?days=`), `admin/src/ListingEditor.jsx` (button **Owner report**, shown for a saved listing), `admin/src/styles.css` (report layout and print rules), `tests/e2e.cjs`

- [ ] **Step 1: Build the page** per O1–O9, O11, O12: period selector (7 / 30 / 90 days), **Prepared for** and **Notes from Hampton** fields (not saved), **Include feedback notes** switch with the warning, Print button; bars by day (7) or by week (30, 90) with an equivalent visually hidden table; empty sentences per block (Review Focus 1).
- [ ] **Step 2: e2e** in `tests/e2e.cjs`: open a seeded listing's editor, press Owner report, switch to 7 days, check the header, a web count and a feedback note; turn notes off and check the note is gone from the DOM; emulate print media and check the bar and buttons are hidden; check a rental listing has no Offers block (Review Focus 2, 3).
- [ ] **Step 3: Run** `npm test`, `npm run build` and the e2e → green. **Commit** `Add the printable owner report`.
