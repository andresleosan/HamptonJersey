# Hampton App F0: aplicantes y avisos · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada aplicante entre por una sola puerta (asistente público o alta en el panel), quede guardado con sus requisitos y genere un aviso en el Inbox del panel.

**Architecture:** Igual que hoy: Cloudflare Pages sirve `site/` y `/api/*` (Pages Functions → `server/`), con D1 `hampton`. Tablas nuevas `contacts`, `applicants`, `events`, `notifications` (migración 0008). Los avisos se escriben en el mismo `batch` que el cambio que los provoca. El panel React gana Inbox y Applicants; la web gana un asistente que se carga solo en `#/apply`.

**Tech Stack:** Pages Functions + D1 · React 19 + Vite (panel) · JS vanilla (web) · Node 24 `node:test` + `node:sqlite` (pruebas del servidor) · Playwright MCP (e2e).

**Spec:** `docs/superpowers/specs/2026-10-23-hampton-app-f0-design.md` (léelo entero; las decisiones A1–A16 y G1–G6 mandan). Diseño visual: `DESIGN.md`.

## Global Constraints

- Todo texto visible (web, panel, mensajes de la API) en inglés, sentence case, sin exclamaciones (D19, DESIGN.md).
- Un solo rol: cualquier admin puede todo, incluido el borrado definitivo (A8).
- Dato desconocido = `NULL`, nunca 0. Presupuestos en GBP; en alquiler, al mes.
- Borrar = archivar; el borrado definitivo solo desde Archived y escribiendo el nombre (D9, §3.4).
- El formulario público nunca modifica un contacto o aplicante existente, salvo la excepción de consentimiento del §3.3 (A10).
- La respuesta pública de alta es idéntica exista o no el contacto (§3.3).
- Consultas siempre con parámetros. En la web, todo dato a HTML pasa por `esc()` o `textContent`; en React, nada de `dangerouslySetInnerHTML`. Sin manejadores inline (`onclick=`) ni `style=` nuevos.
- Sin dependencias nuevas.
- Colores, componentes y estados: solo los de `DESIGN.md` (tras la Tarea 1, la paleta unificada).
- Nada «para después»: sin pestañas, columnas o botones que no hagan nada en F0 (anti-objetivo 4).
- Trabajo directo en `main`, un commit por tarea. **Push a `main` = despliegue a producción: solo con el sí explícito de Luis**, y la migración se aplica en remoto antes del push (`export CLOUDFLARE_ACCOUNT_ID=05fb22c155667de064b55c4e287b21d8`).
- Pruebas del servidor: `node --test tests/server/<archivo>.test.mjs`; todas: `npm test`.

## Review Focus

1. **Teléfonos escritos de mil formas** (`07797 123456`, `+44 7797 123456`, `0044 7797-123456`, `(01534) 727582`): deben normalizarse igual y encontrar el mismo contacto → prueba en Tarea 3 y en Tarea 11.
2. **Email con mayúsculas o espacios** (`Jane@Example.je `) frente a `jane@example.je`: mismo contacto → prueba en Tarea 11.
3. **Dos admins editando el mismo aplicante**: el segundo guardado no pisa al primero (409, como en listings) → prueba en Tarea 6.
4. **Presupuesto absurdo para la operación** (1.500 £ para comprar, 750.000 £/mes para alquilar): error claro en el campo, no un aplicante inservible → prueba en Tarea 3.
5. **Texto hostil en nombre o requisitos** (`<img src=x onerror=alert(1)>`) mostrado en la confirmación de la web, el Inbox, la lista y el Timeline: se ve como texto → comprobación en Tarea 10 (panel) y Tarea 12 (web).

---

## Entrega 1 · Panel

### Task 1: Paleta unificada y contrastes

**Files:**
- Modify: `site/index.html` (`:root` en la línea 15 y las reglas que usan bronce como texto, `--stone`, bordes de campos y `.agent .role`)
- Modify: `admin/src/styles.css` (`:root` en la línea 1, `.unsaved`, hovers en bronce, `.badge.archived`, bordes de campos)
- Test: `tests/design.test.js`

**Interfaces:**
- Produces: los mismos tokens en las dos apps: `--ink #151515`, `--paper #ffffff`, `--mist #f4f3f0`, `--line #e3e0da`, `--stone #6b665e`, `--bronze #a56b3d`, `--bronze-dk #86542d`, `--ok #2f6b4f`, `--err #a32020`, `--warn-bg #fff6e5`, `--field-line #8f8a82`; solo en la web, `--bronze-on-dark #c9a27e`.

