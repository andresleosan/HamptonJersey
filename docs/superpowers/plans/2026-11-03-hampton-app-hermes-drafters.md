# AUT-15 · Who uses Hermes drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Only the people on the `hermes_drafters` list see and use Hermes drafts in the panel; with no list nobody does, even after the door has been called.

**Architecture:** One check in server/routes/hermes.js reads the `app_settings` row `hermes_drafters` (a JSON list of emails set by a remote SQL command, never in the repo). The four panel job routes use it: GET answers with nothing (the block hides itself, HermesDraft.jsx:20), the three POSTs answer 403 before reading the request. The door and Resume are unchanged.

**Tech Stack:** Cloudflare Pages Functions + D1, React panel, node:test, Playwright e2e.

**Spec:** docs/superpowers/specs/2026-11-03-hampton-app-hermes-drafters-design.md

## Global Constraints

- Row `app_settings.key = 'hermes_drafters'`, value a JSON array of emails; compared in lower case. Missing, empty, unparseable or not an array means nobody.
- Non-drafters: `GET /api/admin/jobs` → 200 `{ job: null, hermes_at: null }`; `POST /api/admin/jobs`, `/api/admin/jobs/:id/use`, `/api/admin/jobs/:id/discard` → 403 `"Hermes drafts aren't available to your account."`, before `readJson` and before any query on `jobs`.
- Unchanged: every `/api/hermes/*` door operation, `POST /api/admin/outbound/resume`, the Automations card for everyone.
- Public repo: no real email in code, tests, fixtures or docs; tests use `admin@example.test` / `colleague@example.test`. No migration.
- DESIGN.md, copy: functional English in sentence case, no exclamations ("Couldn't save. Try again."); empty states give their cause. Automations' empty Hermes text becomes exactly `No jobs yet.` (Luis's decision 3, 3-nov-2026).
- DESIGN.md, accessibility: no new controls; errors stay as text in the existing `role="alert"` / `.err`.
- DESIGN.md, security: never `dangerouslySetInnerHTML`; API error messages shown as text; no new dependency, font or request.
- Precondition before HERMES_KEY goes into Production: this commit on origin/main and its Pages deployment finished.

## Review Focus

1. A broken or oddly typed `hermes_drafters` value (`not json`, `{"emails":[...]}`, `"a@b"`, `[1]`, `[]`) lets nobody in, never everyone.
2. A non-drafter's POST for a missing or unpublished listing answers 403, not 404, 201 or 409, and creates no job.
3. A list entry in mixed case (`Admin@Example.test`) still matches the lower-case session email.
4. The e2e's "block hidden" check waits for the `/api/admin/jobs` answer; counting `.hermes-draft` before it arrives passes with the bug.
5. Someone on the list but removed from admins gets 401 before the list is read (api.js runs currentAdmin first).

---

### Task 1: The drafters check on the panel's job routes

**Files:**
- Modify: `server/routes/hermes.js` (latestJob, askJob, decide, the routes table at the end)
- Test: `tests/server/hermes.test.mjs` (env0 and a new test)

**Interfaces:**
- Produces: `canUseHermesDrafts(env, email) -> Promise<boolean>` (exported for the test only if needed; otherwise module-local).

- [ ] **Step 1: Failing test.** `env0(drafters = [ADMIN])` inserts the `hermes_drafters` row (JSON.stringify(drafters)) unless `drafters` is null, so the existing panel tests keep passing as a drafter. New test `panel: only the people on the drafts list see and use Hermes drafts (AUT-15)`:
  - for each of: no row (`env0(null)`), `'not json'`, `'{"emails":["admin@example.test"]}'`, `'"admin@example.test"'`, `'[1]'`, `'[]'`, `'["colleague@example.test"]'`: after one door call (so `hermes.at` exists) and with a queued job made through the door, `GET /admin/jobs?listing=HE-R001` → `{ job: null, hermes_at: null }`; `POST /admin/jobs` for HE-R001 → 403; the same for HE-X999 (missing) → 403; `POST /admin/jobs/<id>/use` and `/discard` → 403; the job row is unchanged and no new job exists.
  - `'["Admin@Example.test"]'` → GET returns the job and hermes_at (matches in lower case).
  - `POST /admin/outbound/resume` → 200 with `env0(null)`.
- [ ] **Step 2:** `node --test tests/server/hermes.test.mjs` → the new test FAILS (GET returns hermes_at; POSTs answer 201/404/409).
- [ ] **Step 3:** In hermes.js: `canUseHermesDrafts` (read the row, `JSON.parse` in try, `Array.isArray`, compare `typeof e === "string" && e.toLowerCase() === email`), latestJob's early return, and a wrapper for askJob, use and discard that fails 403 first.
- [ ] **Step 4:** `npm test` → all pass.
- [ ] **Step 5:** Ledger line for Task 1.

### Task 2: Automations' empty text and the e2e

**Files:**
- Modify: `admin/src/Automations.jsx:59`, `tests/e2e.cjs` (new `hermesDrafters(page)` called right after `automations(...)` in `admin()`)

- [ ] **Step 1:** `hermesDrafters(page)`: insert the `hermes` row (`{"at":"2026-11-03T08:00:00.000Z"}`) with `d1()`; open `admin/#/p/HE-R001` (the editor) with a `waitForResponse` on `/api/admin/jobs?listing=HE-R001` set up before the navigation; after the answer, `.hermes-draft` count is 0. Insert `hermes_drafters` = `["admin@example.test"]`, `page.reload()` with the same wait, and `getByRole("button", {name: "Ask Hermes for a draft"})` appears. Delete both rows at the end.
- [ ] **Step 2:** Automations.jsx:59 text to `No jobs yet.`
- [ ] **Step 3:** `npm test`, `npm run build`, and the full e2e (reseed, local R2 photos, `wrangler pages dev`) → `e2e OK`.
- [ ] **Step 4:** Playwright MCP (or chrome-devtools MCP) on the local server at 1280 and 390: the editor of HE-R001 with the hermes row and no list (no block), with the list (block with the button), and Automations' empty text; screenshots in the scratchpad.
- [ ] **Step 5:** Ledger line for Task 2.

### Task 3: Docs in the same commit

**Files:**
- Modify: `docs/roadmap/checklist-hampton-app.html` (JSON: new AUT-15; AUT-13, AUT-14, PUB-13, PRE-31, PRE-32, PRE-12; new pending items for the assistant, owner prospecting and the lawyer package; `actualizado` 2026-11-03), `docs/roadmap/ESTADO.md` (Hermes section and next task), `docs/roadmap/2026-10-23-arquitectura-hampton-app.md` §6.6 (Telegram, the channel, the avisador, Luis's two accounts, AUT-15), this plan's ledger.

- [ ] **Step 1:** The edits above. No Telegram IDs, invite links, IPs or emails. Never mention a second factor for Telegram accounts (Luis's decision, 2-nov).
- [ ] **Step 2:** `npm test` (the checklist JSON still parses: the page reads it at load) and a JSON parse of the `datos` block.
- [ ] **Step 3:** Independent review (bugs, security and privacy, DESIGN.md, code of more), fixes, then one commit with code, ESTADO, checklist, spec, plan and ledger.
