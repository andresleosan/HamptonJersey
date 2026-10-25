# G2 Retention (12-month deletion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contacts inactive for 12 months and viewing requests older than 12 months are deleted automatically once a day; the panel warns from month 11 and lets the team log a conversation that restarts the clock.

**Architecture:** A daily pass in `server/retention.js`, claimed through `app_settings` by the first `GET /admin/notifications/counts` of each Jersey day and run in `waitUntil`; set-based SQL in one `batch` (no per-person statements). The warning is computed on read through a new index on `contacts(last_activity_at)`.

**Tech Stack:** Cloudflare Pages Functions, D1 (SQLite), React 19 panel (admin/src), node:test with the node:sqlite D1 double.

**Spec:** `docs/superpowers/specs/2026-10-25-hampton-app-retention-design.md` (decisions E1–E12).

## Global Constraints

- All panel, API and error text in English (D19).
- One `env.DB.batch` per write that logs events; events with personal data get `data = NULL`, never `''` (the Inbox runs `json_extract` on it).
- Reuse, do not copy: `touch` and `LOCK` from `server/routes/applicants.js`, `logEvent`/`resolveNotices` from `server/events.js`, `jerseyToday()` from `server/viewings.js`, `normalizePhone` where the routes already import it.
- Each pass touches at most 500 contacts and 500 viewing requests, oldest first (E7). The `batch` holds a fixed number of statements whatever the count.
- Exempt: a contact with any applicant that has a row in `sales` (E3).
- Migration file: `migrations/0014_retention.sql` with only `CREATE INDEX contacts_activity ON contacts(last_activity_at);`.
- Run `npm test` before each commit; it must stay green (361 node + 13 Python today).

## Review Focus

1. A contact with two searches, one with a sale (any status, including fallen through): nothing of that contact is deleted, and it never shows as Expiring.
2. A pass that runs twice on the same Jersey day (two panel tabs polling): the second claim fails and deletes nothing; on the next day it runs again.
3. More than 500 expired contacts: exactly the 500 oldest go, the rest the next day, and every statement in the batch acts on the same 500.
4. A viewing request by someone whose email differs only in case, or whose phone is typed as "07797 123 456", still restarts the matching contact's clock.
5. A notice of a deleted contact still renders in the Inbox Feed as "Deleted applicant" with no name (same as the manual delete).

---

### Task 1: The daily pass, its trigger and the new activity sources

**Files:**
- Create: `migrations/0014_retention.sql`, `server/retention.js`, `tests/server/retention.test.mjs`
- Modify: `server/routes/notifications.js` (the `counts` handler claims the day and passes the run to `waitUntil`), `server/routes/public.js` (`createViewing`) and `server/routes/inbox.js` (`create`): the viewing's batch also runs `UPDATE contacts SET last_activity_at = ? WHERE email = ? OR phone = ?` with the lower-cased email and the normalized phone (null-safe).

**Interfaces:**
- Produces: `runRetention(env, ts) -> Promise<{ contacts: number, viewings: number }>` (ts = ISO now; Jersey date derived from it), `claimRetentionDay(env, date) -> Promise<boolean>` (upsert of `retention_run` = `{"date": date}` only when the stored date is earlier; true when this call won), `RETENTION_CAP = 500`, and the SQL fragment `EXEMPT` (NOT EXISTS sale for the contact) that Task 2 reuses for the Expiring count.
- Notices resolved with `resolved_by = 'system'`; deletion events `applicant.deleted` and `contact.deleted` with `actor = 'system'`, `data` NULL.

