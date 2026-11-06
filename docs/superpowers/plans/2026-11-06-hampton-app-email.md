# AUT-17 Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the approved email foundation and NOT-10 daily team summary, disabled until the real service is configured.

**Architecture:** Pages authenticates configuration and review actions, storing immutable outgoing snapshots in D1. The existing hampton-jobs Worker claims quota and work atomically, sends through its restricted native binding, and receives replies through email(). No new public sending endpoint, VPS service, database, or AI.

**Tech Stack:** Existing JavaScript, React, SQLite/D1, Cloudflare Workers; postal-mime for bounded MIME parsing. Node test runner and existing browser test tooling.

**Spec:** ../specs/2026-11-06-hampton-app-email-design.md, approved in full by Luis on 6-Nov-2026: sender, reply address, recurring authorization, quota and retention. User expressly requested plan and implementation in this turn; no further plan approval is required. Execute inline on main under avanzar, one implementation commit after local review. No production migrations or publication.

## Global Constraints

- Sender hello@hamptonestatesjersey.com, reply address replies@app.hamptonestatesjersey.com, visible name Hampton Estates. Operational readiness false in both checked-in configurations, app settings off by default. No remote email bindings during local tests.
- 100 send attempts per Europe/Jersey day; shared atomic reservation. One immutable summary per recipient/date after 08:00 local, max 20 configured recipients. Activation after preview authorizes only this internal recurrence; no generic external composer in this delivery.
- Three attempts only for explicit recoverable pre-acceptance rejections. Timeout, unexpected error, missing messageId and stale in-flight work require review; no automatic replay. Five-minute in-flight threshold; conditional finalization by claim token prevents a late completion overwriting review/deletion.
- Content 30 days, metadata 90 days. Quota counters 90 days; non-personal hash keys for summary idempotency retained 90 days (daily scope prevents older replay); inbound dedupe tombstones 90 days, including after manual deletion. Hash-only suppressions remain until a person removes them, so content erasure does not restart sending.
- MIME max 1 MiB streamed, text max 50,000 characters, subject/header limits. No raw MIME, attachments, HTML rendering, remote content or body logging. Hash normalized address + recipient + raw bytes for dedupe; envelope address and From must agree before linking, and neither is treated as authenticated identity. Thread reference is a routing hint only.
- Use existing authentication and origin checks, bound SQL, conditional mutations, data-free events. Contact deletion removes content and cancels pending email by its address using DB triggers, covering manual and automatic deletion.
- UI copy in English. Current CSS palette (corrected against the unified tokens): ink #151515, paper #fff, mist #f4f3f0, line #e3e0da, stone #6b665e, bronze #a56b3d, bronze-dk #86542d, ok #2f6b4f, err #a32020. Tenor Sans headings 26px/400; Montserrat 14px/1.5 body. No new fonts or motion.
- Existing card: radius 14px, padding 24px; controls radius 10px, buttons pill 999px, 10px 20px (small 6px 14px). Existing focus 2px bronze/2px offset. Existing page 24px 16px 120px, max width 1240px. New gaps 8/12/16/24px; single-column under 760px; minimum panel touch target 32px (DESIGN proposal adopted for this screen).
- Native labelled controls, live status/errors, explicit loading/empty/retry states, keyboard/focus and 200% zoom at 390/1280. Use existing components/classes, text interpolation only, no dangerouslySetInnerHTML, no personal browser storage. Pagination 25 messages per page; API detail fetched on demand; no new polling on global counts. Lazy-load the Email screen.
- Skills: impeccable + antislop preserve the task-oriented existing panel (energy/rhythm/motion 1/1/1), security-best-practices + frontend-security-coder enforce the email trust boundary, web-performance-optimization keeps MIME out of the panel and bounds lists, ponytail reuses the clock/pause/D1/test infrastructure. Existing Hampton styles override generic style advice. design-taste/redesign do not apply: no new public page or visual redesign.

## Review Focus

- Concurrent ticks/claimants and daily rollover: unique work and atomic quota, even on retries and DST.
- Settings/baja/pause/deletion between preparation and send: last check suppresses delivery; cancellation cannot be overwritten by late completion.
- Provider acceptance followed by D1 failure: unknown, never automatic replay or false delivery assertion.
- Forged MIME/reference/header/duplicate and lying size: bounded parsing, literal display, no business action or unrelated thread disclosure.
- Content expiry and manual deletion: no resurrection by a duplicate; minimal metadata and dedupe remain only for their documented lifetime.

