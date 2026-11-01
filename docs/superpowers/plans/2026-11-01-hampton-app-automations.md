# Automations Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings → Automations screen showing the clock, the 12-month clean-up, Hermes's text drafts and outbound sending, with a stopped count on Settings, a panel «Pause all outbound», and Hermes jobs deleted after 90 days (AUT-01).

**Architecture:** One read route, `GET /admin/automations`, built from `app_settings` keys (`clock`, `retention_run`, `hermes`) and the `jobs` table. `openCounts` gains `stalled` (0–2) from the same two keys, so the bar's 30 s poll carries it; Hermes's `status` strips it. The pause SQL moves from `server/routes/hermes.js` to `pauseOutbound(env, by)` in `server/routes/automations.js`, shared by the door and a new `POST /admin/outbound/pause` (there, not in hermes.js, so the modules import in one direction: notifications → automations ← hermes). The daily retention batch gets one more `DELETE FROM jobs`.

**Tech Stack:** Cloudflare Pages Functions, D1, React panel (`admin/src`), node:test with the node:sqlite D1 double, Playwright e2e (`tests/e2e.cjs`).

**Spec:** `docs/superpowers/specs/2026-11-01-hampton-app-automations-design.md` (A1–A11).

## Global Constraints

- Thresholds: clock stopped when `clock.at` is more than 30 minutes old or `clock` is missing; Hermes stopped when `hermes.at` is more than 15 minutes old; `hermes` missing = not connected, never stopped (A4).
- Jobs deleted by the daily pass: `status <> 'draft' AND COALESCE(decided_at, claimed_at, created_at) < strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-90 days')`, oldest first, at most `RETENTION_CAP` (500); `retention_run` records `jobs` (A5).
- Success rate: jobs whose `COALESCE(decided_at, claimed_at, created_at)` is within the last 30 days and status in used/discarded/failed; percent = round(100 × used ÷ total); no closed jobs → «—» (A7).
- Recent jobs: 20 newest by id; `requested_by` shown as «Hermes» or «Team», never the email; no draft text (A8).
- Pause from the panel: any admin; already paused keeps `at` and `by` (A6). Only Hermes's `status` strips `stalled` (A10).
- Copy (D19), exactly as spec §3. Dates with `fmtDate` (date and time) or `fmtDay` (the retention date, a Jersey day).
- DESIGN.md (panel):
  - containers `.card`; stopped text `<p class="err">` with the words «Stopped: …» (Text-Not-Color);
  - state badges `.badge.positive` «Active», `.badge.attention` «Paused», `.badge.neutral` «Not connected yet»;
  - buttons `.btn.sm` / `.btn.ghost.sm`, at least 32px tall in the panel; confirmations with `window.confirm`;
  - messages `<p role="status" class="ok">` / `role="alert" class="err"` next to the action;
  - recent jobs as `table.list` (it turns into cards under 760px); empty state with its cause;
  - bar number `.count` with `.sr` text « stopped», as the other nav counts;
  - spacing 4/8/12/16/24; breakpoint 760; no new token, font, `style=` or `dangerouslySetInnerHTML`; API errors as text.
- Performance: the counts poll adds one `app_settings` read by key (`key IN ('clock','hermes')`); the screen loads once, no poll of its own.
- Privacy: no names, emails, phones or draft texts in `/admin/automations`; the logs say counts only.
- `/avanzar`: one commit at the end with code, tests, ESTADO, checklist, spec, plan and ledger. No migration.

## Review Focus

1. Before Hermes is ever installed (`hermes` missing), nothing warns: `stalled` counts only the clock. Test in Task 1.
2. A pause already asked by Hermes, then «Pause all outbound» in the panel: `by` stays `hermes`. Test in Task 1.
3. A `draft` 200 days old is never deleted; a `queued` job 91 days old is; a `used` job decided 89 days ago is kept. Test in Task 1.
4. A `retention_run` from before this change (no `jobs`) reads as 0 jobs, not `undefined`. Test in Task 1 (route returns `jobs: 0`).
5. Phones (390px): the recent-jobs table does not scroll sideways, and Settings with its count still fits the wrapped bar. Walkthrough in Task 2.

---

### Task 1: Server — automations route, stalled count, panel pause, jobs clean-up

**Files:**
- Create: `server/routes/automations.js`, `tests/server/automations.test.mjs`
- Modify: `server/routes/hermes.js` (`pause` calls `pauseOutbound`; `status` strips `stalled`), `server/routes/notifications.js` (`openCounts`), `server/retention.js` (`runRetention`, `recordRetentionDay`), `server/api.js` (register routes), `tests/server/notifications.test.mjs` and any other test deep-equalling the counts object (add `stalled`), `tests/server/retention.test.mjs` (`recordRetentionDay` gains `jobs`)

**Interfaces:**
- Produces `GET /admin/automations` →
  `{ clock: { at: string|null, stopped: bool },
     retention: { date, ok, attempts, contacts, viewings, jobs } | null,
     hermes: { at: string|null, stopped: bool, month: { used, discarded, failed },
               waiting: [{ id, listing_id, title, drafted_at }],
               recent: [{ id, listing_id, title, status, by: "Hermes"|"Team", created_at, closed_at }] } }`
  (no `outbound`: the card reads `counts.outbound`, which the pause bar already uses — A11)