- [ ] **Step 1: Write the failing test** `tests/design.test.js` (`node:test`). Lee el primer bloque `:root{…}` de cada archivo y saca los pares `--name:#hex`.
  - `test("site and panel share the palette")`: para cada token de la lista de arriba salvo `--bronze-on-dark`, el valor es igual en los dos archivos e igual al de la lista.
  - `test("text pairs meet WCAG AA")`: con una función `contrast(a, b)` (luminancia relativa WCAG 2.x), `stone/mist ≥ 4.5`, `stone/paper ≥ 4.5`, `bronze-dk/paper ≥ 4.5`, `paper/bronze-dk ≥ 4.5`, `bronze-on-dark/#1f1f1f ≥ 4.5`, `field-line/#fbfaf8 ≥ 3`.
  - `test("bronze is never used as text colour")`: ningún archivo contiene `/(^|[;{\s])color:\s*var\(--bronze\)/m`.
- [ ] **Step 2: Run** `node --test tests/design.test.js` → FAIL (los tokens difieren).
- [ ] **Step 3: Implement.** Pon los tokens; el texto en bronce pasa a `--bronze-dk` (precio, `.specs h4`, pestaña activa, `.unsaved`); fondos en bronce con texto blanco pasan a `--bronze-dk` (hover de `.btn`, `.pill.offer`); `.agent .role` a `--bronze-on-dark`; bordes de inputs, chips y opciones no seleccionadas a `--field-line`; `.badge.archived` a tono neutral (stone). El bronce `--bronze` queda para foco, borde activo y `accent-color`.
- [ ] **Step 4: Run** `node --test tests/design.test.js` → PASS. Revisa en el navegador (`npm run build && npm run dev`) la home, una ficha y el panel: nada cambia de sitio, solo de tono.
- [ ] **Step 5: Commit** `Unify site and panel palette and fix failing contrast`.

### Task 2: Migración 0008

**Files:**
- Create: `migrations/0008_applicants.sql`
- Test: `tests/server/schema.test.mjs` (añadir)

**Interfaces:**
- Produces (tablas, columnas exactas del spec §3.1 con estos nombres):
  - `admins` + `name TEXT`.
  - `contacts(id INTEGER PK, name, email, phone, preferred_channel, best_time, privacy_ack_at, marketing_opt_in_at, consent_source, last_activity_at, created_at, updated_at, updated_by)`. Índices únicos parciales en `email` y `phone` (`WHERE … IS NOT NULL`). `CHECK (email IS NOT NULL OR phone IS NOT NULL)`, `CHECK (email = lower(email))`, `CHECK (phone GLOB '+[1-9]*')`.
  - `applicants(...)` con los campos del §3.1 y CHECKs en cada lista cerrada (`operation`, `stage`, `source`, `furnished`, `buyer_position`, `mortgage_aip`, `housing_status`), números `>= 0`, presupuestos `> 0`. `stage` por defecto `'new'`. Índice `(operation, created_at)`.
  - `events(id INTEGER PK, at, actor, entity_type, entity_id TEXT, type, data TEXT)` con índice `(entity_type, entity_id, at)`.
  - `notifications(id INTEGER PK, event_id REFERENCES events(id), category CHECK IN ('new_applicant','viewing'), title, action_required CHECK IN (0,1), created_at, resolved_at, resolved_by)`. La entidad se lee del evento (join); no se duplica aquí. Índice `(resolved_at, category, created_at)`.
  - Relleno A15: por cada `viewing_requests` con `status='new'`, un evento `viewing.requested` (`actor 'system'`, `entity_type 'viewing'`, `entity_id` = id como texto, `at` = su `created_at`) y su aviso `viewing`, `action_required 1`, título `Viewing request: <name>`.

- [ ] **Step 1: Write the failing tests** en `schema.test.mjs`:
  - `test("0008: contacts need an email or a phone and refuse duplicates")`: insertar sin ambos → `/CHECK/`; dos con el mismo email → `/UNIQUE/`; teléfono `07797…` → `/CHECK/`.
  - `test("0008: applicants refuse values outside the closed lists")`: `operation 'lease'` → `/CHECK/`; `bedrooms_min -1` → `/CHECK/`; `budget_max 0` → `/CHECK/`.
  - `test("0008: pending viewing requests get a notice")`: la migración ya corrió en `makeDb()`, así que inserta antes una fila en `viewing_requests` creando la base a mano (aplica 0001–0007, inserta una solicitud `new` y otra `closed`, aplica 0008) y comprueba 1 evento y 1 aviso abierto.