- [ ] **Step 1: Write the failing tests** in `tests/server/retention.test.mjs` (seed rows with the same raw-insert helpers used in `tests/server/notifications.test.mjs`):
  - `deletes a contact inactive for 12 months with its searches, matches and offers`: contact at `2025-10-01T…`, `runRetention(env, "2026-10-25T09:00:00.000Z")` → contact, applicant, match and offer rows gone; its events kept with `data` NULL; its open notice resolved by `system` with title `Deleted applicant`; one `applicant.deleted` and one `contact.deleted` event by `system`; returns `{contacts: 1, viewings: 0}`.
  - `keeps a contact active 11 months ago`.
  - `keeps a contact with a sale in any status` (seed a `sales` row on one of two searches).
  - `deletes viewing requests whose date is over 12 months old`: one dated `2025-10-24` goes (notice retitled `Deleted viewing request`, events data NULL), one dated `2025-10-26` stays.
  - `stops at 500 per pass, oldest first`: 501 expired contacts → 500 deleted, the newest one left.
  - `claims the day once`: `claimRetentionDay(env, "2026-10-25")` true, again false, `"2026-10-26"` true.
  - `the counts request runs the pass once a day`: via `call(env, "GET", "/admin/notifications/counts", {cookie})` twice; the expired contact is deleted after the first and the stored `retention_run` date is today's Jersey date.
  - `a viewing request restarts the matching contact's clock`: public `POST /viewings` (as in `tests/server/viewings.test.mjs`) with `JANE@example.je` and a contact `jane@example.je` → `last_activity_at` updated; same with phone `07797 123 456` vs `+447797123456` through the panel's `POST /admin/viewings`.
- [ ] **Step 2: Run** `node --test tests/server/retention.test.mjs` → fails (module missing).
- [ ] **Step 3: Implement** the migration, `server/retention.js`, the counts hook and the two viewing touches. The cutoff for contacts is `strftime('%Y-%m-%dT%H:%M:%fZ', ?, '-12 months')` of `ts`; for viewings, `date(jerseyDate, '-12 months')` compared with `viewing_requests.date`.
- [ ] **Step 4: Run** `npm test` → all pass.
- [ ] **Step 5: Commit** `Delete contacts and viewings after 12 months without activity`.

### Task 2: Warning, Log conversation and the privacy text

**Files:**
- Modify: `server/routes/notifications.js` (`openCounts` adds `expiring`), `server/routes/applicants.js` (`list` accepts `expiring=1` and returns `expires_on` per row inside the window; `detail` returns `retention: { kept_until, exempt }`; new route `POST /admin/contacts/:id/conversation`), `admin/src/App.jsx` (badge on Applicants: `{n}<span className="sr"> expiring</span>`), the Applicants list screen (filter **Expiring**, chip `Deletes 12 Nov`), `admin/src/ApplicantDetail.jsx` (line «Kept until 12 Nov 2027» or «Kept for 5 years: it has a sale», button **Log conversation**, timeline label `contact.conversation` → «Conversation logged», `applicant.deleted`/`contact.deleted` by system need no label: the record is gone), `site/apply.js` (E11), tests in `tests/server/retention.test.mjs` and `tests/e2e.cjs`.
- Expiring = not exempt and `last_activity_at` in [now − 12 months, now − 11 months). `expires_on` / `kept_until` = date part of `last_activity_at + 12 months`.

**Interfaces:**
- Consumes: `EXEMPT`, `touch`, `logEvent`.
- Produces: `GET /admin/notifications/counts` → `{ …, expiring: number }`; `GET /admin/applicants?expiring=1`; `POST /admin/contacts/:id/conversation` → `{ ok: true, kept_until }` (404 for an unknown contact).

- [ ] **Step 1: Write the failing tests**: `counts.expiring` is 1 for a contact active 11.5 months ago, 0 at 10 months, 0 when exempt; `?expiring=1` lists only that one with `expires_on`; `POST /admin/contacts/:id/conversation` updates `last_activity_at`, writes `contact.conversation` and the contact leaves the Expiring count; non-admin → 401; cross-origin → 403; unknown id → 404.
- [ ] **Step 2: Run** them → fail.
- [ ] **Step 3: Implement** server and panel. Privacy notice «How long we keep it» becomes: "We keep your details for 12 months from the last activity on your record: a new registration, a viewing request, a change you ask for, or a conversation with us. After that we delete them, and a viewing request is deleted 12 months after the day of the viewing." (keep the sentence about anonymous only if still true — it is not: drop it).
- [ ] **Step 4: e2e**: in `tests/e2e.cjs`, seed one contact active 11.5 months ago, check the Applicants badge, the Expiring filter and the chip, press Log conversation and check the badge disappears and «Kept until» moves forward. Run per the e2e header recipe (reseed first).
- [ ] **Step 5: Run** `npm test`, `npm run build` and the e2e → green. **Commit** `Warn before the 12-month deletion and log conversations`.