- Produces `POST /admin/outbound/pause` → `{ outbound: { paused: true, at, by } }` (`by` the stored value: an admin email or `hermes`).
- Produces `counts.stalled: 0|1|2` on `GET /admin/notifications/counts` and in the Inbox list's `counts`.
- Produces `export const stoppedFlags = (clockAt, hermesAt, nowMs) => ({ clock: bool, hermes: bool })` in `server/routes/automations.js` (used by `openCounts` and the route).
- Produces `pauseOutbound(env, by) → Promise<{ paused: true, at, by }>` in `server/routes/automations.js`.

- [ ] **Step 1: Write the failing tests** in `tests/server/automations.test.mjs` (same helpers as `hermes.test.mjs`: `makeEnv`, `seedListing`, `call`, `adminCookie`, mocked `Date`):
  - `stoppedFlags`: clock at now−29 min → false, now−31 min → true, null → true; hermes now−14 min → false, now−16 min → true, null → false.
  - `counts.stalled`: empty db → 1; clock fresh, no hermes → 0; clock fresh, hermes 16 min old → 1; both stale → 2.
  - Hermes's `/hermes/status` `counts` has no `stalled` key.
  - `GET /admin/automations`: signed out 401; with a `retention_run` lacking `jobs` → `retention.jobs === 0`; three closed jobs in the last 30 days (used, discarded, failed with only `claimed_at`) plus one used 40 days ago → `month` `{used:1, discarded:1, failed:1}`; a draft job appears in `waiting` with the listing title; `recent` has at most 20, newest first, `by` «Team» for an email and «Hermes» for `hermes`; `JSON.stringify(data)` contains neither the admin email nor the draft's text.
  - `POST /admin/outbound/pause`: signed out 401, cross-origin 403; sets `outbound` with `by` the admin email and the bar's counts show it; after a Hermes pause, the panel pause keeps `by: "hermes"` and the original `at`.
  - `runRetention`: deletes a queued job created 91 days ago, a failed job claimed 91 days ago and a used job decided 91 days ago; keeps a draft 200 days old, a used job decided 89 days ago and a queued job 10 days old; returns `jobs: 3`.

- [ ] **Step 2: Run** `node --test tests/server/automations.test.mjs` — expected FAIL (module not found).

- [ ] **Step 3: Implement.**
  - `stoppedFlags` with `CLOCK_MS = 30 * 60e3`, `HERMES_MS = 15 * 60e3`.
  - `openCounts`: one more batch statement `SELECT key, json_extract(value, '$.at') AS at FROM app_settings WHERE key IN ('clock','hermes')`; `stalled` = number of true flags.
  - `status` in hermes.js: `const { outbound, stalled, ...c } = counts`.
  - `pauseOutbound(env, by)`: the existing pause SQL with `by` bound; the door's `pause` calls `pauseOutbound(env, "hermes")` and keeps mapping `by` to `hermes|team`.
  - `runRetention`: append `DELETE FROM jobs WHERE id IN (SELECT id FROM jobs WHERE <rule> ORDER BY COALESCE(decided_at, claimed_at, created_at), id LIMIT 500)`; return `jobs` from its `meta.changes`. `recordRetentionDay` sets `$.jobs` too.
  - The route's reads in one `env.DB.batch`.

- [ ] **Step 4: Run** `npm test` — expected all pass (after adding `stalled` to the existing counts deep-equals and `jobs` to the retention record test).

### Task 2: Panel — Automations screen, Settings count, e2e

**Files:**
- Create: `admin/src/Automations.jsx`
- Modify: `admin/src/App.jsx` (`SETTINGS` gets `["automations", "Automations"]`; `current` list; route; `SettingsMenu` takes `stalled` and shows `.count` on its button and on the Automations item), `admin/src/styles.css` (only what the cards need), `tests/e2e.cjs`

**Interfaces:**
- Consumes `GET /admin/automations`, `POST /admin/outbound/pause`, `POST /admin/outbound/resume`, `counts.stalled`, `counts.outbound` (Task 1).
- `Automations({ outbound, onChange })`: `outbound` is `counts.outbound` from App (for «asked by»); `onChange` is App's `loadCounts`, called after pause/resume so the pause bar appears or goes at once.

- [ ] **Step 1: Write the failing e2e block** in `tests/e2e.cjs` after the existing panel steps: open Settings → Automations; expect the four card headings «Clock», «12-month clean-up», «Hermes text drafts», «Sending to clients and agencies»; expect «Stopped: no run recorded.» and the Settings button text to include «1 stopped» (the e2e database has no clock row); expect «Not connected yet»; press «Pause all outbound» (accept the dialog) → the pause bar «Sending to clients and agencies is paused» appears; press «Resume sending» in the card → the bar goes.

- [ ] **Step 2: Build the screen** to spec §3, with the classes in Global Constraints. Waiting drafts link to `#/p/<listing_id>`; recent jobs link their listing the same way.

- [ ] **Step 3: Run** `npm test`, `npm run build`, then the e2e (reseed as in the header of `tests/e2e.cjs`). In the workshop the e2e stops at Turnstile (`tests/e2e.cjs:125`): run the new block on its own against the local server to see it pass, and say so in the ledger.

- [ ] **Step 4: Walkthrough** at 1280 and 390 with Playwright MCP (or chrome-devtools MCP), screenshots kept outside the repo.