### Task 1: Settings, schema and safe summary snapshots

**Files:** create migrations/0023_email.sql, server/email.js, tests/server/email.test.mjs; modify spec and ledger. PRODUCT.md only records product context already explicit in DESIGN.md for impeccable.

**Interfaces:** email constants; readEmailSettings(env) -> normalized settings; GET /admin/email/settings -> configuration/counts; summarySnapshot(env, ts) -> subject/text; prepareSummary(env, ts) -> once per recipient/day approved rows. Settings live at app_settings.email, suppression keys are SHA-256 of normalized address.

- [x] Add failing tests: disabled settings, DST before/at 08:00 (both transitions), duplicate concurrent preparation, recipients excluded after config change, immutable snapshots, schema constraints, no default activation.
- [x] Run `node --test tests/server/email.test.mjs`; observe missing module/schema failures.
- [x] Implement migration, validated settings and plain-text/escaped HTML summary with privacy footer, daily dedupe, content and metadata lifecycle.
- [x] Run targeted tests; check query indexes and contact-delete trigger behavior.

### Task 2: Dispatch, quota, cron and retention

**Files:** server/email.js; modify server/jobs.js, server/retention.js, jobs/wrangler.toml, wrangler.toml and tests/server/jobs.test.mjs; extend email.test.mjs.

**Interfaces:** emailPass(env, ts) -> clock-safe work; dispatchEmail(env, clock = now) -> bounded queue with fresh time per claim/preflight; cleanEmail(env, ts) -> content/metadata retention. Atomic claim token ties an attempt to an outbound row and quota increment within D1.batch; final preflight reads authorization and suppression fresh.

- [x] Add failing tests: concurrent 100-attempt quota, only one send per row, retry count, pause at send boundary, missing binding/ready flag, ambiguous error, D1 post-send failure, stale/late claim, expiry and erased contact.
- [x] Implement claim+quota transaction, restricted provider payload, allowlisted error codes and conditional finalization. Share the existing daily retention claim; no personal logs and no dependency from API routes to MIME parsing.
- [x] Add binding on Worker only, readiness false on Worker and Pages; run `wrangler types` to a temporary artifact, inspect native API shape and dry-run Worker bundle. No deploy.
- [x] Run email/jobs/retention/automations tests, update assertions only where behavior intentionally expands.

### Task 3: Inbound MIME and protected review API

**Files:** create server/email-inbound.js, server/routes/email.js, tests/server/email-inbound.test.mjs, tests/server/email-admin.test.mjs; modify server/api.js, server/jobs.js, package.json/package-lock.json.

**Interfaces:** receiveEmail(message, env) -> persist or reject/throw; authenticated GET/PUT /admin/email/settings, GET /admin/email/preview, GET /admin/email?box=inbound|outbound&before=id, GET/DELETE /admin/email/inbound/:id, GET /admin/email/outbound/:id, POST /admin/email/suppressions and DELETE /admin/email/suppressions/:hash. Unknown outcomes may be acknowledged/cancelled without retry via POST /admin/email/outbound/:id/review. No arbitrary send or accept-by-reference endpoint.

- [x] Add failing tests for auth/origin, strict bodies, revision conflict, preview and explicit activation, protected pagination/details/delete, suppression and unknown review. MIME tests cover malicious text, multipart, HTML-only safe fallback, headers, duplicate tombstones, reference mismatch and persistence failure.
- [x] Install only postal-mime with scripts disabled; parse once after bounded stream read, store text and limited headers. Match only the expected recipient; never change applicant/listing/viewing state. Let persistence failure reject the promise; docs do not guarantee an automatic retry and real delivery remains an activation check.
- [x] Implement authenticated routes, hash-only suppression and audit, immutable snapshots and worker handler. No general composer.
- [x] Run all email test files and API/schema tests.

### Task 4: Panel and privacy

**Files:** create admin/src/Email.jsx and admin/src/EmailSettings.jsx; modify App.jsx, Automations.jsx, styles.css, site/apply.js, tests/e2e.cjs. Reuse existing preview/status/confirm patterns.

