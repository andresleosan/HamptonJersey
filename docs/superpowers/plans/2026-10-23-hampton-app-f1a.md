# Hampton App F1-A: matching con el inventario propio · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada aplicante reciba al momento las casas del catálogo de Hampton que cumplen lo imprescindible, con su lista Meets/Fails/Unknown, y que el equipo las revise rápido (pestaña Matches, pantalla Review, aviso Matched).

**Architecture:** Igual que F0. Migración 0009 (`matches`, columnas de ficha `parish`/`matchable`/`feat_*`, `applicants.first_reviewed_at`, `notifications` con categoría `matched`). Rasgos de ficha precalculados al guardar (`server/listing-features.js`), evaluación pura (`server/matching.js`) y recálculo con escritura en un batch (`server/match-store.js`), enganchado a los guardados de aplicantes y fichas.

**Tech Stack:** Pages Functions + D1 · React 19 + Vite (panel) · Node 24 `node:test` + `node:sqlite`.

**Spec:** `docs/superpowers/specs/2026-10-23-hampton-app-f1a-design.md` (decisiones B1–B15; mandan). Base de F0: `docs/superpowers/specs/2026-10-23-hampton-app-f0-design.md`. Diseño: `DESIGN.md`.

## Global Constraints

- Las Global Constraints del plan F0 (`docs/superpowers/plans/2026-10-23-hampton-app-f0.md`) siguen valiendo íntegras (inglés en la UI, un solo rol, NULL nunca 0, consultas con parámetros, sin `dangerouslySetInnerHTML`, sin dependencias nuevas, nada «para después», `main` y commit por tarea, push solo con el sí de Luis y nunca `--remote` desde la sesión).
- «Búsqueda activa» = `archived_at IS NULL AND stage NOT IN ('lost','completed')` (regla de F0).
- Coincidencia mínima: puntuación ≥ 35; como mucho 25 `found` por aplicante (B11).
- Las listas de parroquias, tipos, etc. salen de `OPTIONS` en `server/applicants.js`; no se duplican.
- Cada petición debe caber en el plan gratuito de Workers (10 ms de CPU): nada de leer descripciones durante el matching (B10); el trabajo masivo va por tandas (B12).

## Review Focus

1. **Alquiler anual frente a presupuesto mensual** (`rent_period='year'`): se compara la renta ÷ 12 → prueba en Tarea 3.
2. **Parroquia corregida a mano y luego «Recalculate all»**: el valor del equipo se respeta → prueba en Tarea 6.
3. **El aplicante cambia requisitos y una coincidencia `shortlisted` deja de cumplir**: sigue en Shortlisted con el Fails visible → prueba en Tarea 4.
4. **Una ficha se archiva (vendida)**: sus `found` desaparecen de todos los aplicantes y deja de proponerse → prueba en Tarea 5.
5. **Dos personas revisan la misma coincidencia a la vez** (dos pantallas de Review): la segunda recibe 409 en vez de pisar → prueba en Tarea 6.

---

### Task 1: Migración 0009

**Files:**
- Create: `migrations/0009_matches.sql`
- Test: `tests/server/schema.test.mjs` (añadir)

