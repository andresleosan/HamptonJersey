# PUB-21 · Properties Queue (Google Drive) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person pastes a Google Drive folder link and a note in /admin → Properties Queue; Hermes turns the folder's documents into a proposal; the person reviews it in the usual editor and «Approve and publish» puts it on the website.

**Architecture:** A new table `drive_imports` (not `jobs`: its `kind` CHECK and NOT NULL `listing_id` don't fit, and a rebuild of `jobs` is riskier than a new table). The Worker alone holds the service-account key (`server/drive.js`), walks the folder, serves Hermes the documents of its own import through the existing door (`HERMES_KEY`) and proxies the «Edited» photos to the browser. The browser creates the draft exactly like PUB-01 (`readPropertyText` → `draftBody` → `POST /admin/listings` → `uploadPhoto`), so the photos are reduced and lose GPS in the same place.

**Tech Stack:** Cloudflare Pages Functions + D1, `jose` 6 (already a dependency) for the RS256 JWT, React panel (Vite), `node --test` on `node:sqlite`, `tests/e2e.cjs` with a local fake Drive.

**Spec:** `docs/superpowers/specs/2026-11-05-hampton-app-drive-queue-design.md` (D1–D14, C1–C13). Read it first.

## Global Constraints

- The GitHub repo is public: no key, folder id, email or document text from the real Drive in code, tests, fixtures or docs. Test folder ids are made up (`F_HOUSE`, `F_EDITED`…).
- Secret name `GOOGLE_SERVICE_ACCOUNT` (the JSON key, `wrangler pages secret put`); scope exactly `https://www.googleapis.com/auth/drive.readonly`. Local dev and e2e read `DRIVE_API` (default `https://www.googleapis.com`) and `DRIVE_TOKEN_URL` (default `https://oauth2.googleapis.com/token`) so a fake can stand in.
- Records: a folder whose trimmed name matches `/^records$/i`, at any depth, is never listed, opened or served (D7).
- Edited: a direct subfolder whose name matches `/edit(ed|adas)/i` (D5). Several: the one with the latest `modifiedTime`, unless Hermes's `photos_folder` names another Edited subfolder of the same folder (D6, C3).
- Photo types: jpg, jpeg, png, webp; heic/heif through Drive's `thumbnailLink` at `=s1600`, else skipped with a reason (C4). Max 100 photos (PUB-01 limit).
- Documents: up to 30 per folder, 20 MB each; Google Docs exported `text/plain`, Sheets `text/csv`, Slides `text/plain`; everything else served as stored (C12). Images and videos are never documents.
- Note: max 2,000 characters (C9). Link: `drive.google.com/.../folders/<id>` with or without `/u/N/` and query, or a bare id `^[A-Za-z0-9_-]{10,100}$` (C10).
- Hermes timing: a claim goes stale after 5 minutes; the third stale attempt fails (C6, 15 minutes). Queued rows never expire.
- Approve minimum (D11): title, operation, a price (`sale_price`/`rent`/`premium` for the operation, or `price_text`), parish, at least one public photo, description.
- Statuses: `queued`, `working`, `ready`, `review`, `published`, `discarded`, `failed` (C5). Panel words: Waiting for Hermes, Ready to review, In review, Published, Discarded, Failed.
- Every SQL value goes through `bind`; every new admin route is session + same origin (`true` in the route table), like the rest.
- DESIGN.md (panel, Operate mode): `.card` white, border line, radius 14px, padding 24px; buttons pill `10px 20px`, `.sm` for row actions, ghost and danger as in `styles.css`; labels wrap inputs (12px stone); errors with `aria-invalid` + `<small class="err">` linked by `aria-describedby`; badges in outline (`attention` for Ready to review, `ok` for Published); table `table.list` with `data-label` per cell for 390 px; spacing only 4/8/12/16/24/32/48; breakpoint 760; no new colours; status text in an `aria-live="polite"` region; touch targets 44px on touch.

## Review Focus

1. Someone pastes a folder the service account can't see (not shared, or a personal folder) → a clear 400 in the form («The app can't open this folder. Check the link, or ask Franco to share the Properties folder with the app.»), no row created. Test in Task 3.
2. Hermes asks for a file id that isn't in its import's document list (a photo, a Records file, another import's file) → 404, nothing fetched from Drive. Test in Task 4.
3. The browser asks the photo proxy for a file id that isn't in the import's photo list → 404. Test in Task 3.
4. Two people press «Review» on the same row at once → only one draft: `POST /admin/queue/:id/listing` moves `ready → review` once; the second gets 409 and opens the first one's listing. Test in Task 3; the UI follows the 409 (Task 6).
5. A listing linked to an open import is published through the plain Publish route → 409 «Use Approve and publish in the queue» (C8). Test in Task 5.

---

### Task 1: Migration and the Drive client

**Files:**
- Create: `migrations/0020_drive_imports.sql`
- Create: `server/drive.js`
- Test: `tests/server/drive.test.mjs`, `tests/server/schema.test.mjs` (add the table)

**Interfaces:**
- Produces (SQL): table `drive_imports(id INTEGER PRIMARY KEY, folder_id TEXT NOT NULL, folder_name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 2000), status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','working','ready','review','published','discarded','failed')), attempts INTEGER NOT NULL DEFAULT 0, error TEXT, documents TEXT CHECK (documents IS NULL OR json_valid(documents)), result TEXT CHECK (result IS NULL OR json_valid(result)), listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL, requested_by TEXT NOT NULL, created_at TEXT NOT NULL, claimed_at TEXT, ready_at TEXT, decided_at TEXT, decided_by TEXT)`; index `drive_imports_todo(created_at) WHERE status IN ('queued','working')`; `ALTER TABLE listings ADD COLUMN drive_folder_id TEXT` with index `listings_drive_folder(drive_folder_id) WHERE drive_folder_id IS NOT NULL`.
- Produces (JS, `server/drive.js`):
  - `folderIdFrom(text: string) -> string | null`
  - `isRecords(name: string) -> boolean`, `isEdited(name: string) -> boolean`
  - `driveFetch(env, path: string, init?) -> Promise<Response>` — gets and caches (module scope, until 60 s before expiry) an access token from a JWT signed with `jose` `SignJWT` + `importPKCS8(key.private_key, "RS256")`, `iss`/`sub` = `client_email`, `aud` = token URL, scope above; throws `HttpError(503, "Google Drive isn't set up yet")` when the secret is missing.
  - `folderInfo(env, id) -> Promise<{ id, name } | null>` — null on 404/403 or a non-folder.
  - `walkFolder(env, id) -> Promise<{ documents: Doc[], editedFolders: {id,name,modifiedTime}[], skipped: string[] }>` with `Doc = { id, name, path, mimeType, size, modifiedTime }`; recursive (depth ≤ 5), skips Records, does not descend into Edited folders or list images/videos as documents, caps at 30 documents and 20 MB (the rest into `skipped` with the reason).
  - `photosIn(env, folderId) -> Promise<{ photos: {id,name,mimeType,heic:boolean}[], skipped: string[] }>` — direct files only, sorted by name like `byName` in `server/listing-import.js`.
  - `fileResponse(env, doc) -> Promise<Response>` — `files/<id>?alt=media`, or `files/<id>/export?mimeType=…` for Google types (map above); HEIC photo → the `thumbnailLink` with `=s1600`.

- [ ] **Step 1: Write the failing tests** in `tests/server/drive.test.mjs` with an injected fake: `env.DRIVE_API`/`env.DRIVE_TOKEN_URL` point to `http://drive.test`, and `globalThis.fetch` is replaced by a function that answers from an in-memory tree (`F_HOUSE` → `Records` (with `secret.pdf`), `Edited` (`b.png`, `a.jpg`, `c.heic`), `Edited Photos` (older), `Photos (raw)`, `Old` (with `old.pdf`), `Details.docx`, `Notes` (Google Doc), `tour.mp4`). The fake records every URL it was asked for. The key is generated in the test with `crypto.subtle.generateKey` (RSASSA-PKCS1-v1_5, 2048) and exported to PKCS8 PEM. Assertions:
  - `folderIdFrom` accepts `https://drive.google.com/drive/u/5/folders/F_HOUSE12345?usp=sharing`, `https://drive.google.com/drive/folders/F_HOUSE12345`, `F_HOUSE12345`; returns null for `https://example.com/folders/F_HOUSE12345`, `drive.google.com/file/d/X/view`, `""`.
  - `isEdited`: true for «Edited», «edited photos», «Fotos editadas», «EDITADAS 2025»; false for «Photos», «Records». `isRecords`: true for « records », false for «Records 2».
  - `walkFolder(env, "F_HOUSE")`: documents = `Details.docx`, `Notes`, `Old/old.pdf` (paths), no `secret.pdf`, no image or `tour.mp4`; the fake was never asked for any URL containing the Records folder id; `editedFolders` has both Edited folders.
  - 31 documents → 30 kept and one `skipped` line containing «more than 30 documents»; a 21 MB file → skipped with «larger than 20 MB».
  - `photosIn(env, "F_EDITED")` → `a.jpg`, `b.png`, `c.heic` in that order, `c.heic` with `heic: true`.
  - `fileResponse` for the Google Doc calls `/export?mimeType=text%2Fplain`.
  - The token request carries a JWT whose payload has `scope` = `https://www.googleapis.com/auth/drive.readonly`; a second call within the hour does not ask for a new token.
  - No `GOOGLE_SERVICE_ACCOUNT` → `folderInfo` rejects with status 503.
- [ ] **Step 2: Run** `node --test tests/server/drive.test.mjs` → FAIL (module not found).
- [ ] **Step 3: Write the migration and `server/drive.js`** with the interfaces above. Comments say why (D5, D7, C1, C12), like the rest of `server/`.
- [ ] **Step 4: Run** `node --test tests/server/drive.test.mjs tests/server/schema.test.mjs` → PASS, then `npm test` → all pass.

### Task 2: Choosing the photos

**Files:**
- Modify: `server/drive.js`
- Test: `tests/server/drive.test.mjs`

**Interfaces:**
- Produces: `chooseEdited(editedFolders, wanted: string | null) -> { folder: {id,name} | null, warning: string | null }`.

- [ ] **Step 1: Failing tests:** none → `{ folder: null, warning: 'No "Edited" folder: the draft will have no photos.' }`; one → it, no warning; two → the latest `modifiedTime` with `warning: 'Several "Edited" folders: used "Edited" (the most recent).'`; `wanted` matching one by name (case-insensitive, trimmed) → that one, no warning; `wanted` matching none → the latest, with the several-folders warning.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement. **Step 4:** run → PASS.

### Task 3: The panel's queue routes

**Files:**
- Create: `server/routes/queue.js` (wired in `server/api.js` next to `hermesRoutes`)
- Test: `tests/server/queue.test.mjs` (fake Drive helper from Task 1 moved to `tests/server/fake-drive.mjs`)

**Interfaces:**
- Consumes: Task 1 and 2.
- Produces (all session + same origin):
  - `POST /admin/queue {link, note}` → 201 `{ item, duplicate: { listing_id } | { import_id } | null }`; 400 for a bad link («Paste the link of a Google Drive folder.»), a note over 2,000, or a folder the app can't open (text in Review Focus 1).
  - `GET /admin/queue` → `{ items, hermes_at }`; items = open rows plus rows closed in the last 14 days, newest first; each `{ id, folder_name, note, status, error, requested_by, created_at, ready_at, listing_id, result }`. `hermes_at` as in `latestJob`.
  - `POST /admin/queue/:id/listing {listing_id}` → `ready → review` once, sets `drive_imports.listing_id` and `listings.drive_folder_id`; 409 with `{ listing_id }` if it was already in review (Review Focus 4).
  - `GET /admin/queue/:id/photo/:fileId` → the bytes from `fileResponse`, only if `fileId` is in `result.photos` (else 404); `cache-control: private, no-store`.
  - `POST /admin/queue/:id/retry` → `failed → queued`, attempts 0, error null.
  - `POST /admin/queue/:id/discard` → from any open status; deletes the linked listing if it is unpublished and has no sale (its media rows and R2 objects too, like `remove` in `server/routes/listings.js`; extract that body as `export async function deleteListing(env, id, admin)` and call it from both).
- Not on the drafters list (C11).

- [ ] **Step 1: Failing tests** (`makeEnv` + fake Drive): create returns 201 with `folder_name` from Drive and status `queued`; the duplicate cases (a listing with that `drive_folder_id`; an open import of that folder) still return 201 with `duplicate`; bad link, long note, unshared folder → 400 and no row; GET lists it; `listing` twice → 201 then 409 with the first `listing_id`; the photo proxy for a listed id → 200 and the fake's bytes, for any other id → 404 and the fake not called; retry only from failed (else 409); discard of a review row deletes its unpublished listing and its media rows; discard of a published listing's row → 409.
- [ ] **Step 2: Run** `node --test tests/server/queue.test.mjs` → FAIL. **Step 3:** implement. **Step 4:** `npm test` → PASS.

### Task 4: Hermes's side of the door

**Files:**
- Modify: `server/routes/hermes.js` (three more DOOR entries)
- Test: `tests/server/hermes-imports.test.mjs`

**Interfaces:**
- `POST /hermes/imports/next` → claims the oldest `queued` (or `working` claimed ≥ 5 min ago; at attempts ≥ 3 → `failed`, error «Hermes didn't finish in 15 minutes»), walks the folder, stores `documents` (the `Doc[]` list) and returns `{ import: { id, folder_name, note, documents: [{ id, name, path, mimeType, modifiedTime }], skipped } }` or `{ import: null }`. A folder that is now unreachable → `failed` with «The app can't open this folder any more».
- `GET /hermes/imports/:id/files/:fileId` → `fileResponse`, only for a `working` import whose `documents` lists that id; else 404.
- `POST /hermes/imports/:id/proposal { property_txt, sources, conflicts, photos_folder }` (body ≤ 200 KB; `property_txt` ≤ 100 KB string; `sources` object field → document name, strings ≤ 200; `conflicts` array ≤ 20 of `{ field, values: [{ value, document }] }`; `photos_folder` string ≤ 200 or null) → only from `working`; the server runs `chooseEdited` + `photosIn` and stores `result = { property_txt, sources, conflicts, photos, photos_folder: name, warnings }` (warnings: the Edited warning, photo skips, `skipped` from the walk, `readPropertyText(property_txt).warnings`), status `ready`, `ready_at`.
- Hermes gets no listing ids, no emails and never `requested_by`.

- [ ] **Step 1: Failing tests:** next with nothing queued → `{import:null}`; next claims and returns the documents without the Records file; a second next does not get the same import; files for a listed id → 200, for a photo id or an unknown id → 404 with the fake not called; proposal from `queued` → 409; a valid proposal → `ready` with `photos` from the chosen Edited folder and the warnings; oversize `property_txt` → 400; three stale claims → `failed` with the message; every route without the key → 401.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement. **Step 4:** `npm test` → PASS.

### Task 5: Approve and publish

**Files:**
- Modify: `server/routes/queue.js`, `server/routes/listings.js` (`setState`, `detail`)
- Test: `tests/server/queue.test.mjs`

**Interfaces:**
- `POST /admin/queue/:id/approve` → from `review` only; loads the listing; if the D11 minimum fails → 400 `{ error: "Complete before publishing", missing: [...] }` with the words `Title`, `Sale or rent`, `Price`, `Parish`, `A photo`, `Description`; else the same patch as `setState("publish")` (`published = 1`, `confirmed_at`), status `published`, `decided_at/by`.
- `GET /admin/listings/:id` adds `queue: { id, status } | null` (the open import linked to it).
- `POST /admin/listings/:id/publish` on a listing linked to an import in `review` → 409 «Use Approve and publish in the queue» (C8).

- [ ] **Step 1: Failing tests:** approve with no photo → 400 and `missing` contains «A photo»; with everything → 200, listing published, row `published`; plain publish on a review listing → 409; detail returns `queue`.
- [ ] **Step 2–4:** FAIL → implement → `npm test` PASS.

### Task 6: Properties Queue in the panel

**Files:**
- Create: `admin/src/Queue.jsx`, `admin/src/createDraft.js`
- Modify: `admin/src/App.jsx` (route `#/queue`, nav link «Properties Queue» after Listings, with the number of `ready` rows like the other counts), `admin/src/NewProperty.jsx` (use `createDraft`), `admin/src/ListingEditor.jsx` («Approve and publish» instead of Publish when `listing.queue?.status === "review"`), `admin/src/styles.css`
- Test: `tests/e2e.cjs` (new step `queue`), fake Drive in `tests/fake-drive.cjs` started by the e2e and pointed to by `.dev.vars.e2e`

**Interfaces:**
- `createDraft(body, photos: {file: Blob, name, kind, label}[], { onProgress, alive }) -> Promise<{ id, uploaded, failed: string[], coverFailed }>` — the body of `submit` in `NewProperty.jsx` from the POST to the cover, moved as is.
- Queue page: a `.card` form (Link, Note with a counter to 2,000, «Send to Hermes»); the duplicate answer shows «This folder was already imported as HE-R0xx» with a link, without undoing the send. Below, `table.list`: Property, Sent by, Sent, Status, action. Actions: Ready to review → «Review», which shows the proposal (fields read, sources, conflicts in a `.warn`, warnings, photo thumbnails with a «Leave out» checkbox each and the cover marked) and «Create draft»: `readPropertyText(result.property_txt)` → `draftBody(fields, five)` with the title = `folder_name` (D14) → `POST /admin/queue/:id/listing` reserved first (409 → open that listing) → `createDraft` with each photo fetched from the proxy as a Blob → `#/p/<id>`. In review → «Open» (editor). Failed → error text + «Try again». Any open row → «Discard» (confirm dialog). Waiting for Hermes shows «Hermes last checked in <time>» and, past 30 minutes, «Hermes isn't answering» (`hermes_at`).
- Editor: when in review, the action bar's Publish becomes «Approve and publish»; a 400 lists `missing` in the «Missing from this listing» box.

- [ ] **Step 1: Write the e2e step** (seed a `drive_imports` row in `ready` with a `result` whose two photos the fake Drive serves): open #/queue at 1280, Review, untick one photo, Create draft, editor opens with one photo; «Approve and publish» → the listing is published and the queue row says Published; repeat the list check at 390 with no side scroll. Run `node tests/e2e.cjs queue` → FAIL.
- [ ] **Step 2: Implement** the files above.
- [ ] **Step 3:** `npm test`, `npm run build`, the e2e step and the full e2e (recipe in its header) → «e2e OK».
- [ ] **Step 4: Walkthrough** (local, never production) at 1280 and 390 with screenshots: form errors, a Failed row, the Hermes-silent message, keyboard order and focus ring.

### Task 7: Retention, docs and the Hermes hand-off

**Files:**
- Modify: `server/retention.js` (delete `drive_imports` rows closed — published, discarded, failed — 90 days after `COALESCE(decided_at, claimed_at, created_at)`, never open ones), `tests/server/retention.test.mjs`
- Modify: `docs/roadmap/checklist-hampton-app.html` (PUB-21 parcial: what's done, «falta» = the Hermes instruction, PRE-32, Luis's setup; date), `docs/roadmap/ESTADO.md`, `docs/roadmap/2026-10-23-arquitectura-hampton-app.md` (§5.10 one line; §6.6 H9 widened by D2), `docs/superpowers/specs/2026-10-31-hampton-app-hermes-design.md` (H9 note pointing to this spec)
- Create: `docs/superpowers/plans/2026-11-05-hampton-app-drive-queue-ledger.md`

- [ ] **Step 1:** failing retention test (a published row 91 days old goes, a `review` row 200 days old stays) → implement → PASS.
- [ ] **Step 2:** docs as listed; no ids, emails or document text.
- [ ] **Step 3:** independent review (bugs, security and privacy, DESIGN.md, code of more), fix, one commit on main.
- [ ] **Step 4:** Luis, one step at a time: create the service account and its key; `wrangler pages secret put GOOGLE_SERVICE_ACCOUNT`; share the Properties folder (Franco's account) as Viewer with the service account's email; apply migration 0020 remotely; push.
- [ ] **Step 5 (VPS, `/root/hampton-hermes`, waits for PRE-32):** add `POST /imports/next`, `GET /imports/:id/files/:id` and `POST /imports/:id/proposal` to the key proxy's allowlist (`custodio/solo-lectura.mjs` + its test), and Hermes's instruction: read each document (docx/pdf to text on the VPS), follow the note, fill `property.txt` (title = folder name, D14), write summary and description in English from facts only (D4), never people's names, phones, emails or addresses (D2), give sources and conflicts (D12). Push only with Luis's «sí».
