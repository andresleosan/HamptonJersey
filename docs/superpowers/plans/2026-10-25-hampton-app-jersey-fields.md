# Jersey Listing Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Listings carry tenure, Jersey housing category and restriction as fixed values; matching filters by the applicant's residential status per gov.je; the editor shows what is missing before publishing.

**Architecture:** One migration adds three CHECKed columns and backfills tenure; `server/matching.js` gains one pure `housing` check; the panel editor and the public listing page show the fields.

**Tech Stack:** Cloudflare Pages Functions + D1, React 19 panel, vanilla public site, node:test, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-25-hampton-app-jersey-fields-design.md` (J1–J8 and the rule tables in §3).

## Global Constraints

- Migration `migrations/0015_jersey_fields.sql`: `ALTER TABLE listings ADD COLUMN tenure_type TEXT CHECK (tenure_type IS NULL OR tenure_type IN ('freehold','flying_freehold','share_transfer','leasehold'))`, same pattern for `housing_category` (`'qualified','registered'`) and `restriction` (`'first_time_buyer','over_55'`); backfill `tenure_type` from `lower(trim(tenure))` exactly equal to `freehold`, `flying freehold`, `share transfer`.
- The rule table in spec §3 is the only source of the matching rule; implement it once in `server/matching.js` and test every cell.
- Unknown never excludes (F1-A); the `housing` check adds no points.
- All panel and website text in English (D19). No new dependencies.
- Validation in `server/listing.js` (ENUMS/EDITABLE) like the existing enum fields; the public shape (`toPublic`) gains `tenureType`, `housingCategory`, `restriction`.

## Review Focus

1. Every cell of the §3 tables, including share transfer with and without category, and an applicant with no status.
2. A first-time-buyer listing for an ENT applicant whose `buyer_position` is unknown → unknown, not fails.
3. A listing with legacy tenure text "Freehold / share transfer" keeps the text visible ("Was: …") and on the website.
4. Saving a listing with an invalid enum value → 400 with a clear message; the existing editor save flow and optimistic lock still work.
5. Recalculate after the migration: matches that now fail are removed/hidden exactly as other hard-filter failures are.

---

### Task 1: Data, validation and the matching rule

**Files:**
- Create: `migrations/0015_jersey_fields.sql`, tests in `tests/server/matching.test.mjs` (or a new `tests/server/housing-rule.test.mjs`)
- Modify: `server/listing.js` (ENUMS, EDITABLE, toPublic), `server/matching.js` (`housing` check), `server/match-store.js` if it selects listing columns explicitly, `tests/server/schema.test.mjs` if it pins columns.

**Interfaces:**
- Produces: listing columns `tenure_type`, `housing_category`, `restriction`; `PUT /admin/listings/:id` accepts them; public JSON `tenureType`, `housingCategory`, `restriction`; check `{ key: "housing", result, evidence }` in `evaluate()`.

- [ ] **Step 1: Failing tests**: one test per §3 cell (table-driven); restrictions combine (worst wins); backfill of the three exact legacy strings and NULL for others; enum validation 400s; public shape fields.
- [ ] **Step 2: Run** → fail. **Step 3: Implement.** **Step 4: Run** `npm test` → green.
- [ ] **Step 5: Commit** `Add Jersey housing fields and their matching rule`.

### Task 2: Editor, Before you publish, website

**Files:**
- Modify: `admin/src/ListingEditor.jsx` (three selects replacing the tenure text input, "Was: …" hint, **Before you publish** panel per J6), `admin/src/MatchCard.jsx` if checks need a label for `housing`, `site/index.html` (facts and badges per J3), `server/seo.js` only if the listing description should mention the category (optional), `tests/fixtures/seed.sql`, `tests/e2e.cjs`.

- [ ] **Step 1: Implement** J2, J3, J6 and the match-check label.
- [ ] **Step 2: e2e**: set Housing category and Restriction in the editor, save, see them on the public listing page; Before you publish lists a missing item and it disappears when filled; a seeded STN rent applicant does not get a Qualified rental match after Recalculate all; the "Was: …" hint for a legacy tenure.
- [ ] **Step 3: Run** `npm test`, `npm run build`, e2e → green. **Commit** `Show Jersey housing fields in the editor and on the website`.