**Interfaces:**
- Produces:
  - `listings` + `parish TEXT CHECK (parish IS NULL OR parish IN (<las 12 de OPTIONS.parishes>))`, `matchable INTEGER NOT NULL DEFAULT 0 CHECK (matchable IN (0,1))`, `feat_pets TEXT CHECK (… IN ('yes','no'))`, `feat_parking INTEGER CHECK (… >= 0)`, `feat_furnished TEXT CHECK (… IN ('yes','no'))`, `feat_outdoor TEXT` (JSON lista de `garden|terrace|balcony` o NULL), `feat_type TEXT CHECK (… IN ('flat','house','cottage','studio'))`, `feat_evidence TEXT` (JSON `{pets, parking, furnished, outdoor, type}` → frase ≤120), `features_at TEXT` (cuándo se calcularon; NULL = pendiente).
  - `UPDATE listings SET matchable = 1 WHERE published = 1 OR id BETWEEN 'HE-R028' AND 'HE-R285'` (B9).
  - `applicants` + `first_reviewed_at TEXT`.
  - `matches` según spec §3 (AUTOINCREMENT, FKs con `ON DELETE CASCADE`, CHECKs de `status` y `reject_reason`, `reject_reason` solo con `rejected`, `UNIQUE(applicant_id, listing_id)`, índices `(status, applicant_id)` y `(listing_id)`).
  - `notifications` reconstruida con `category IN ('new_applicant','viewing','matched')`, mismas columnas, filas e índices (`notifications_open`, `notifications_created`, `notifications_event`).

- [ ] **Step 1: Write the failing tests**:
  - `test("0009: matches refuse bad status, reasons without rejection and duplicate pairs")`.
  - `test("0009: listings get parish/matchable/feature columns with their CHECKs")`: parroquia inventada → `/CHECK/`.
  - `test("0009: matchable is set for published listings and the agency import range only")`: crea la base a mano (0001–0008), siembra `HE-R003` publicada, `HE-R010` archivada, `HE-R100` archivada, `HE-R300` archivada; aplica 0009 → `matchable` = 1, 0, 1, 0.
  - `test("0009: notifications rebuilt keep rows, indexes and accept matched")`: con una fila previa; tras 0009 sigue, `category='matched'` se acepta, y `PRAGMA index_list(notifications)` lista los tres índices.
- [ ] **Step 2: Run** `node --test tests/server/schema.test.mjs` → FAIL.
- [ ] **Step 3: Write** la migración (rebuild: `CREATE TABLE notifications_new …; INSERT INTO notifications_new SELECT …; DROP TABLE notifications; ALTER TABLE notifications_new RENAME TO notifications;` + índices). Comentario de una línea por bloque.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Add matches, listing features and the matched notice category`.

### Task 2: Rasgos y parroquia de una ficha

**Files:**
- Create: `server/listing-features.js`
- Test: `tests/server/listing-features.test.mjs`

**Interfaces:**
- Produces: `extractFeatures(listing) → { parish, feat_pets, feat_parking, feat_furnished, feat_outdoor, feat_type, feat_evidence }` (pura; `listing` = fila de `listings` con `specs` como texto JSON; `feat_outdoor` y `feat_evidence` como texto JSON o NULL; desconocido = NULL). `parseParish(text) → string|null`.
- Reglas:
  - Parroquia desde `location` y, si no, `road_name`: nombre con o sin «St»/«St.»/«Saint», sin mayúsculas; un nombre seguido de `road|rd|street|st|hill|lane|avenue|close` es una calle y no cuenta; localidades conocidas: St Aubin, Red Houses, Les Quennevais → St Brelade; First Tower, Havre des Pas → St Helier; Millbrook, Bel Royal → St Lawrence; Five Oaks → St Saviour. Dos parroquias distintas o ninguna → NULL.
  - Texto analizado: etiquetas y valores de `specs` + `summary` + `description`. Mascotas: «no pets», «pets not (permitted|allowed|accepted)» → `no`; «pets (considered|allowed|welcome)», «pet friendly» → `yes`. Parking: «parking for N», «N parking spaces», «N-car garage», «double garage» (2) → N; «garage», «parking», «parking space» sin número → 1; «no parking» → 0. Amueblado: «unfurnished» → `no`; «furnished» (sin «un») → `yes`; «part furnished» → NULL. Exterior: garden / terrace / balcony (patio cuenta como terrace). Tipo: desde `property_type` y título (apartment/flat/maisonette → flat; house/bungalow/villa/townhouse/farmhouse/chateau → house; cottage → cottage; studio → studio).
  - Evidencia: la frase coincidente recortada a 120 caracteres.

- [ ] **Step 1: Write the failing tests**: `test("parish from location, aliases and localities")` (`"St. Helier, Jersey"` → St Helier; `"Saint Brelade"` → St Brelade; `"St Aubin"` → St Brelade; `"Grouville"` → Grouville; `"St Saviours Road, St Helier"` → St Helier; `"St Helier / St Clement"` → null; `"London"` → null). `test("pets, parking, furnished, outdoor and type from text")` con un caso por patrón de arriba y su evidencia. `test("nothing said means null, never no")`.
- [ ] **Step 2: Run** `node --test tests/server/listing-features.test.mjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Read parish and features from a listing's text`.

