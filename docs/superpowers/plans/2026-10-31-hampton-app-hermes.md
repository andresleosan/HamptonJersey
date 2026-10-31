# Hampton's Hermes, app side, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app opens a small door for Hampton's Hermes (AUT-13): its own key, six fixed operations, public data (C0) and counts only. Work goes through a `jobs` table; a listing text draft comes back as a draft that a person uses and saves in the panel (first part of PUB-13). Hermes can pause sending; only the panel resumes it.

**Architecture:** `server/routes/hermes.js` holds the door (bearer key, its own route table, outside the same-origin check because it uses no cookie) and the panel's job and resume routes. `server/api.js` hands `/api/hermes/*` to the door before its own routing. Migration 0018 adds `jobs`; `app_settings` keeps `outbound` (the pause) and `hermes` (its last request). The panel shows a pause bar on every screen and a draft block in the listing editor (`admin/src/HermesDraft.jsx`). `hermes/key-proxy.mjs` is the key's custodian on the VPS (decision H4), installed later.

**Tech Stack:** Cloudflare Pages Functions, D1, React panel, node:test with the node:sqlite D1 double, Node `http` for the proxy.

**Spec:** `docs/superpowers/specs/2026-10-31-hampton-app-hermes-design.md` (H1–H14).

## Global Constraints

- Door auth: `Authorization: Bearer <env.HERMES_KEY>`; key under 32 characters or missing → every door request is 401. Compare SHA-256 digests in constant time. Never read the panel cookie on the door (H5, H6).
- The door has exactly: `GET status`, `GET news`, `POST jobs`, `POST jobs/next`, `POST jobs/:id/draft`, `POST pause`. Anything else → 404 (after the key check). No approve, use, discard, resume, publish or delete (H6, H10, H11).
- No personal data on the door: no applicant or viewing name, email, phone or id; never a notification's title. News items: `New applicant` / `New viewing request for {title}` / `New viewing request`, only `action_required = 1` notices of category `new_applicant` or `viewing` (H7).
- Jobs only for listings on the website (`published = 1`, not archived), at request and at claim; listing data = `toPublic` minus media, interest, featured, order and tour (H9).
- Draft limits as the editor: title ≤ 200, summary ≤ 5000, description ≤ 20000, strings, at least one non-blank; body ≤ 160 KB (changed from 64 KB after the code review: 25,200 characters escaped as \uXXXX).
- Stale claim: `working` for more than 10 minutes → claimable again; 3 attempts → `failed` (H8).
- Links from the request's origin: `/admin/#/`, `/admin/#/viewings`, `/admin/#/p/<id>` (H13).
- Panel: copy exactly as spec §3. DESIGN.md: `.warn` bar, `.btn.sm` / `.btn.ghost.sm` at 32px, messages `role="status" class="ok"` / `role="alert" class="err"`, text never HTML (no `dangerouslySetInnerHTML`), no new token, font, library or `style=` attribute, spacing 4/8/12/16/24.
- `/avanzar` on the taller: local branch `hermes/aut-13`, one commit with code, tests, migration, ESTADO, checklist, spec, plan and ledger; no push, no production (Luis's encargo of 31-oct). e2e not run (Turnstile).

## Review Focus

1. A request with the panel cookie and no key gets 401 on the door; a request with the key gets 404 on `/api/admin/...` paths (the key opens nothing else).
2. Seed an applicant and a viewing with a recognisable name, phone and email: no door response contains them, nor the applicant's id.
3. Two concurrent `jobs/next` never get the same job; a stale job is retried and fails at the third attempt.
4. A draft is never applied to the listing by the door: the listing row is unchanged until the panel saves.
5. `pause` twice keeps the first `at`; only `POST /admin/outbound/resume` clears it.

---

### Task 1: Migration 0018 and the door

**Files:**
- Create: `migrations/0018_jobs.sql`, `server/routes/hermes.js`, `tests/server/hermes.test.mjs`
- Modify: `server/api.js` (hand `/hermes/*` to the door), `server/routes/notifications.js` (export `openCounts`, add `outbound`), `tests/server/notifications.test.mjs` (counts gain `outbound: null`), `tests/server/helpers.mjs` (optional bearer in `call`)

- [ ] Step 1: failing tests: no key / wrong key / short env key → 401; cookie only → 401; key on an admin route → 401 (the key is not a session); unknown door path → 404; status counts and to-confirm list; summary text; news cursor, filter and text; privacy sweep (Review Focus 2); jobs create/409/404; claim order, concurrency and stale retry/fail; draft validation and state; pause idempotent; `hermes.at` written.
- [ ] Step 2: migration and door until green. `npm test`.

### Task 2: Panel routes, pause bar and draft block

**Files:**
- Modify: `server/routes/hermes.js` (admin routes), `admin/src/App.jsx` (pause bar), `admin/src/ListingEditor.jsx` (mount the block, copy a used draft into the form), `admin/src/styles.css`
- Create: `admin/src/HermesDraft.jsx`
- Test: `tests/server/hermes.test.mjs`

- [ ] Step 1: failing tests: admin create/409, read `{job, hermes_at}`, use only from `draft` (records who and when, listing row unchanged), discard from open states, resume clears the pause, all need the session and same origin.
- [ ] Step 2: routes until green; then the UI. `npm test`, `npm run build`.

### Task 3: The key's custodian

**Files:**
- Create: `hermes/key-proxy.mjs`, `tests/server/key-proxy.test.mjs`

- [ ] Step 1: failing test with a fake upstream: forwards `GET`/`POST` `/api/hermes/...` with the key, drops incoming `authorization`, `cookie`, `host`; refuses other paths and methods (404/405); body over 160 KB → 413 with the connection closed, without reading the rest; refuses to start on `0.0.0.0` or `::`.
- [ ] Step 2: implement until green. `npm test`.

## Installation notes (outside the taller, after Luis's «sí»)

Added on 31-oct-2026 from the VPS security review, for whoever installs it with Docker and the VPS and Cloudflare keys:

- **Network:** the key's custodian (`hermes/key-proxy.mjs`) runs in a Docker network of its own, shared only by Hampton's Hermes and the custodian. No other container on it and no port published on the host. `LISTEN_HOST` is the custodian's address on that network; it refuses `0.0.0.0` and `::`. Hermes's outbound list reaches the model, `api.telegram.org` and the custodian, and nothing else.
- **Key:** generate it with `openssl rand -hex 32` on the VPS, never in a chat. Put it only in the **Production** environment of the Pages project (`HERMES_KEY`), never in Preview: previews use the production database. On the VPS it is a Docker secret read through `HERMES_KEY_FILE`, never an environment variable of Hermes. It is never printed or committed. To change it: a new value in both places, then a new Pages deployment.
- **Old jobs:** the `jobs` table keeps used, discarded and failed rows (C0 drafts and the email of the staff member who decided). Clearing them is pending: a step of the clock (AUT-07) that deletes closed jobs after a set time, to be decided with Luis.
- **Pause:** every future send to clients or agencies (email, WhatsApp, social posts) reads `app_settings.outbound` right before it leaves and sends nothing while `paused` is true, whoever asked for the pause. Today the app sends nothing, so nothing reads it yet.

### Task 4: Close

- [ ] `npm test`, `npm run build`, `npm run check:release`; independent review; ESTADO, checklist, relay; one commit on `hermes/aut-13`.
