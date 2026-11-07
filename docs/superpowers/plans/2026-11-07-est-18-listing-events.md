# EST-18 Internal Listing Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Record committed property changes with actor, provenance and ordered revisions, without new screens or notices.

**Architecture:** SQLite triggers read OLD/NEW inside the domain transaction and write to the common events table. A short-lived, transaction-scoped context row supplies actor/source/action; only application writes explicitly wrapped with that context are audited. Existing event columns stay compatible; listing revision and safe deltas live in JSON with an indexed unique entity/revision identity. An internal update helper accepts an optional operation identity and stores only its digest and event reference.

**Tech Stack:** Existing JavaScript, Cloudflare D1/SQLite and node:test. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-07-est-18-listing-events-design.md` (approved by Luis: «si, construyelo»).

## Global Constraints

- Solo registro interno por ahora; no client/UI changes, public routes, notifications, credentials or production data.
- Preserve existing IDs, event data, notification references and buyer histories. No retrospective events.
- Atomicity covers the listing mutation and event; later Queue/media/R2 steps retain existing boundaries.
- Structured deltas only; free-text fields contribute their names, never their contents. Unknown is null.
- Keep existing confirmation behavior, including Publish on an already published listing.
- Work in isolated main per avanzar; one final code/docs commit. Do not publish or apply production migration without exact-SHA approval.

## Skills and DESIGN.md

`executing-plans` + TDD: native execution and one independent final review; `ponytail`: SQLite atomicity and existing helpers; `security-best-practices`: bound SQL, authenticated actor, allowlisted metadata, no secret/PII copies; `frontend-security-coder`: preserve existing server validation and CSRF, no client trust; `antislop`: concrete comments and documentation during work, no setup wizard; `web-performance-optimization`: no extra reads in public endpoints, indexed entity revisions, no new bundle code.

Impeccable, taste/design-taste and redesign: not applicable because no interface changes. DESIGN.md §Rendimiento: no new font, weight or library; no added images/animations. §Seguridad frontend: server-side validation remains authoritative, no personal data in localStorage, no HTML interpolation or new URL handling. Colors, typography, spacing, component sizing/responsive and visual accessibility do not apply to this backend-only change; existing values remain intact. General e2e checks existing clients; no new MCP flow.

## Review Focus

1. Migration over populated events with foreign keys and NOT-11 triggers must preserve all references (Task 1).
2. SQL helper bookkeeping must preserve changes()/last_insert_rowid() consumed by Sales and notifications (Task 3).
3. Fixed-clock concurrent edits must not share an editor version or invent before-values (Task 2).
4. A failure after the listing commit must not turn its accurate event into a claim that all Queue/media steps succeeded (Task 3).
5. Replay after a later edit/deletion must neither mutate again nor return erased snapshots (Task 2).

### Task 1: Schema and atomic event recording

**Files:** create `migrations/0029_listing_events.sql`, `server/listing-events.js`, `tests/server/listing-events.test.mjs`; existing `events.js` stays compatible.
**Interfaces:** `listingEventStatements(env, id, {actor,source,action,derivedFields?,related?}, statements) -> D1PreparedStatement[]` supplies/clears context around a caller-owned batch. `listingBatch(...) -> Promise<original statement results>` runs that wrapper without changing caller result positions. Context is WITHOUT ROWID; triggers restore SQLite changes/last-insert state. Sources panel/queue/sales/media/recalculate only; related offer_id/sale_id/import_id only. Action determines type for creation/state/confirmation/deletion; generic saves record changed fields.

- [x] Write tests for real row mutation→event, no context/no change→no event, safe before/after, deletion survival, rollback on failed event, revisions and context cleanup.
- [x] Run `node --test tests/server/listing-events.test.mjs` and observe missing behavior.
- [x] Rebuild events through a staging copy and recreate the original table name directly (no rename rewriting foreign-key/trigger references). Defer FK checks within the migration transaction. Preserve exact existing columns/rows/index. Add context, operation receipt tables and expression index on listing revision.
- [x] Implement context wrapper and triggers for INSERT/UPDATE/DELETE, reading actual OLD/NEW. Changes to updated_at/features_at alone do not emit. Explicit confirm or republish emits a confirmation. Renumbering other featured rows remains outside the one intentional-change context.
- [x] Verify local populated migration and real D1 migration; repeat schema composition with NOT-11 0028 in scratch, without importing that task into this delivery.
- [x] Run focal tests and record results; retain changes for final commit.

### Task 2: Listing routes and internal replay contract

**Files:** modify `server/routes/listings.js`; extend `server/listing-events.js`, `tests/server/listing-events.test.mjs`.
**Interfaces:** `updateListingEvent(env, {id,actor,source,action,patch,expectedAt,operationId?}) -> Promise<{event_id,replayed,changed}>` performs an internal conditional update with safe digest receipt; not exposed as a new HTTP API. Reusing an identity for different content fails 409. Existing no-identity requests keep their current semantics. Public handlers keep response shapes.

- [x] Add route tests for create/save/confirm/state/delete/featured, stale edits at fixed clock, no-op saves, unknown request metadata ignored and no new notices.
- [x] Observe RED, then wrap creation, updates, state, confirmation, featured and deletion. Advance editor timestamps monotonically on content/state edits; preserve non-content version behavior.
- [x] Add RED internal-operation tests: concurrent same key one mutation/event; conflicting payload rejected; later edit/deletion replay returns event ID only; no-op receipt also consumes identity safely.
- [x] Implement helper with digest-only receipts and transaction-level gates; run focal tests plus existing match-hooks/to-confirm/published-at suites.

### Task 3: Sales, Queue, media and recalculate

**Files:** modify `server/routes/sales.js`, `queue.js`, `media.js`, `matches.js`; extend focal tests.
**Interfaces:** consume Task 1 wrappers inside existing batches, placing cleanup after all changes()-dependent statements. Pass numeric queue/sale/offer references from trusted code. Recalculate origin uses actor system and field names for derivation.

- [x] Add failing route tests covering Sales availability/buyer event, Queue creation/publication/deletion, cover changes/removal, derived recomputation, unchanged recalculation and prior human parish.
- [x] Wrap only actual listing writers. Preserve existing media/Queue later-write semantics and test an injected later failure. Supply related IDs without copying URLs or text. Cover removal carries the active admin.
- [x] Verify old Sales event IDs and guards, rollback paths, retained events after contact/visit retention; run focal and complete suites.

### Task 4: Verification, independent review and delivery

**Files:** update ESTADO, checklist, reconciliation, spec and ledger; private handoff stays untracked.

- [x] Run `npm test`, `npm run build`, `npm run check:release`; expected no failures. Run general e2e with local synthetic data. No new UI flow: MCP not applicable.
- [x] Compose isolated local NOT-11+EST-18 schema/tests to verify migration and trigger compatibility; no production mutation.
- [x] Prepare review snapshot/package, dispatch one independent reviewer; fix important findings with reproducing tests and rerun affected checks.
- [x] Recheck remote integration, select viable next task using the rubric, update public status as partial where future producers/UI remain pending, commit concrete files together.
- [x] Prepare delivery with tests, limitations and migration; exact final SHA is recorded in the private handoff and supplied to Luis with the approval request. Production approval remains pending; no push/migration.

Self-review: every approved scope row maps to Tasks 1–3; preservation, replay and migration map to Tasks 1–2; future producers and UI remain explicitly pending. Native execution chosen under the existing construir authorization; no extra plan approval needed.