### Task 3: Evaluación aplicante × ficha

**Files:**
- Create: `server/matching.js`
- Test: `tests/server/matching.test.mjs`

**Interfaces:**
- Consumes: filas de `applicants` (listas como JSON texto, como en la base) y de `listings` con columnas `feat_*` y `parish`.
- Produces: `evaluate(applicant, listing) → { pass: boolean, score: number, checks: Check[] }` con `Check = { key, result: 'meets'|'fails'|'unknown', evidence: string|null }`, `key` ∈ `budget|bedrooms|bathrooms|area|pets|parking|furnished|outdoor|type`, en ese orden y solo los que aplican (pets si tiene mascotas; parking si pidió plazas; furnished si alquiler y lo indicó; outdoor si pidió; type si pidió). `MIN_SCORE = 35`, `MAX_FOUND = 25`. `monthlyRent(listing) → number|null`.
- Reglas: spec §4 + B11 tal cual (filtros, puntuación con sus pesos, suelo del 75 % de `budget_min`).

- [ ] **Step 1: Write the failing tests**:
  - `test("hard filters")`: operación cruzada → `pass:false`; precio sobre `budget_stretch` → false; sin stretch, sobre `budget_max` → false; dormitorios por debajo → false; parroquia excluida → false; perro + `feat_pets='no'` → false; precio < 0,75 × `budget_min` → false.
  - `test("unknown never excludes")`: ficha sin precio, dormitorios, parroquia ni rasgos → `pass:true` y esos checks `unknown`.
  - `test("yearly rent is compared per month")`: renta 24 000 al año con `budget_max` 2 100 → pasa (2 000/mes) (Review Focus 1).
  - `test("score follows the spec weights")`: un caso que da exactamente 100 (parroquia deseada, ideales, precio en banda, exterior/tipo/amueblado meets, publicada) y uno exacto intermedio calculado a mano en el test.
  - `test("price near the top scores higher than far below")`: mismo aplicante, 950 k frente a 300 k con tope 1 M → la de 950 k puntúa más.
- [ ] **Step 2: Run** `node --test tests/server/matching.test.mjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Evaluate an applicant against a listing`.

### Task 4: Recálculo y escritura

**Files:**
- Create: `server/match-store.js`
- Test: `tests/server/match-store.test.mjs`

**Interfaces:**
- Consumes: `evaluate`, `MIN_SCORE`, `MAX_FOUND` (Tarea 3); `logEvent` (`server/events.js`).
- Produces:
  - `CANDIDATES_SQL` (B2 admite archivadas; la condición exacta es): `matchable = 1 AND use = 'residential' AND availability IN ('for_sale','to_let','lease') AND operation IN ('sale','rent') AND (country IS NULL OR country = 'Jersey')`, prefiltrando en SQL operación, precio (con ÷12 para anuales), dormitorios, baños y parroquia excluida.
  - `recomputeForApplicant(env, applicantId, actor) → Promise<{ created: number }>`: aplica el algoritmo de spec §4 «Recálculo» (aplicante no activo → borra sus `found`; inserta/actualiza/borra según estado; respeta `MAX_FOUND` por puntuación; nunca toca `rejected`; refresca `checks` de `shortlisted`). Si `created > 0`: evento `applicant.matched` `{new: created}` y aviso B14 (actualiza el abierto o crea uno: categoría `matched`, `action_required 1`, título `"<N> new matches for <name>"` con N = total de `found`, singular «1 new match»). Todo en un batch.
  - `recomputeForListing(env, listingId, actor) → Promise<void>`: recalcula la pareja de esa ficha con cada aplicante activo (si la ficha dejó de ser candidata, borra sus `found`); un batch; comentario `ponytail:` con el techo.
  - `closeMatchedNoticeIfEmpty(env, applicantId, by) → D1PreparedStatement` (resuelve el aviso `matched` abierto si quedan 0 `found`).