**Interfaces:** Settings receives overview/config with optimistic revision; saves enabled/summary/recipient preferences after preview acknowledgement. Email lists inbound/outbound with cursor pagination, detail, suppression, delete and unknown outcome acknowledgement. Reads never fetch HTML or attachments.

- [x] Add browser assertions before UI implementation, including off/unconfigured, preview+activate, revision failure preserves input, literal hostile content, empty/error/retry, pagination, suppression/delete, focus and narrow view.
- [x] Implement settings cards and lazy Email navigation, revise pause text to include internal summary, extend privacy notice for email and retention. No new legal claims.
- [x] Run browser flow against the real API with local D1 and stubbed native email binding; capture 1280/390, keyboard, 200% zoom, console/network. E2E full suite attempted per header; classify existing workshop Turnstile limitation accurately.

### Task 5: Review, checks and delivery

**Files:** update ESTADO, affected checklist items, architecture/spec/plan/ledger; private shared handoff excluded from Git.

- [x] Run npm test, npm run build, npm run check:release, Worker bundle dry-run and local browser tests. Check migration upgrade and foreign keys locally, no production operations.
- [x] Fresh independent whole-change review required by executing-plans/requesting-code-review; fix critical/important issues with regression tests and rerun affected checks; ledger accepted minors.
- [x] Analyze next task against actual scope/dependencies/tests and local model catalog. Keep Claude recommendation; record exactly one Codex recommendation.
- [x] Stage concrete authorized files, verify no private data/artifacts, commit in English. Verify clean main, record exact SHA in private handoff. No push, remote migrations or real messages.

## Correcciones de la revisión de 5d54909

Autorizadas expresamente por Luis: H1 obligatorio, H2/H3 si son viables; los tres son acotados y no cambian el diseño aprobado. Ejecución en main, un commit local, sin publicación, migración de producción ni mensajes reales.

- [x] H1 RED→GREEN: `tests/server/email-admin.test.mjs` reproduce un resultado desconocido de ayer sin revisar. `server/routes/email.js` añade `overview.pending_review` global y `review=pending` a la lista de salida con paginación. `EmailSettings.jsx` enlaza al filtro y `App.jsx`/`Email.jsx` conservan el filtro en la URL. Revisar reduce el contador y retira la fila del filtro sin reencolar ni reenviar; se mantienen los contadores diarios y la conservación aprobada de 90 días.
- [x] H2 RED→GREEN: `tests/server/email-inbound.test.mjs` reproduce asunto/cabeceras contradictorios y References como única pista. `server/email-inbound.js` resuelve conjuntamente las pistas; solo sugiere un envío único al destinatario esperado, con From y sobre coincidentes. Ninguna acción de negocio.
- [x] H3 RED→GREEN en `tests/email-e2e.mjs`: inyectar 503 en GET tras una acción exitosa sobre un detalle cargado; mantener el mensaje con aviso de desactualización y ofrecer reintento. `Email.jsx` refresca el detalle al reintentar y conserva el foco.
- [x] Validar `npm test`, build, check:release, e2e de correo y Playwright MCP 1280/390, teclado/foco/zoom, consola/red. Revisar el diff, corregir la nota histórica del menor H2, actualizar ledger/ESTADO/checklist y relevo privado; commit local y árbol limpio.

UI: reutilizar las clases y tokens vigentes, sin tokens ni fuentes nuevos: ink #151515, mist #f4f3f0, line #e3e0da, bronze #a56b3d y bronze-dk #86542d, stone #6b665e, ok #2f6b4f, err #a32020; paper #fff. Son los valores actuales de `admin/src/styles.css`, unificados desde los que describe la cabecera histórica de DESIGN.md. Se mantienen Tenor Sans 26/19 px, Montserrat 14 px/1.5, card 14 px/24 px, botones píldora, foco 2 px/offset 2 px, controles nativos etiquetados, mensajes role=status/alert y listas de 25 elementos. API autenticada/no-store, SQL parametrizado, pistas entrantes no fiables, sin HTML interpretado ni almacenamiento personal en navegador. No se añaden dependencias ni migraciones.

Ajuste detectado durante MCP: la cuadrícula de metadatos de Email heredaba un mínimo de 240 px que desbordaba con zoom 200%. Regresión de navegador RED→GREEN; una regla local de CSS limita ese mínimo al ancho disponible, conservando columnas, tokens y componentes.
