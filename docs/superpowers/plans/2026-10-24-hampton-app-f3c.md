# Hampton App F3-C: ofertas y cierre de ventas · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el equipo registre ofertas de compra, acepte una abriendo su expediente de venta con los hitos de Jersey, y vea en Sales lo parado y los honorarios en camino.

**Architecture:** Igual que F0/F1-A/F3-A/F7-A. Migración 0012 (`offers`, `sales`, `sale_milestones`). Reglas puras en `server/sales.js` (nuevo). Rutas de panel en `server/routes/sales.js` (nuevo), registradas en `server/api.js`. Cambios atómicos con `env.DB.batch` y sentencias condicionales. Pantallas `admin/src/Sales.jsx` y `admin/src/SaleDetail.jsx` (nuevas) y pequeños añadidos en `App.jsx`, `ApplicantDetail.jsx` y `ListingEditor.jsx`.

**Tech Stack:** Pages Functions + D1 · React 19 + Vite (panel) · Node 24 `node:test` + `node:sqlite` · e2e con playwright-core contra `wrangler pages dev`.

**Spec:** `docs/superpowers/specs/2026-10-24-hampton-app-f3c-design.md` (decisiones V1–V21; mandan). Bases: specs de F0, F1-A, F3-A y F7-A. Diseño: `DESIGN.md`.

## Global Constraints

- Las Global Constraints del plan F0 (`docs/superpowers/plans/2026-10-23-hampton-app-f0.md`) siguen valiendo íntegras (inglés en la UI y en los errores de la API, un solo rol, NULL nunca 0, consultas con parámetros, sin `dangerouslySetInnerHTML`, sin dependencias nuevas, nada «para después», `main` y un commit por tarea, push solo con el sí de Luis y nunca `--remote` desde la sesión).
- «Hoy» es la fecha de Jersey: `jerseyToday()` de `server/viewings.js`. «Este año» = el año de `jerseyToday()`; `closed_at` (ISO UTC) se compara con el inicio del 1 de enero de Jersey convertido a ISO UTC (como hace F7-A con `jerseyDayStart` de `server/insights.js`; se importa, no se copia).
- Nada personal en el navegador (ni `localStorage` ni `sessionStorage`). Vendedor y abogados solo viajan en las respuestas de `/admin`.
- Toda escritura de una oferta o venta va en **un solo** `env.DB.batch` junto con sus eventos (`logEvent` de `server/events.js`) y sus efectos (ficha, etapa del aplicante). Las transiciones son condicionales en SQL (`WHERE status IN (...)`, `WHERE NOT EXISTS`, `changes()`), nunca «leo y luego escribo» sin guarda.
- Los eventos de V11 usan `entity_type = 'applicant'` con el id del comprador y `data` con `offer_id`, `sale_id` (si hay) y `listing_id`. No se toca el `CHECK` de `events`.
- Los cambios automáticos de etapa escriben `applicant.stage_changed` con `data = { before: { stage }, after: { stage } }` (la forma de `diff()` en `server/routes/applicants.js`), avanzan `applicants.updated_at`/`updated_by`, llaman `touch` del contacto y, al salir de `new`, cierran su aviso `new_applicant` (`resolveNotices`). Tras cualquier batch que cambie la disponibilidad de una ficha o la etapa de un aplicante: `afterSave(recomputeForListing, …)` y/o `afterSave(recomputeForApplicant, …)` de `server/match-store.js`.
- Los cambios de `listings.availability` de V2 avanzan `listings.updated_at`/`updated_by` (un editor abierto recibe 409, no pisa).
- Cada petición cabe en 10 ms de CPU: `GET /admin/sales` es un solo `env.DB.batch` de lecturas.

## Review Focus