- [ ] **Step 1: Write the failing tests** (sembrando fichas con `feat_*` ya puestos):
  - `test("first run creates found matches, one event and one notice")`.
  - `test("second run adds new ones and updates the same notice title")`.
  - `test("rejected pairs are never re-proposed")`.
  - `test("a shortlisted match that stops passing stays, with the failing check")` (Review Focus 3).
  - `test("found matches that stop passing are removed; notice closes at zero found")`.
  - `test("archived, lost or completed applicants keep no found matches")`.
  - `test("only the 25 best found are kept")`.
  - `test("recomputeForListing updates the pair for every active applicant")`.
- [ ] **Step 2: Run** `node --test tests/server/match-store.test.mjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `Recompute and store matches with their Inbox notice`.

### Task 5: Enganches en aplicantes, fichas y alta pública

**Files:**
- Modify: `server/routes/applicants.js` (`create`, `update`, `setArchived`), `server/routes/public.js` (`createApplicant`, solo en alta nueva), `server/routes/listings.js` (`create`, `update`, `setState`, `list`, `detail`), `server/listing.js` (`parish`, `matchable` editables)
- Test: `tests/server/match-hooks.test.mjs`

**Interfaces:**
- Consumes: Tareas 2 y 4.
- Produces:
  - Tras guardar con éxito un aplicante (alta panel o web, cambio de requisitos o etapa, archivar, restaurar) → `recomputeForApplicant`.
  - Fichas: `parish` (una de las 12 o null) y `matchable` (0/1) editables. Al crear o guardar: se calculan los rasgos con `extractFeatures` (y `features_at`); la parroquia extraída solo se escribe si la ficha no tiene parroquia y la petición no la trae. Después → `recomputeForListing`. Archivar pone `matchable = 0` y recalcula; restaurar recalcula.
  - `GET /admin/listings` añade `parish`, `matchable` y acepta `?parish=`; `GET /admin/listings/:id` añade `matched_applicants: [{ match_id, applicant_id, name, operation, status, score }]`.
- [ ] **Step 1: Write the failing tests**: alta de aplicante en el panel → `matches` creadas en la misma petición; cambiar `bedrooms_min` las ajusta; subir el precio de una ficha por encima del presupuesto quita su `found`; archivar una ficha → sus `found` desaparecen y `matchable = 0` (Review Focus 4); parroquia puesta a mano no se pisa al guardar otra cosa; `matched_applicants` en el detalle; filtro `?parish=`; alta pública nueva crea coincidencias, duplicada no.
- [ ] **Step 2: Run** `node --test tests/server/match-hooks.test.mjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `Recompute matches whenever an applicant or a listing is saved`.

### Task 6: API de revisión, cola y recálculo total

**Files:**
- Create: `server/routes/matches.js`
- Modify: `server/api.js`, `server/routes/applicants.js` (`list`, `detail`), `server/routes/notifications.js` (categoría `matched`, contador, enlace)
- Test: `tests/server/matches.test.mjs`