- [ ] **Step 2: Run** `node --test tests/server/schema.test.mjs` → FAIL.
- [ ] **Step 3: Write** `0008_applicants.sql` (comentario de una línea por tabla, como las anteriores).
- [ ] **Step 4: Run** `npm test` → PASS (las pruebas existentes siguen pasando).
- [ ] **Step 5: Commit** `Add contacts, applicants, events and notifications tables`.

### Task 3: Validación de aplicantes y listas cerradas

**Files:**
- Create: `server/applicants.js`
- Modify: `server/http.js` (`readJson` con límite)
- Test: `tests/server/applicants-validate.test.mjs`

**Interfaces:**
- Produces:
  - `OPTIONS`: objeto de listas `[[value, label], …]` en inglés: `operation` (`rent` «To Let», `buy` «To Buy»), `parishes` (las 12: Grouville, St Brelade, St Clement, St Helier, St John, St Lawrence, St Martin, St Mary, St Ouen, St Peter, St Saviour, Trinity; valor = nombre), `property_types`, `outdoor`, `furnished`, `pet_kinds`, `buyer_position`, `mortgage_aip`, `housing_status` (labels: Permanent Entitled, Entitled, Licensed, Licensed for Lease Only, Entitled for Work Only, Standard, Not sure), `channels`, `stages` (New, Searching, Viewing, Offer / Application, Agreed, Completed, Paused, Lost), `sources` (Website, Phone, Walk-in, Email). Única fuente: el panel la importa (`../../server/applicants.js`) y la web la recibe por `GET /api/applicants/options` (Tarea 11).
  - `normalizePhone(s: string) → string | null`: quita espacios, guiones, puntos y paréntesis; `00…` → `+…`; `0…` → `+44…`; válido si `/^\+[1-9]\d{7,14}$/`.
  - `validateApplicant(body, { publicForm: boolean }) → { value: { contact, applicant } } | { errors: { [field]: string } }`. `contact` y `applicant` llevan exactamente las columnas de la Tarea 2.
    - Público obliga: `operation`, `bedrooms_min`, `budget_max`, `name`, `email`, `phone`, `privacy === true`. `marketing === true` pone `marketing_opt_in`.
    - Panel obliga: `name`, `email` o `phone`, `operation`, `source` ∈ `phone|walk_in|email`.
    - Rangos: dormitorios y baños 0–20; parking 0–3; adultos y niños 0–20; `lease_term_months` 1–120; `move_in_date` fecha real entre hoy y +2 años (hora de Jersey, `jerseyToday`); alquiler 100–50 000 £/mes; compra 10 000–100 000 000 £; `budget_min ≤ budget_max ≤ budget_stretch`.
    - Listas: solo valores de `OPTIONS`, sin repetidos; una parroquia no puede estar en deseadas y excluidas a la vez.
    - Textos: `name` 1–120, `near` y `best_time` ≤ 200, `requirements` ≤ 2000, recortados.
    - `furnished` y `lease_term_months` se ignoran si `operation='buy'`; `buyer_position` y `mortgage_aip` si `operation='rent'`.
  - `readJson(request, maxBytes = 32768)`: `fail(413, "Request too large")` si el cuerpo pasa del límite.

- [ ] **Step 1: Write the failing tests**:
  - `test("normalizePhone")`: `"07797 123456"`, `"+44 7797 123456"`, `"0044 7797-123456"` → `"+447797123456"`; `"(01534) 727582"` → `"+441534727582"`; `"12"` y `"abc"` → `null`.
  - `test("public form: required fields and consent")`: cuerpo vacío → `errors` con `operation`, `bedrooms_min`, `budget_max`, `name`, `email`, `phone`, `privacy`.
  - `test("budget sanity per operation")`: compra con `budget_max 1500` → `errors.budget_max`; alquiler con `750000` → `errors.budget_max`; `budget_min 3000, budget_max 2000` → `errors.budget_min`.
  - `test("closed lists and parishes")`: `parishes_wanted ["Paris"]` → error; misma parroquia en las dos listas → `errors.parishes_excluded`.
  - `test("panel form needs only name, one contact route, operation and source")`.
  - `test("rent-only and buy-only fields are dropped for the other operation")`.