1. **Dos aceptaciones a la vez** sobre la misma ficha, o del mismo comprador en dos fichas: una entra y la otra recibe 409 sin cambiar nada (ni oferta, ni ficha, ni etapa, ni eventos) → prueba en Tarea 2.
2. **Caída de una venta cuya ficha el equipo cambió a mano** (p. ej. a `withdrawn`) mientras tanto: la ficha no vuelve a `for_sale` → prueba en Tarea 3.
3. **Aplicante con el formulario abierto** cuando otra persona acepta su oferta: su guardado posterior con el `updated_at` viejo recibe 409 y no devuelve la etapa a `offer` → prueba en Tarea 2.
4. **Borrar para siempre un aplicante archivado con una venta caída** (o una ficha con una venta completada): 409, nada borrado; sin ventas, el borrado sigue funcionando y se lleva sus ofertas → prueba en Tarea 3.
5. **Ofertas de respaldo**: no encienden el contador mientras la ficha tiene venta en curso, y al completar pasan a `rejected` «Property sold»; las abiertas del comprador en otras fichas, a `withdrawn` «Buyer completed elsewhere» → prueba en Tarea 3.

---

### Task 1: Migración 0012 y reglas puras

**Files:**
- Create: `migrations/0012_sales.sql`, `server/sales.js`
- Test: `tests/server/schema.test.mjs` (añadir), `tests/server/sales-rules.test.mjs` (nuevo)

**Interfaces:**
- Produces: las tres tablas de spec §3 con sus `CHECK` (estados de V4 y V7, motivos de V7, `route`, `not_needed`, importes `> 0 AND <= 100000000`, `counter_amount` no nulo solo con `countered`, `shared_fee <= fee`), claves foráneas de V16 (`offers` con `ON DELETE CASCADE` a `listings` y `applicants`; `sales` sin cascada; `sale_milestones` en cascada a `sales`), índices de spec §3 y los dos índices únicos parciales de `sales`. Comentario de una línea encima de cada tabla, como en 0008–0011.
- Produces en `server/sales.js`:
  - `MILESTONES`: array de `[key, label]` en el orden de V8 (`lawyers`, `due_diligence`, `questionnaire`, `searches`, `mortgage`, `contract`, `funds`, `passing`, `settled`).
  - `milestoneLabel(key, route) → string`: los textos de V8; `passing` = «Passing contract (Royal Court)» salvo `share_transfer` → «Completion»; `settled` = «Seller paid and Stamp Duty settled» salvo `share_transfer` → «Seller paid and LTT settled».
  - `validateOffer(body, { partial }) → { value } | { errors }` (campos `amount`, `conditions`; V12).
  - `validateSale(body) → { value } | { errors }` (todos los campos editables de V7/V3; textos ≤ 120, notas ≤ 2.000, emails con forma de email, `shared_fee ≤ fee`, `target_date` `YYYY-MM-DD`; claves ausentes = no se tocan).
  - `validateMilestone(body) → { value } | { errors }` (`planned_on`, `done_on` `YYYY-MM-DD` o null, `not_needed` booleano, `note` ≤ 300; `done_on` y `not_needed` no a la vez).
  - `isOverdue(milestone, today) → boolean` (V9) y `nextMilestone(milestones) → milestone | null` (el primero sin `done_on` ni `not_needed`).
  - `OFFER_WAITING_MS = 2 * 24 * 3600 * 1000` (V9).
- [ ] **Step 1: Write the failing tests**:
  - `test("0012: an offer refuses a zero amount, an unknown status and a counter amount without countered")`.
  - `test("0012: two in-progress sales of one listing, or of one buyer, are refused by the database")`.
  - `test("0012: deleting a listing or applicant with offers deletes the offers; with a sale it fails")`.
  - `test("milestones: share transfer renames passing and settled")`.
  - `test("validateSale: bad email, shared fee above fee and a 121-character name are field errors")`.
  - `test("isOverdue: planned yesterday and open is overdue; done, not needed or planned today is not")`.