**Interfaces:**
- Produces:
  - `PUT /admin/matches/:id {status, reject_reason?, from}`: `from` es el estado que el cliente veía; si no coincide con el actual → 409 `"Someone else reviewed this match. Reload to see it."` (Review Focus 5). Transiciones: `found → shortlisted|rejected`, `shortlisted|rejected → found` (Undo). Fija `reviewed_by/at`; en la primera revisión del aplicante fija `applicants.first_reviewed_at` si es NULL; evento `match.reviewed` `{listing_id, from, to, reason}`; `closeMatchedNoticeIfEmpty`. Todo en un batch.
  - `GET /admin/review?after=<matchId>` → `{ match, applicant: {id,name,operation,…requisitos}, listing: {…tarjeta}, remaining }`: la siguiente `found` en orden (aplicante con `created_at` más antiguo, luego `score` DESC, luego id), saltando hasta pasar `after` en ese orden; `{ match: null, remaining: 0 }` si no hay.
  - `POST /admin/matches/recalculate {phase: 'listings'|'applicants', after?}` → procesa 50: en `listings` calcula rasgos y parroquia (sin pisar parroquia existente) de 50 fichas; en `applicants` llama `recomputeForApplicant` para 50 aplicantes activos. Devuelve `{ phase, next: <id>|null }` (`next:null` en `listings` → el cliente sigue con `applicants`).
  - `GET /admin/applicants` añade `queue` (B13), `found`, `shortlisted`, filtro `?queue=`; `GET /admin/applicants/:id` añade `matches: [{ id, status, score, checks, reject_reason, reviewed_at, listing: { id, title, operation, availability, price_text, sale_price, rent, rent_period, currency, parish, bedrooms, bathrooms, cover_thumb, published, archived_at } }]`.
  - Notificaciones: `matched` en `CATEGORIES` y `counts`; `link` = `#/applicants/<id>/matches`. `GET /admin/notifications/counts` añade `review` (total `found` de aplicantes activos) para la barra.
- [ ] **Step 1: Write the failing tests**: revisar fija estados, evento y `first_reviewed_at` (no se borra con Undo); `from` obsoleto → 409; transición no permitida → 400; el aviso se cierra al revisar la última `found`; orden de `/review` y `after`; `recalculate` por tandas recorre fichas y luego aplicantes y no pisa una parroquia puesta a mano (Review Focus 2); `queue` con su prioridad en los cuatro casos; `matches` en el detalle; enlace y contador `matched`.
- [ ] **Step 2: Run** `node --test tests/server/matches.test.mjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `Add match review, the review queue and a full recalculation`.

### Task 7: Panel: pestaña Matches, columnas Queue/Matches y pestaña Matched

**Files:**
- Create: `admin/src/MatchCard.jsx`
- Modify: `admin/src/ApplicantDetail.jsx` (pestaña `matches`, ruta `#/applicants/<id>/matches`), `admin/src/Applicants.jsx` (columnas y filtro), `admin/src/Inbox.jsx` (pestaña Matched), `admin/src/App.jsx` (ruta), `admin/src/styles.css`

**Interfaces:**
- Produces: `MatchCard({ match, onReview, busy })`: tarjeta de spec §5 (foto `cover_thumb` con `aspect-ratio`, título, precio con periodo, parroquia, camas/baños, puntuación, checks como «Meets/Fails/Unknown» en texto con su evidencia —sin emoji, DESIGN.md—, etiqueta «Not on website» si no publicada o archivada, enlace `#/p/<id>`), botones Shortlist / Reject (motivo: Price, Area, Size, Condition, Other) / Undo según estado. La usa también la Tarea 8.
- Pestaña Matches agrupada Found / Shortlisted / Rejected con contadores y vacíos con su causa; tras revisar, el foco va a la siguiente tarjeta. Lista: columnas Queue (badge con tono DESIGN.md) y Matches («N found · M shortlisted»), filtro Queue. Inbox: pestaña Matched con su contador.
- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm run build`; en local (wrangler `.wrangler/e2e`, nunca `--remote`) a 1280×800 y 390×844 con teclado: alta de un aplicante → pestaña Matches con tarjetas y checks; Shortlist/Reject/Undo; la lista muestra Queue y Matches; el Inbox muestra el aviso en Matched y enlaza a la pestaña. Texto hostil en el título de una ficha se ve como texto.
- [ ] **Step 3: Commit** `Show matches on the applicant record, in the list and in the Inbox`.

### Task 8: Panel: pantalla Review y «Recalculate all»

**Files:**
- Create: `admin/src/Review.jsx`
- Modify: `admin/src/App.jsx` (ruta `#/review`, ítem «Review» con contador `counts.review`), `admin/src/styles.css`

