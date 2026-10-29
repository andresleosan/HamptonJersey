# Jobs Clock (hampton-jobs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Worker `hampton-jobs`, beside the Pages project and on the same D1, wakes every 10 minutes, leaves its time in `app_settings.clock` and runs what is due: today, the 12-month deletion at 00:00 Jersey, with the panel's polls kept as a backup.

**Architecture:** The claim → run → record chain of the deletion moves from `server/routes/notifications.js` into `server/retention.js` as `retentionPass(env, ts)`, used by the panel (through `waitUntil`) and by the new Worker entry `server/jobs.js` (`scheduled` only). `jobs/wrangler.toml` deploys that entry as `hampton-jobs` with a 10-minute cron, the website's D1 binding and no URL; Workers Builds deploys it from `jobs/` on each push to `main`.

**Tech Stack:** Cloudflare Workers (Cron Triggers), D1 (SQLite), wrangler 4.148.0, node:test with the node:sqlite D1 double (`tests/server/helpers.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-29-hampton-app-jobs-clock-design.md` (K1–K11).

## Global Constraints

- The deletion does not change: same `claimRetentionDay` (3 attempts per Jersey day), `runRetention` (cap 500), `recordRetentionDay`; `retention_run` keeps the shape `{date, ok, attempts, contacts, viewings}` (K5).
- The panel's polls (`GET /admin/notifications` and `/counts`) keep claiming the day, after the answer, through `waitUntil` (K6).
- Heartbeat: `app_settings` row `key = 'clock'`, `value = {"at": <scheduledTime as ISO>}`, `updated_at` = `now()`, `updated_by = 'system'`, written on every tick before the jobs (K7).
- `jobs/wrangler.toml`: `name = "hampton-jobs"`, `main = "../server/jobs.js"`, `compatibility_date` equal to `wrangler.toml`'s (`"2025-10-01"`), `workers_dev = false`, `preview_urls = false`, `crons = ["*/10 * * * *"]`, one D1 binding equal to `wrangler.toml`'s (`DB`, `hampton`, `1da41b63-c61f-4491-9f8d-3a9afde6e0fb`), `[observability] enabled = true`. Nothing else: no R2, no vars, no routes, no secrets (K3, K4, K8).
- The Worker exports `scheduled` only, no `fetch` (K4).
- Logs carry counts and errors only: `console.log("Retention pass", {contacts, viewings})`, `console.error("Retention pass failed", e)`; never a name, email or phone (K8).
- DESIGN.md, Rendimiento: no new font, weight or library; this task adds no npm dependency. D19: code, comments and logs in English. No UI change.
- `/avanzar`: work on `main`; no task commits on its own; one commit at the end with code, tests, ESTADO.md, checklist, spec, plan and ledger. No migration. Before the push Luis deploys the Worker from his terminal, checks the heartbeat and connects Workers Builds (K10).

## Review Focus

1. The night the clocks go back (25-oct-2026: BST until 01:00 UTC): the 00:00 Jersey tick is 23:00 UTC on the 24th and must claim the 25th; the next day's is 00:00 UTC. Task 1 test `each tick leaves its time; the first tick of a Jersey day deletes once`.
2. The clock and a panel poll on the same Jersey day: whoever claims first runs the pass, the other does nothing; on a day the clock missed, the poll still runs it. Task 1 test `the panel's poll stays a backup`.
3. A failed pass inside a tick: the tick still resolves (no crash loop), the error is logged and the next tick retries. Task 1 test `a failed pass is logged, and the next tick tries again`.
4. The Worker drifting from the website: another database, another cadence, a public URL or an extra binding. Task 2 test `the clock's Worker: hampton-jobs, every 10 minutes, on the website's database, with no public URL`.
5. Personal data in the Worker's logs. Task 1 test `each tick leaves its time; the first tick of a Jersey day deletes once` asserts the only log line is `["Retention pass", {contacts: 1, viewings: 0}]`.

---

### Task 1: The tick — one retention chain, the Worker entry, the heartbeat

**Files:**
- Modify: `server/retention.js` (append `retentionPass` after `recordRetentionDay`)
- Modify: `server/routes/notifications.js:6` (imports) and `:49-58` (the local `retentionPass` goes; `list` and `counts` call the shared one)
- Create: `server/jobs.js`
- Create: `tests/server/jobs.test.mjs`

**Interfaces:**
- Produces: `retentionPass(env, ts: string /* ISO */): Promise<void>` in `server/retention.js`. Claims `jerseyToday(new Date(ts))`; when won, `runRetention(env, ts)`, then `recordRetentionDay`, then `console.log("Retention pass", r)`; any failure → `console.error("Retention pass failed", e)`. Never rejects.
- Produces: `server/jobs.js` default export `{ scheduled(controller: { scheduledTime: number }, env: { DB }): Promise<void> }` and nothing else.

- [ ] **Step 1: Write the failing tests** in `tests/server/jobs.test.mjs` (own small helpers; never import another test file)

```js
import worker from "../../server/jobs.js";
const tick = (env, iso) => worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.parse(iso) }, env, { waitUntil() {} });
const OLD = "2025-10-01T10:00:00.000Z"; // 12 months inactive by 25-oct-2026

test("the Worker only answers the clock", () => assert.deepEqual(Object.keys(worker), ["scheduled"]));

test("each tick leaves its time; the first tick of a Jersey day deletes once", async t => {
  const logs = t.mock.method(console, "log", () => {});
  // contact(env, OLD) → id; setting(env, key) → parsed value; exists(env, id) → boolean
  await tick(env, "2026-10-24T23:00:00.000Z");            // 00:00 Jersey on the 25th (BST)
  assert.deepEqual(setting(env, "clock"), { at: "2026-10-24T23:00:00.000Z" });
  assert.equal(exists(env, gone), false);
  assert.deepEqual(setting(env, "retention_run"), { date: "2026-10-25", ok: true, attempts: 1, contacts: 1, viewings: 0 });
  assert.deepEqual(logs.mock.calls.map(c => c.arguments), [["Retention pass", { contacts: 1, viewings: 0 }]]);
  // a contact due later the same day waits: 23:10 UTC → clock moves, contact stays
  // 2026-10-26T00:00:00.000Z (GMT) → that contact goes; retention_run {date: "2026-10-26", attempts: 1, contacts: 1}
});

test("a failed pass is logged, and the next tick tries again", async t => {
  // env.DB.batch rejects once for the batch containing "contact.deleted" (as retention.test.mjs does)
  // tick 09:00Z resolves; console.error called once; contact still there
  // tick 09:10Z → contact gone; retention_run {date: "2026-10-25", ok: true, attempts: 2, contacts: 1, viewings: 0}
});

test("the panel's poll stays a backup", async t => {
  // mock Date at 2026-10-25T09:00Z; tick 2026-10-24T23:00Z does the 25th; then a new OLD contact
  // GET /admin/notifications/counts (admin cookie) → 200, contact kept (the day is done)
  // setTime 2026-10-26T08:00Z, no tick; counts with a fresh adminCookie() → contact deleted
});
```

- [ ] **Step 2: Run** `node --test tests/server/jobs.test.mjs`. Expected: FAIL, `Cannot find module '…/server/jobs.js'`.

- [ ] **Step 3: Implement `retentionPass` in `server/retention.js`**, then in `notifications.js` replace the local function with `waitUntil(retentionPass(env, now()))` in `list` and `counts`, importing `retentionPass` instead of `claimRetentionDay, runRetention, recordRetentionDay`. The E6 comment moves with the chain and gains K5/K6: the clock claims the day at 00:00 Jersey; the polls claim it too, as the backup.

- [ ] **Step 4: Implement `server/jobs.js`**: `scheduled` turns `controller.scheduledTime` into the ISO `ts`, upserts the heartbeat (one `INSERT … ON CONFLICT (key) DO UPDATE` on `app_settings`, binds `ts` and `now()`), then `await retentionPass(env, ts)`. Header comment: what the Worker is (AUT-07), where its config lives (`jobs/wrangler.toml`) and the rule for the next jobs (each claims its own run, so a repeated tick or a poll at the same time does nothing twice).

- [ ] **Step 5: Run** `node --test tests/server/jobs.test.mjs tests/server/retention.test.mjs tests/server/notifications.test.mjs`. Expected: all pass (the existing poll tests prove the backup unchanged).

- [ ] **Step 6: Run** `npm test`. Expected: all node tests and the 14 Python tests pass.

### Task 2: The Worker — its config, its bundle, a real tick in local

**Files:**
- Create: `jobs/wrangler.toml`
- Modify: `tests/server/jobs.test.mjs` (config test)

**Interfaces:**
- Consumes: `server/jobs.js` (Task 1).
- Produces: `jobs/wrangler.toml`, the file Workers Builds deploys from the root directory `jobs` (spec K3). Its header comment records the dashboard settings. *Final review (security-1):* build command `cd .. && npm ci --ignore-scripts`, deploy command `../node_modules/.bin/wrangler deploy`, `SKIP_DEPENDENCY_INSTALL=1`, preview builds off (first written as `npx wrangler@4.148.0 deploy`, which fetched wrangler's dependencies unpinned in a build that holds the deploy token).

- [ ] **Step 1: Write the failing config test**

```js
const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const val = (text, key) => text.match(new RegExp(`^${key} = (.+)$`, "m"))?.[1];
test("the clock's Worker: hampton-jobs, every 10 minutes, on the website's database, with no public URL", () => {
  const jobs = read("jobs/wrangler.toml"), pages = read("wrangler.toml");
  assert.equal(val(jobs, "name"), '"hampton-jobs"');
  assert.equal(val(jobs, "main"), '"../server/jobs.js"');
  assert.equal(val(jobs, "crons"), '["*/10 * * * *"]');
  assert.equal(val(jobs, "workers_dev"), "false");
  assert.equal(val(jobs, "preview_urls"), "false");
  assert.equal(val(jobs, "compatibility_date"), val(pages, "compatibility_date"));
  for (const k of ["binding", "database_name", "database_id"]) assert.equal(val(jobs, k), val(pages, k));
  assert.doesNotMatch(jobs, /r2_buckets|\[vars\]|routes?\s*=/);
});
```

- [ ] **Step 2: Run** `node --test tests/server/jobs.test.mjs`. Expected: FAIL, `ENOENT … jobs/wrangler.toml`.

- [ ] **Step 3: Write `jobs/wrangler.toml`** with exactly the Global Constraints' values.

- [ ] **Step 4: Run** `node --test tests/server/jobs.test.mjs`. Expected: PASS.

- [ ] **Step 5: Bundle check**: `npx wrangler deploy -c jobs/wrangler.toml --dry-run --outdir <scratchpad>/jobs-bundle`. Expected: `--dry-run: exiting now.`, the bundle holds `Retention pass` and no `firebase` or `jose`, and wrangler lists the `DB` binding.

- [ ] **Step 6: A real tick in workerd**, on its own local D1 under the scratchpad (absolute path `$S`), not the e2e one:
  - `npx wrangler d1 migrations apply hampton --local --persist-to $S/jobs-local`
  - insert one contact with `last_activity_at` = `2024-01-01T10:00:00.000Z` (`wrangler d1 execute hampton --local --persist-to $S/jobs-local --command …`)
  - `npx wrangler dev -c jobs/wrangler.toml --test-scheduled --persist-to $S/jobs-local --port 8789` in the background, then `curl "http://localhost:8789/__scheduled?cron=*/10+*+*+*+*"`
  - Expected: `SELECT key, value FROM app_settings` shows `clock` with this run's time and `retention_run` `{ok: true, contacts: 1, …}`; `SELECT COUNT(*) FROM contacts` is 0. This also proves the Worker and `wrangler.toml` resolve to the same local database. Stop the dev server.

- [ ] **Step 7: Regression**: `npm test`, `npm run build`, then the e2e (reseed as in the header of `tests/e2e.cjs`, `wrangler pages dev --port 8788 --persist-to .wrangler/e2e`, `PW=/root/cotizador-video/node_modules/playwright-core CHROME=/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node tests/e2e.cjs <shots>`). Expected: all pass. No browser walkthrough: nothing visible changes.

### Task 3: Records, review and the single commit

**Files:**
- Modify: `docs/roadmap/ESTADO.md` (the header's "En producción" line; row F1: the clock exists and does the daily deletion at 00:00 Jersey with the panel as backup)
- Modify: `docs/roadmap/checklist-hampton-app.html` (JSON `datos`: `actualizado` 2026-10-29; AUT-07 → `hecho`; the items whose `falta` says the clock does not exist: NOT-10, AGE-05, AGE-13, VIS-13, VIS-16, BUS-08, ADM-03, ADM-04, ANA-08, OFE-06, PRE-12, PRE-14, and AUT-01's `hecho`/`falta`; their `evidencia` points at `jobs/wrangler.toml` and `server/jobs.js` instead of "wrangler.toml:1-20")
- Modify: `docs/superpowers/plans/2026-10-29-hampton-app-jobs-clock-ledger.md`

- [ ] **Step 1: Update ESTADO.md and the checklist** (one script over the JSON, checked with `JSON.parse` after writing; ids stable; no tailnet IPs, ports or `/root/.claude` paths: the repo is public).
- [ ] **Step 2: Independent review** with four lenses (errors; security and privacy; DESIGN.md and docs; excess code), each finding checked by a skeptic. Fix what is confirmed, with a test where it is code; record rulings in the ledger.
- [ ] **Step 3: Run** `npm test` and `npm run build` again. Expected: pass.
- [ ] **Step 4: Commit** on `main`: code, tests, `jobs/wrangler.toml`, ESTADO.md, checklist, spec, plan, ledger. Message: `Add the jobs clock Worker`. Not pushed yet.
- [ ] **Step 5: Luis's go-live (K10)**, step by step for him: deploy `hampton-jobs` from `/root/HamptonJersey` (`export CLOUDFLARE_ACCOUNT_ID=…`, `npx wrangler deploy -c jobs/wrangler.toml`); after ≤ 10 minutes, read the heartbeat (`npx wrangler d1 execute hampton --remote --command "SELECT value, updated_at FROM app_settings WHERE key = 'clock'"`); connect Workers Builds (root directory `jobs`, build command `cd .. && npm ci --ignore-scripts`, deploy command `../node_modules/.bin/wrangler deploy`, build variable `SKIP_DEPENDENCY_INSTALL=1`, preview builds off). Wait for his output at each check.
- [ ] **Step 6: Push** (`git push origin main`, or his VS Code command if it asks for the token); check `origin/main` has the commit, Pages served it and the first Workers Builds run deployed `hampton-jobs`; the heartbeat keeps moving. Republish the private checklist copy and overwrite `.claude/relevo-avanzar.md`.