- [ ] **Step 2: Run** `node --test tests/server/schema.test.mjs tests/server/sales-rules.test.mjs` → FAIL.
- [ ] **Step 3: Implement** la migración y `server/sales.js`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Add the offers and sales tables`.

### Task 2: Ofertas y aceptación

**Files:**
- Create: `server/routes/sales.js`
- Modify: `server/api.js` (registrar las rutas)
- Test: `tests/server/offers.test.mjs` (nuevo)

**Interfaces:**
- Consumes: Tarea 1; `logEvent`, `resolveNotices`; `afterSave`, `recomputeForListing`, `recomputeForApplicant`.
- Produces (todas `requiresAdmin`):
  - `POST /admin/offers` `{listing_id, applicant_id, amount, conditions}` → 201 `{offer}`. Comprueba V1/V17 (400 con mensaje claro si la ficha no está en venta o el aplicante no compra). Mismo batch: la oferta, `offer.recorded`, y la etapa a `offer` si estaba en `new`/`searching`/`viewing` (V6).
  - `PUT /admin/offers/:id` `{amount?, conditions?}` → `{offer}`; solo `pending`/`countered` (409 si no); evento `offer.updated` con antes/después.
  - `POST /admin/offers/:id/counter` `{counter_amount}` · `/reject` `{note?}` · `/withdraw` `{note?}` → `{offer}`; transición condicional; 409 «This offer is no longer open» si ya no lo está.
  - `POST /admin/offers/:id/accept` → 201 `{offer, sale_id}`. Un batch: `UPDATE offers … WHERE id = ? AND status IN ('pending','countered')`; `INSERT INTO sales … SELECT … WHERE changes() = 1 AND NOT EXISTS (venta en curso de la ficha o del comprador)` con `price` = `counter_amount` si era `countered`, si no `amount` (V21); las nueve filas de `sale_milestones` (`INSERT … SELECT … FROM sales WHERE id = last_insert_rowid()` o equivalente seguro); ficha a `under_offer` si no lo estaba (V2, V17); aplicante a `agreed` salvo que ya esté en `agreed`/`completed`; eventos `offer.accepted` y, si cambiaron, `listing.availability_changed` y `applicant.stage_changed`. Si la venta no se insertó, el batch debe deshacerse entero (p. ej. una sentencia final que falle por `NOT NULL`/`CHECK` cuando no existe la venta, como el `LOCK` de `server/routes/applicants.js`) y la respuesta es 409 «This listing already has a sale in progress» o «This buyer already has a sale in progress» según cuál exista. Los índices únicos de la Tarea 1 son la última barrera.
- [ ] **Step 1: Write the failing tests**:
  - `test("offer: recording moves a searching buyer to offer and writes both events")` (el embudo de F7-A ve `offer`: `reachedStages` de `server/insights.js` con la historia leída de los eventos).
  - `test("offer: a rent listing, an archived listing, a sold listing or a renting applicant is 400")`.
  - `test("offer: a paused or lost buyer keeps the stage")`.
  - `test("offer: counter, then accept uses the counter amount as the price")`.
  - `test("accept: creates the sale with nine milestones, listing under_offer, buyer agreed, in one go")`.
  - `test("accept: two accepts on one listing at once, one wins, the other is 409 and changes nothing")` (dos llamadas con `Promise.all`; comprobar filas de `offers`, `sales`, `listings.availability`, `applicants.stage` y número de eventos).
  - `test("accept: a buyer with a sale in progress elsewhere is 409")`.
  - `test("accept: the buyer's open form gets 409 after the automatic stage change")` (PUT `/admin/applicants/:id` con el `updated_at` viejo).
  - `test("accept: a listing already under_offer by hand is left as is and no availability event is written")`.
  - `test("offers: cross-origin POST is 403 and a signed-out call is 401")`.
- [ ] **Step 2: Run** `node --test tests/server/offers.test.mjs` → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Record offers and open a sale on acceptance`.

### Task 3: Expediente, cierre, contador y guardas de borrado

**Files:**
- Modify: `server/routes/sales.js`, `server/routes/notifications.js` (`openCounts`), `server/routes/listings.js` (`setState` archive, `remove`, y una ruta de ofertas de la ficha), `server/routes/applicants.js` (`setArchived` archive, `remove`, y una ruta de ofertas del aplicante)
- Test: `tests/server/sales.test.mjs` (nuevo)