**Interfaces:**
- Consumes: `MatchCard` (Tarea 7), API de la Tarea 6.
- Pantalla según DESIGN.md «Cola de revisión por teclado»: una coincidencia cada vez con el resumen del aplicante (nombre, operación, presupuesto, dormitorios, zonas) al lado; atajos A/R/S solo con el foco dentro de la región y nunca en un campo; R abre motivos 1–5, Escape cancela; mensaje `role="status"` («Shortlisted. 14 left.») con Undo hasta la siguiente acción; 409 → mensaje y recarga de la siguiente. Botón secundario «Recalculate all» con confirmación: recorre `POST /admin/matches/recalculate` hasta `next:null` en las dos fases mostrando progreso («Listings 50/312…»), y al terminar recarga la cola.
- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm run build`; en local: «Recalculate all» completa las dos fases; revisar 20 coincidencias solo con teclado en menos de 5 minutos (cronometrado en el informe); Undo; dos pestañas revisando la misma → la segunda ve el 409 y sigue.
- [ ] **Step 3: Commit** `Add the keyboard review queue and full recalculation`.

### Task 9: Panel: parroquia y aplicantes en las fichas

**Files:**
- Modify: `admin/src/ListingEditor.jsx` (selector Parish, interruptor «Offer to applicants», sección «Matched applicants»), `admin/src/Listings.jsx` (columna y filtro Parish), `admin/src/styles.css`

**Interfaces:**
- Consumes: Tarea 5 (`parish`, `matchable`, `matched_applicants`, `?parish=`).
- El selector y el interruptor entran en la barra Save/Discard existente; «Matched applicants» lista nombre (enlace a `#/applicants/<id>/matches`), operación, estado y puntuación, con vacío propio («No applicants match this listing yet.»).
- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm run build`; en local: cambiar la parroquia de una ficha y guardar actualiza «Matched applicants» y la pestaña Matches del aplicante; apagar «Offer to applicants» quita sus `found`; filtro Parish en la lista.
- [ ] **Step 3: Commit** `Edit parish and offer flag on listings and show their matched applicants`.

### Task 10: Cierre de F1-A

**Files:**
- Modify: `tests/fixtures/seed.sql` (fichas `matchable` con rasgos y parroquias variadas; aplicantes que generan coincidencias), `docs/roadmap/ESTADO.md` (fila F1: F1-A construida; F1-B pendiente de la clave de Places.je; despliegue junto con la Entrega 2)

- [ ] **Step 1:** Revisión del diff de F1-A con `security-best-practices`, `frontend-security-coder`, `web-performance-optimization`, `antislop`, `ponytail-review` y accesibilidad (DESIGN.md); una ronda de arreglos; `npm test`.
- [ ] **Step 2:** E2E en local (chrome-devtools MCP o playwright-core con `--no-sandbox`; el MCP de Playwright no arranca Chrome como root) a 1280×800 y 390×844: alta → Matches; Review con teclado; Inbox Matched; ficha → parroquia y Matched applicants; «Recalculate all»; consola limpia. `node tests/e2e.cjs` → PASS.
- [ ] **Step 3:** Commit `Close F1-A`. El despliegue va con la Entrega 2 (spec F1-A §7): migración 0009 en remoto antes del push, luego push, y Luis pulsa «Recalculate all» una vez.