- [ ] **Step 2: Run** `node --test tests/server/applicants-validate.test.mjs` → FAIL.
- [ ] **Step 3: Implement** `server/applicants.js` y el límite en `readJson` (`await request.text()`, comparar `length`, luego `JSON.parse`).
- [ ] **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `Add applicant validation and the shared option lists`.

### Task 4: Eventos y avisos, y su uso en las solicitudes de visita

**Files:**
- Create: `server/events.js`
- Modify: `server/routes/public.js` (`createViewing`), `server/routes/inbox.js` (`update`, `remove`)
- Test: `tests/server/events.test.mjs`

**Interfaces:**
- Produces:
  - `logEvent(env, { actor, entity_type, entity_id, type, data }, notice?) → D1PreparedStatement[]`. `entity_id: null` significa «la fila que se acaba de insertar» (`COALESCE(?, last_insert_rowid())`), para encadenarlo tras un INSERT dentro del mismo `batch`. `notice = { category, title, action_required }` añade el INSERT del aviso con `event_id = last_insert_rowid()`.
  - `resolveNotices(env, { entity_type, entity_id, category? }, by) → D1PreparedStatement` (solo los abiertos).
- Consumes: tablas de la Tarea 2.

- [ ] **Step 1: Write the failing tests**:
  - `test("a viewing request writes its event and an open notice")`: `POST /viewings` (con el `turnstile` simulado como en `public.test.mjs`) → 1 evento `viewing.requested` con `entity_id` igual al id de la solicitud y 1 aviso `viewing` abierto con título `Viewing request: Jane Le Brocq`.
  - `test("the notice closes when the request leaves new")`: `PUT /admin/viewings/:id {status:"contacted"}` → aviso con `resolved_at` y `resolved_by` del admin.
  - `test("a rejected viewing writes nothing")`: Turnstile falla → 0 eventos.
  - `test("deleting a request closes its notice")`: `DELETE /admin/viewings/:id` → su aviso queda resuelto.
- [ ] **Step 2: Run** `node --test tests/server/events.test.mjs` → FAIL.
- [ ] **Step 3: Implement** `server/events.js`; en `createViewing`, el INSERT y `logEvent(...)` van en un único `env.DB.batch([...])`; en `inbox.update`, si `patch.status` existe y no es `new`, añade `resolveNotices` al mismo cambio (`batch`); `inbox.remove` también cierra los avisos de esa solicitud.
- [ ] **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `Log viewing requests as events with an Inbox notice`.

### Task 5: API de avisos

**Files:**
- Create: `server/routes/notifications.js`
- Modify: `server/api.js` (registrar rutas)
- Test: `tests/server/notifications.test.mjs`

**Interfaces:**
- Produces:
  - `GET /api/admin/notifications?box=action|feed&category=new_applicant|viewing` → `{ notifications: [{ id, category, title, created_at, action_required, resolved_at, entity_type, entity_id, phone, link }], counts: { action: n, new_applicant: n, viewing: n } }`. `box=action`: `action_required=1 AND resolved_at IS NULL`, más antiguos primero. `box=feed`: el resto, más recientes primero, máximo 200. `counts` cuenta solo pendientes de acción. `phone`: el del contacto (aplicante/contacto) o el de la solicitud de visita. `link`: hash del panel al que lleva: `#/applicants/<id>`, `#/viewings`, o para un contacto (duplicado, §3.3) su búsqueda activa con la operación del evento, si no la más reciente, si no `#/applicants/new?contact=<id>`.
  - `GET /api/admin/notifications/counts` → `{ action, new_applicant, viewing }` (para el contador de la navegación).
  - `PUT /api/admin/notifications/:id {resolved:true}` → `{ok:true}`; 404 si no existe.

- [ ] **Step 1: Write the failing tests**: sin sesión → 401; filtro por `box` y `category`; `counts` correcto; `link` del duplicado en sus tres casos (siembra eventos y aplicantes a mano); `PUT` cierra y deja de contar.
- [ ] **Step 2: Run** `node --test tests/server/notifications.test.mjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add the notifications API for the Inbox`.

### Task 6: API de aplicantes del panel