**Interfaces:**
- Consumes: Tareas 1–2.
- Produces:
  - `GET /admin/sales` → `{ totals: {open_offers, in_progress, fees_in_progress, fees_completed_year}, offers: [...], sales: [...], closed: [...] }`. `offers`: abiertas, con `listing_id`, `listing_title`, `applicant_id`, `buyer_name`, `amount`, `counter_amount`, `conditions`, `status`, `buyer_position`, `mortgage_aip`, `created_at`, `updated_at`, `waiting` (V9: más de `OFFER_WAITING_MS` sin cambios y sin venta en curso de la ficha) y `backup` (la ficha tiene venta en curso). `sales`: en curso, con `listing_title`, `buyer_name`, `price`, `target_date`, `next` (`{key, label, planned_on}` o null) y `overdue`; vencidas primero. `closed`: completadas y caídas con `closed_at` en los últimos 12 meses. Honorarios netos (V3, V20).
  - `GET /admin/sales/:id` → `{ sale, milestones: [{key, label, planned_on, done_on, not_needed, note, overdue}], offers: [demás ofertas de la ficha] }`.
  - `PUT /admin/sales/:id` (campos de `validateSale` + `updated_at`; bloqueo como `LOCK` de applicants; solo `in_progress`, si no 409) → `{sale}`; evento `sale.updated` con antes/después.
  - `PUT /admin/sales/:id/milestones/:key` (`validateMilestone`; solo `in_progress`) → `{milestone}`; evento `sale.milestone`.
  - `POST /admin/sales/:id/complete` → exige `passing` hecho o `not_needed` (400 si no) y venta `in_progress` (409 si no). Batch: venta `completed` con `closed_at`; ficha a `sold` (V2); comprador a `completed`; ofertas de respaldo y del comprador según V18, cada una con su evento (`INSERT INTO events … SELECT … FROM offers WHERE …` antes del `UPDATE`); eventos `sale.completed`, `listing.availability_changed`, `applicant.stage_changed`.
  - `POST /admin/sales/:id/fall-through` `{reason, note?}` → venta `fallen_through` con `closed_at`; la oferta aceptada queda `accepted` (historia); ficha a `for_sale` **solo si** sigue en `under_offer`; comprador a `searching` **solo si** sigue en `agreed`; eventos.
  - `openCounts` añade `sales` = ventas en curso con algún hito vencido + ofertas `waiting`. `action` no cambia.
  - `GET /admin/applicants/:id/offers` → `{offers, sales}` del aplicante (con `listing_title`); `GET /admin/listings/:id/offers` → `{open, sale}` (`open` = número de ofertas abiertas; `sale` = `{id, status}` en curso o null).
  - V16: archivar ficha o aplicante con ofertas abiertas o venta en curso → 409 «Close its offers and sale first»; borrar para siempre con alguna venta → 409 «Kept for 5 years: it has a sale».
- [ ] **Step 1: Write the failing tests**:
  - `test("sales list: fees in progress and completed this year are net of the shared fee")` (una completada el 31-dic del año anterior en hora de Jersey no cuenta).
  - `test("sales list: an overdue milestone puts the sale first and counts in the nav")`.
  - `test("waiting: an offer untouched for three days counts; a backup offer on a listing with a sale does not")`.
  - `test("sale: a stale updated_at is 409 and nothing changes")`.
  - `test("complete: needs passing done or not needed")`.
  - `test("complete: listing sold, buyer completed, backup offers rejected and the buyer's other offers withdrawn, each with an event")`.
  - `test("fall through: listing back to for_sale and buyer to searching; a listing withdrawn by hand stays withdrawn")`.
  - `test("archive: a listing or applicant with an open offer or a sale in progress is 409")`.
  - `test("delete: an archived applicant with a fallen-through sale is 409; without sales it is deleted with its offers")` y lo mismo para la ficha.
- [ ] **Step 2: Run** `node --test tests/server/sales.test.mjs` → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Track sale milestones, completion and fall-throughs`.

### Task 4: Pantallas Sales y expediente

**Files:**
- Create: `admin/src/Sales.jsx`, `admin/src/SaleDetail.jsx`
- Modify: `admin/src/App.jsx` (enlace **Sales** entre Viewings e Insights con el contador `counts.sales`; rutas `#/sales` y `#/sales/<id>`), `admin/src/styles.css`
- Test: `tests/e2e.cjs` (añadir en `admin`), `tests/fixtures/seed.sql` (una ficha en venta, publicada, **solo para este flujo**, para que `HE-R001` siga `for_sale` en las demás comprobaciones; y un aplicante comprador si el seed no lo tiene)

