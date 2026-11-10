# REG-06 · Explicit area answers Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; preserve the existing isolated main checkout, local REG-07 commit and the approved spec. Steps use checkbox syntax. Publication and production migration require separate approval of the exact reviewed SHA.

**Goal:** Distinguish selected parishes, anywhere and unknown; preserve exclusions and allow an optional preferred parish without losing historical answers.

**Architecture:** Add nullable, validated applicant fields and a persisted tie-break rank to the current D1 model; integrate BUS-14's existing matching, cursors and Review instead of adding another engine. Reuse the current public wizard, staff form and duplicate-review flow. BUS-12/AUT-19 future integrations remain separate and are not claimed complete.

**Tech stack:** JavaScript, React, Cloudflare Workers/D1 SQLite, node:test and existing local e2e fixtures. No new dependencies.

**Spec:** [Approved REG-06 design](../specs/2026-11-10-paq-02-reg-06-proposal.md). Base: `e619fc3` includes GitHub `5779655` and local REG-07 `d4afba0`.

## Global constraints

- Existing records and old API clients retain nullable answers; never backfill empty areas to any/unknown or erase an exclusion. New web and panel forms require one of selected/any/unknown; unknown is a valid answer.
- A selected answer requires at least one permitted parish; a preferred parish must be selected and not excluded. Any/unknown have no selected or preferred parish and preserve exclusions. Server validates regardless of client.
- Unknown and an unknown listing parish with exclusions remain pending, never confirmed; explicit exclusions still veto. Current residential matching remains in scope; commercial matching and BUS-12/AUT-19 integration remain pending.
- Sort by requirements group, score, preferred-parish tie-break, binary listing ID and match ID. Persist the tie-break, preserve rejected history and invalidate cursors on relevant search/property changes. Old v1 cursors continue only when their revision remains valid.
- Staff APIs retain authentication, same-origin checks, optimistic concurrency and duplicate review; never send private data to logs or URLs. Changes to selected areas or preference ask before removal; cancel preserves the draft and exclusions.
- Current panel: ink `#151515`, mist `#f4f3f0`, stone `#6b665e`, bronze `#a56b3d`, bronze-dk `#86542d`, error `#a32020`, field border `#8f8a82`; Montserrat 14px/1.5, Tenor Sans 26/19px, card padding 24px/radius 14px, button padding 10px 20px/radius 999px. Web: paper `#fff`, body 15px/1.65, input padding 13px 14px/radius 12px, button 13px 28px/radius 999px. Reuse native labels/radios, visible 2px focus and existing components; check 1280/390 and zoom 200%, with normal text ≥4.5:1 and controls ≥3:1. No visual restyle, new fonts or libraries.
- Security guidance preserves server-side allowlists and React escaping; impeccable/antislop keep controls task-focused; web performance avoids per-row database queries; ponytail reuses current helpers. The earlier Chromium limitation is historical; use the disposable network-isolated browser fixture described in the ledger and do not weaken host controls.

## Review focus

1. Old NULL with nonempty wanted parishes keeps existing behavior; old empty data does not become an explicit answer.
2. Changing selected to any/unknown or copying a duplicate does not silently remove selected areas, preference or exclusions.
3. A preferred area breaks only exact ties; cursor pages and Review cannot skip/duplicate matches or reuse a stale revision.
4. Partial edits, concurrent changes and rejected snapshots never overwrite other fields or human decisions.
5. Unknown property parish with exclusions never becomes a confirmed success; malformed data never removes an exclusion by inference.

## Tasks

### 1. Contract and migration

**Files:** `migrations/0039_area_answers.sql`, `server/applicants.js`, `server/routes/applicants.js`, `site/requirements.js`, `tests/server/area-answer.test.mjs`.

**Interfaces:** `area_answer: null|'selected'|'any'|'unknown'`; `preferred_parish: null|string`; `locationAnswer(a)` returns the normalized explicit/legacy state and existing lists. Match-input and cursor revisions advance when either field changes. Migration preserves rows, prior decisions and foreign keys.

- [x] RED: validate selected/any/unknown, overlap, preferred outside selection, legacy NULL, partial updates, household data preservation and concurrent versions; exercise populated migration 0038→0039.
- [x] Implement nullable fields, D1 constraints, shared answer helper, server validation and search fields. GREEN: `node --test tests/server/area-answer.test.mjs`.

### 2. Evaluation and persisted order

**Files:** `server/matching.js`, `server/requirements.js`, `server/match-store.js`, `server/routes/matches.js`, `server/match-pages.js`, `tests/server/area-matching.test.mjs`, `tests/server/match-pages.test.mjs`.

**Interfaces:** `areaPreferenceRank(a,l)` is 0 only for a selected preferred parish equal to the listing, otherwise 1; `matches.area_preference_rank` stores it. Pages encode the new rank in v2 and accept valid v1 cursors as rank 1. Relevant changes invalidate old revisions; rejected snapshots are untouched.

- [x] RED: any/unknown/legacy, exclusions with unknown parish, unchanged pets, exact ties, 25/25/10 pages, Review order, old/stale cursors and listing/search races.
- [x] Implement shared evaluation and ranking in all readers/writers; GREEN on focal tests and BUS-14 regression suites.

### 3. Public and staff flows

**Files:** `site/apply.js`, `admin/src/ApplicantFields.jsx`, `admin/src/NewApplicant.jsx`, `admin/src/ApplicantDetail.jsx`, `admin/src/format.js`, `tests/apply.test.js`, `tests/reg06-area-dom.test.js`, existing public/API tests.

**Interfaces:** Public and new staff forms require `area_answer`; old API callers and editing existing searches do not. Duplicate area fields copy as one explicitly confirmed group; exclusions remain intact. Radio and preferred controls keep keyboard labels, errors and previous answers on cancel/back/reload.

- [x] RED: forms require selection, unknown permits continuation, selected preference round-trips, Back/legacy restore and cancel preserve data; duplicate copying any/unknown clears only with confirmation.
- [x] Implement native controls and grouped copy using existing form/confirmation patterns. GREEN on focal UI/API tests.

### 4. Verification and handoff

- [x] `npm test` passed 1,146 JavaScript and 14 Python tests; `npm run build`, `npm run check:release`, `npm run team:check`, `npm run check:packages`, populated local migration integrity and the general browser suite (public, urls, admin, reg17) passed.
- [x] Real WebKit in a disposable isolated container verified the focused journeys at 1280/390 and native zoom above 200%, including keyboard use and REG-07 Pets Unknown. A separate anonymous read-only browser smoke passed against the existing public production site; the new choices are not yet there. No host security or production configuration was changed.
- [x] Independent review and repeat review completed; important findings corrected and task sources/checklist/ESTADO and ledger updated.
- [x] Commit the initial implementation and documentation files locally.
- [x] Prepare the final browser evidence and current documentation for the reviewed local commit.
- [ ] Present the final reviewed SHA for separate authorization, then migrate, publish and verify production. Do not claim activation before those steps.