**Files:**
- Create: `server/routes/applicants.js`
- Modify: `server/api.js`, `server/routes/users.js` (`name`)
- Test: `tests/server/applicants.test.mjs`

**Interfaces:**
- Consumes: `validateApplicant`, `normalizePhone` (Tarea 3); `logEvent`, `resolveNotices` (Tarea 4).
- Produces (todas con sesión):
  - `GET /admin/applicants?operation=rent|buy&sort=newest|oldest&stage=&assigned=&q=&archived=1` → `{ applicants: [{ id, operation, stage, created_at, assigned_to, assigned_name, name, phone, email }] }`. `q` busca en nombre, email y móvil (normaliza `q` con `normalizePhone` si parece un teléfono).
  - `GET /admin/applicants/:id` → `{ applicant, contact, events, viewings, duplicates }`. `events`: los del aplicante y los de su contacto, más recientes primero. `viewings` (G4): solicitudes con el mismo email (`lower`) o cuyo teléfono sin espacios, guiones ni paréntesis termina en los 9 últimos dígitos del móvil del contacto (comentario `ponytail:` con el límite). `duplicates`: avisos abiertos `applicant.duplicate_submitted` de su contacto, con el envío (`data`).
  - `POST /admin/applicants` → `201 {id}`. Si llega `contact_id` usa ese contacto («Add a new search for this contact»); si no y el email o móvil ya existen → `409 {error, contact_id}` para que el panel ofrezca la búsqueda nueva. Evento `applicant.created` sin aviso de acción (Feed, `action_required 0`).
  - `PUT /admin/applicants/:id` con `updated_at` obligatorio: si no coincide → `409 "Someone else saved changes to this applicant. Reload to see them (your changes were not saved)."`. Un evento `applicant.updated` con `{ before, after }` solo de los campos cambiados (`applicant.stage_changed` si cambia la etapa). Si se asigna o la etapa deja `new`, `resolveNotices` de `new_applicant`. `stage='lost'` exige `lost_reason`.
  - `PUT /admin/contacts/:id` igual, con `updated_at`; un email o móvil que ya usa otro contacto → 409.
  - `POST /admin/applicants/:id/archive` y `/restore`: archivar cierra sus avisos abiertos.
  - `DELETE /admin/applicants/:id {confirm: <nombre exacto del contacto>}`: solo si está archivado. Borra el aplicante y, si el contacto no tiene otras búsquedas, el contacto; vacía `data` de sus eventos y pone `title = 'Deleted applicant'` en sus avisos.
  - Toda escritura actualiza `contacts.last_activity_at` (G2).
  - `users`: `GET` devuelve `name`; `POST` acepta `name` (≤ 80); `PUT /admin/users/:email {name}`.

- [ ] **Step 1: Write the failing tests**:
  - `test("create from the panel, then list filtered and sorted")`: dos aplicantes rent y uno buy; `operation=rent&sort=oldest` devuelve los dos en orden.
  - `test("existing email or phone answers 409 with the contact id")`.
  - `test("update logs only the changed fields and refuses stale saves")`: segundo `PUT` con el `updated_at` antiguo → 409.
  - `test("assigning closes the new-applicant notice")`.
  - `test("detail shows viewing requests with the same email or phone")`: solicitud con `phone "07797 123 456"` y contacto `+447797123456` → aparece.
  - `test("permanent delete only from Archived, with the exact name, and wipes personal data from history")`.
  - `test("users can carry a display name")`.
- [ ] **Step 2: Run** `node --test tests/server/applicants.test.mjs` → FAIL.
- [ ] **Step 3: Implement.** Cada escritura con sus eventos en un solo `batch`.
- [ ] **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `Add the applicants API for the panel`.

### Task 7: Panel: navegación, Inbox y sondeo

**Files:**
- Create: `admin/src/Inbox.jsx`, `admin/src/poll.js`
- Modify: `admin/src/App.jsx` (rutas y navegación), `admin/src/ListingEditor.jsx` (enlaces `#/` → `#/listings`), `admin/src/format.js` (`fmtAgo`), `admin/src/styles.css`, `tests/e2e.cjs` (las rutas `admin/#/` de listings pasan a `admin/#/listings`)