**Interfaces:**
- Consumes: rutas de las Tareas 2–3; `show()` de `admin/src/format.js` para importes; la barra Save/Discard y `confirmLeave` de `admin/src/unsaved.js` como en `ListingEditor.jsx`/`ApplicantDetail.jsx`; la búsqueda `q` de `GET /admin/applicants` (con `operation=buy`) para elegir comprador.
- Produces: las pantallas de spec §4. Record offer como diálogo (`<dialog>` como el resto del panel) con ficha (select de fichas en venta no archivadas), comprador (búsqueda), importe y condiciones. Acciones de oferta con confirmación donde cambian la web (Accept) o cierran algo (Reject, Withdraw). Expediente a dos columnas ≥ 960 px y una en el móvil; hitos como lista con «Done» (fecha de hoy por defecto, editable), «Not needed», fecha prevista y nota; Mark completed y Fell through con confirmación. Estados vacíos y de error en cada bloque. Errores de la API mostrados junto al control que los causó.
- [ ] **Step 1: Write the failing e2e check**: Record offer (comprador del seed sobre ficha del seed) → Counter → Accept → la ficha pública `#/p/<id>` muestra «Under offer» → en el expediente, rellenar abogado del comprador y honorarios, guardar → marcar `passing` Done → Mark completed → la ficha pública muestra «Sold» y Sales muestra los honorarios en «Fees completed this year». Un hito con fecha prevista de ayer enciende el contador de la barra.
- [ ] **Step 2: Implement**.
- [ ] **Step 3: Check in the browser** a 1280×800 y 390×844 (playwright-core con `--no-sandbox`): la barra en una línea a 1280 con Sales añadido, sin scroll horizontal de página, tablas con scroll propio en móvil, diálogo usable con teclado (foco atrapado y devuelto), estados vacíos con una base sin ventas.
- [ ] **Step 4: Run** `npm test`, `npm run build` y el e2e completo → PASS / `e2e OK`.
- [ ] **Step 5: Commit** `Add the Sales screens to the panel`.

### Task 5: Ofertas en el aplicante y en la ficha

**Files:**
- Modify: `admin/src/ApplicantDetail.jsx` (pestaña **Offers** solo en búsquedas de compra; textos legibles de los eventos de V11 en Timeline), `admin/src/ListingEditor.jsx` (bloque «Offers» en fichas en venta), `admin/src/Sales.jsx` (abrir Record offer con el aplicante ya elegido desde `#/sales?applicant=<id>`), `admin/src/styles.css`
- Test: `tests/e2e.cjs` (añadir)

**Interfaces:**
- Consumes: `GET /admin/applicants/:id/offers`, `GET /admin/listings/:id/offers` (Tarea 3).
- Produces: pestaña Offers con las ofertas del aplicante (ficha, importe, estado) y su venta con enlace a `#/sales/<id>`, y el botón Record offer; bloque Offers en el editor con «N open offers» y la venta en curso con enlaces a Sales. Timeline: «Offer recorded: £X on <ficha>», «Offer accepted», «Sale completed», «Listing marked Under offer», etc.
- [ ] **Step 1: Write the failing e2e check**: desde la ficha del aplicante comprador, pestaña Offers → Record offer abre con el comprador elegido → la oferta aparece en la pestaña y en el bloque del editor de la ficha; el Timeline muestra «Offer recorded».
- [ ] **Step 2: Implement**.
- [ ] **Step 3: Check in the browser** a 1280×800 y 390×844 como en la Tarea 4.
- [ ] **Step 4: Run** `npm test`, `npm run build` y el e2e completo → PASS / `e2e OK`.
- [ ] **Step 5: Commit** `Show offers on the applicant and the listing`.

### Task 6: Cierre

**Files:**
- Modify: `docs/roadmap/ESTADO.md`

- [ ] **Step 1:** Fila F3 de ESTADO.md: F3-C construida (ofertas, expediente con hitos de Jersey, honorarios, cierre), sale con la Entrega 2; al desplegar, `0012` en remoto después de la `0011` y antes del push; pendiente con correo (F3-B/F2): resumen semanal a abogados, comprador y vendedor. Apuntar en la fila de F1 o en una nota que el borrado de 12 meses (G2) debe saltarse a los aplicantes con una venta y guardarlas 5 años (V14).
- [ ] **Step 2: Commit** `Close F3-C`.