**Interfaces:**
- Consumes: Tarea 5.
- Produces:
  - Rutas: `#/` Inbox · `#/applicants` · `#/applicants/new[?contact=<id>]` · `#/applicants/<id>[/timeline]` · `#/listings` · `#/p/<id>` · `#/viewings` · `#/tours` · `#/users`.
  - `usePoll(fn, ms = 30000)` en `poll.js`: llama a `fn` al montar y cada `ms` solo con `document.visibilityState === "visible"`; se para al desmontar.
  - `fmtAgo(iso) → string` con `Intl.RelativeTimeFormat("en", { numeric: "auto" })`.
- Pantalla según spec §6 y DESIGN.md «Lista + detalle»: `.seg` Needs action / Feed; pestañas All · New applicants · Viewings con su contador; cada aviso con título, `fmtAgo`, enlace a `link`, botón **Call** (`tel:` con el `phone` ya normalizado) si hay teléfono, **Done** si está abierto. Vacíos con su texto propio («You're all caught up…»). La navegación muestra `Inbox` con el contador `counts.action` (de `/notifications/counts`, con `usePoll`) y se detiene mientras la sesión ha caducado.

- [ ] **Step 1: Implement** las rutas, `poll.js`, `fmtAgo` e `Inbox.jsx`.
- [ ] **Step 2: Run** `npm run build` → sin errores. Con `npm run dev` y la base de pruebas, comprueba: una solicitud de visita `new` sale en Needs action; Done la mueve a Feed y baja el contador.
- [ ] **Step 3: Commit** `Add the Inbox as the panel's home page`.

### Task 8: Panel: lista de aplicantes y alta

**Files:**
- Create: `admin/src/Applicants.jsx`, `admin/src/ApplicantFields.jsx`, `admin/src/NewApplicant.jsx`
- Modify: `admin/src/App.jsx`, `admin/src/styles.css`

**Interfaces:**
- Consumes: Tarea 6; `OPTIONS` desde `../../server/applicants.js`.
- Produces: `ApplicantFields({ value, onChange, errors, operation })`: los campos de requisitos y contacto agrupados como en los pasos del §5 (sin el paso a paso), con los errores del servidor junto a cada campo (`aria-describedby`, `aria-invalid`). Lo usan esta tarea y la Tarea 9.
- Lista según spec §6 (G3: sin columna Queue): `.seg` All / To Let / To Buy, orden Newest / Oldest con `aria-sort`, búsqueda, filtros Stage y Assigned to, pestaña Archived, badges de etapa con los tonos de DESIGN.md, filas que abren `#/applicants/<id>`, tarjetas bajo 760px. Botón primario `New applicant`.
- Alta: `source` Phone / Walk-in / Email; ante un 409 con `contact_id`, mensaje «<name> is already a contact» con el botón «Add a new search for this contact».

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm run build`. En local: alta por teléfono, aparece arriba en Newest; el mismo email da la opción de búsqueda nueva; un error de presupuesto se ve en su campo.
- [ ] **Step 3: Commit** `Add the applicants list and the new applicant form`.

### Task 9: Panel: ficha del aplicante

**Files:**
- Create: `admin/src/ApplicantDetail.jsx`
- Modify: `admin/src/App.jsx`, `admin/src/Users.jsx` (columna Name editable), `admin/src/styles.css`

**Interfaces:**
- Consumes: Tareas 6 y 8 (`ApplicantFields`).
- Pantalla según spec §6: cabecera con nombre, Call (`tel:`), WhatsApp (`https://wa.me/` + teléfono sin `+`), Email (`mailto:`), selector de etapa (Lost pide motivo) y Assigned to (nombres de `/admin/users`); pestañas Requirements y Timeline como tablist ARIA (patrón de `.media-tabs`, pestaña en la URL); barra Save/Discard y aviso al salir con `setUnsaved`, como `ListingEditor`; 409 muestra el mensaje y un botón Reload. Timeline: eventos con autor (nombre si lo hay), `fmtAgo` y diferencias campo a campo, mezclados por fecha con las solicitudes de visita (G4). Franja de duplicado (§3.3): diferencias entre el envío y lo guardado, **Copy fields** (rellena el formulario con los requisitos y `preferred_channel`/`best_time` del envío, sin guardar), **Create second search** (solo si no hay búsqueda activa con esa operación; va a `#/applicants/new?contact=<id>`), **Dismiss** (cierra el aviso). En Archived: Restore y el borrado definitivo escribiendo el nombre (como en `ListingEditor`).

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm run build`. En local con un aplicante cuyo nombre y requisitos son `<img src=x onerror=alert(1)>`: se ve como texto en la lista, la ficha, el Timeline y el Inbox, sin diálogo ni imagen (Review Focus 5).
- [ ] **Step 3: Commit** `Add the applicant record with requirements and timeline`.

### Task 10: Cierre de la Entrega 1

**Files:**
- Create: `docs/roadmap/ESTADO.md` (tabla de fases F0–F8: estado, spec, plan, pendiente)
- Modify: `tests/fixtures/seed.sql` (dos aplicantes, un duplicado pendiente y una visita `new`)

- [ ] **Step 1: Revisión del diff** de la entrega (`git diff ada40e3..HEAD -- server admin site migrations`) con las skills `antislop`, `ponytail-review`, `web-performance-optimization`, `security-best-practices` y `frontend-security-coder`. Aplica lo que encuentren y vuelve a correr `npm test`.
- [ ] **Step 2: E2E con Playwright MCP** contra `npm run dev` y la base de pruebas (receta en la cabecera de `tests/e2e.cjs`; la cookie de sesión se pone con `context.addCookies` firmada con el `SESSION_SECRET` de `.dev.vars`). En 1280×800 y 390×844, con teclado: Inbox → Done; Applicants → filtros y orden; New applicant → ficha → editar y guardar → Timeline; duplicado → Copy fields; archivar → borrado definitivo; Users → nombre. Consola sin errores. Capturas a la carpeta de pruebas.
- [ ] **Step 3: Corre** `node tests/e2e.cjs` (las pruebas antiguas, ya con `#/listings`) → PASS.
- [ ] **Step 4: Escribe** `docs/roadmap/ESTADO.md` (F0 entrega 1: lista para desplegar) y haz commit `Close F0 release 1`.
- [ ] **Step 5: Pide a Luis el sí** para desplegar. Solo con el sí: `npx wrangler d1 migrations apply hampton --remote`, luego `git push origin main`, y comprueba en `https://hamptonjersey.pages.dev/admin/` que Inbox carga y que la solicitud pendiente de producción aparece.

## Entrega 2 · Asistente público (sale cuando no quede ningún `TO CONFIRM`)

### Task 11: Alta pública y opciones

**Files:**
- Modify: `server/routes/public.js`
- Test: `tests/server/applicants-public.test.mjs`

**Interfaces:**
- Consumes: Tareas 3, 4 y 6.
- Produces:
  - `GET /api/applicants/options` → `OPTIONS`, `cache-control: public, max-age=86400`.
  - `POST /api/applicants` (mismo origen, `readJson` con límite, Turnstile después de validar, como `createViewing`) → siempre `201 {ok:true}` si es válido; `400 {error, fields}` si no.
    - Sin contacto con ese email (en minúsculas) ni ese móvil normalizado: crea contacto (`consent_source 'web'`, `privacy_ack_at`, `marketing_opt_in_at` si marcó), aplicante (`source 'web'`, `stage 'new'`) y `applicant.created` con aviso `new_applicant` `New applicant: <name> · To Let|To Buy`, todo en un `batch`.
    - Con contacto: no toca contacto ni aplicantes; evento `applicant.duplicate_submitted` (`entity_type 'contact'`, `data` = envío completo, y `other_contact_id` si email y móvil apuntan a contactos distintos) con aviso `<name> registered again`. Excepción de consentimiento: si no marcó marketing, `marketing_opt_in_at = NULL`; si el contacto no tenía `privacy_ack_at`, se rellena; cada cambio escribe `contact.consent_changed`. Actualiza `last_activity_at`.

- [ ] **Step 1: Write the failing tests**:
  - `test("a new registration creates contact, applicant and notice")`.
  - `test("same email in other case, or same phone in another format, is a duplicate that changes nothing")`: `"Jane@Example.je "` y `"07797 123456"` frente a `jane@example.je` / `+447797123456`; el contacto y el aplicante siguen iguales; la respuesta es la misma que en un alta nueva (Review Focus 1 y 2).
  - `test("a duplicate without marketing withdraws the opt-in; with marketing it does not opt in")`.
  - `test("invalid input spends no Turnstile token")` y `test("cross-origin and oversized bodies are refused")` (403 y 413).
- [ ] **Step 2: Run** `node --test tests/server/applicants-public.test.mjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `Accept applicant registrations from the website`.

### Task 12: Asistente «Register your search» y aviso de privacidad

**Files:**
- Create: `site/apply.js`, `scripts/check-release.mjs`
- Modify: `site/index.html` (router: `#/apply` y `#/privacy` cargan `apply.js` con `import()`; enlace «Register» en la navegación; llamada a la acción «Tell us what you're looking for» en la home; enlace «Privacy» en el pie), `package.json` (`"check:release": "node scripts/check-release.mjs"`)

**Interfaces:**
- Consumes: Tarea 11; de `index.html`, `esc`, `TS_KEY` y la promesa de Turnstile (`tsReady`) se pasan como argumentos.
- Produces: `export function renderApply(root, { esc, tsKey, tsReady })` y `export function renderPrivacy(root)` en `site/apply.js`.
- Asistente según spec §5 y DESIGN.md «Asistente de registro»: 6 pasos con `<fieldset>`/`<legend>`, «Step N of 6», foco al título de cada paso, Back/Continue, opciones de `/api/applicants/options`, paso 1 con el enlace de G6 a `#book`, progreso en `sessionStorage` (try/catch, se borra al enviar), errores del servidor llevan al paso del primer campo con error, Turnstile en el último paso con el mismo plan B de 6 s que la reserva, final con el nombre por `textContent`: «Thank you, <name>. We'll be in touch within one working day.»
- Aviso de privacidad (Data Protection (Jersey) Law 2018): responsable, finalidades, base legal, conservación de 12 meses desde el último contacto (G2), derechos (acceso, rectificación, supresión, oposición al marketing según el art. 36), contacto. Los datos que faltan van literalmente como `TO CONFIRM: legal name`, `TO CONFIRM: address`, `TO CONFIRM: privacy email`, `TO CONFIRM: JOIC registration` y `TO CONFIRM: processor (Optimyze)` (G5).
- `scripts/check-release.mjs`: recorre `site/` (sin `site/admin/`) y termina con código 1 listando archivo y línea de cada `TO CONFIRM`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm run check:release` → FAIL listando los cinco `TO CONFIRM` (es lo esperado hasta que Hampton dé los datos).
- [ ] **Step 3: Comprueba con Playwright MCP** (390×844 y 1280×800, Turnstile de prueba): la home no descarga `apply.js` hasta abrir `#/apply`; registro completo → aviso en el Inbox del panel en menos de 1 minuto; recarga a mitad conserva lo escrito; Back no pierde nada; todo con teclado; nombre `<img src=x onerror=alert(1)>` se ve como texto en la confirmación (Review Focus 5); registro repetido con el mismo móvil en otro formato → aviso «registered again» y la ficha sin cambios.
- [ ] **Step 4: Commit** `Add the step-by-step applicant registration and the privacy notice draft`.

### Task 13: Cierre de la Entrega 2

- [ ] **Step 1:** Repite la revisión del Paso 1 de la Tarea 10 sobre el diff de esta entrega.
- [ ] **Step 2:** Cuando Luis pase los datos, sustituye cada `TO CONFIRM` y el plazo de respuesta si cambia. `npm run check:release` → sin salida, código 0.
- [ ] **Step 3:** Actualiza `docs/roadmap/ESTADO.md` (F0 completa) y commit.
- [ ] **Step 4:** Con el sí de Luis, `git push origin main` y prueba un registro real en producción (Turnstile real, desde el navegador de Luis).

## Tarea aparte · Cambio de dominio (cuando llegue el acceso)

- [ ] **Step 1 (se puede hacer ya):** lee el sitemap público de la web actual de Wix y escribe `site/_redirects` con un `301` por URL antigua hacia su equivalente (`/` → `/`, cada ficha a `/#/p/<id>` si existe, el resto a `/`). Commit.
- [ ] **Step 2:** con el acceso, añade `hamptonestatesjersey.com` y `www` como dominios personalizados del proyecto Pages `hamptonjersey` y apunta el DNS (pasos exactos para Luis, con dónde se ejecuta cada uno).
- [ ] **Step 3:** añade el dominio a los dominios autorizados de Firebase (`hamptonestatesjersey`) y a los hostnames del widget Turnstile «hamptonjersey viewings».
- [ ] **Step 4:** verifica en el dominio nuevo: login con Google en `/admin`, una reserva y un registro reales, y que tres URLs antiguas de Wix redirigen con 301.
