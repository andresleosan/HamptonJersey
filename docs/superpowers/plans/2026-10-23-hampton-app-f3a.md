# Hampton App F3-A: agenda de visitas con huecos reales · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la web y el panel solo ofrezcan huecos reales de cada negociador, que nadie se quede con un hueco ocupado, y que el equipo lleve cada visita de la petición al resultado desde el panel.

**Architecture:** Igual que F0/F1-A. Migración 0010 (`negotiators`, `negotiator_exceptions`, `viewing_requests` reconstruida con estados nuevos). Reglas de huecos puras en `server/viewings.js`; reservas atómicas con `INSERT … SELECT … WHERE NOT EXISTS`; rutas públicas en `server/routes/public.js`, de panel en `server/routes/inbox.js` (visitas) y `server/routes/negotiators.js` (nuevo).

**Tech Stack:** Pages Functions + D1 · React 19 + Vite (panel) · sitio público vanilla (`site/index.html`) · Node 24 `node:test` + `node:sqlite`.

**Spec:** `docs/superpowers/specs/2026-10-23-hampton-app-f3a-design.md` (decisiones C1–C16; mandan). Bases: specs de F0 y F1-A. Diseño: `DESIGN.md`.

## Global Constraints

- Las Global Constraints del plan F0 (`docs/superpowers/plans/2026-10-23-hampton-app-f0.md`) siguen valiendo íntegras (inglés en la UI, un solo rol, NULL nunca 0, consultas con parámetros, sin `dangerouslySetInnerHTML`, sin dependencias nuevas, nada «para después», `main` y commit por tarea, push solo con el sí de Luis y nunca `--remote` desde la sesión).
- Hora local de Jersey en todo: `date` `YYYY-MM-DD`, `time`/`end_time` `HH:MM`. «Hoy» y «ahora» salen de `Intl` con `timeZone: "Europe/Jersey"` (como `jerseyToday`), nunca de UTC.
- Constantes en un solo sitio (`server/viewings.js`): `SLOT_MINUTES = 30`, `BUFFER_MINUTES = 15`, `PUBLIC_DAYS = 12`, `MAX_DAYS = 14`.
- Cita activa = `status IN ('requested','confirmed')`. Solo las activas bloquean huecos.
- Nada personal sale por `GET /api/availability`, ni en `events.data`.
- Cada petición cabe en 10 ms de CPU: los huecos se calculan para como mucho 14 días × negociadores activos, con una consulta de citas por rango de fechas (índice `(negotiator_id, date)`).

## Review Focus

1. **Cambio de hora (último domingo de octubre / marzo)**: «hoy» y «ahora» en Jersey, no UTC; una petición a las 00:30 BST no ve «hoy» como ayer → prueba en Tarea 2.
2. **Dos reservas del mismo hueco a la vez**: la segunda no guarda nada, ni evento ni aviso, y recibe 409 → prueba en Tarea 3.
3. **Reprogramar una visita a su propio hueco o a uno contiguo**: la cita no se bloquea a sí misma → prueba en Tarea 5.
4. **Negociador desactivado con citas futuras**: deja de ofrecerse en la web, sus citas siguen visibles y reprogramables a otro → prueba en Tarea 4.
5. **Peticiones antiguas tras la migración**: conservan id, datos, estado mapeado y bloquean su hueco si siguen activas → prueba en Tarea 1.

---

### Task 1: Migración 0010

**Files:**
- Create: `migrations/0010_viewings.sql`
- Test: `tests/server/schema.test.mjs` (añadir)

**Interfaces:**
- Produces: tablas del spec §3 exactamente.
  - `negotiators(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80), role TEXT CHECK (role IS NULL OR length(role) <= 80), active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)), hours TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`.
  - Siembra: `('Gilberto Franco','Managing Director')` y `('Joshua Franco','Negotiator')`, ambos con `hours = '{"mon":["10:00","17:30"],"tue":["10:00","17:30"],"wed":["10:00","17:30"],"thu":["10:00","17:30"],"fri":["10:00","17:30"],"sat":["10:00","13:00"],"sun":null}'`, `updated_by 'setup'`.
  - `negotiator_exceptions(id INTEGER PRIMARY KEY AUTOINCREMENT, negotiator_id INTEGER NOT NULL REFERENCES negotiators(id) ON DELETE CASCADE, date TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('block','open')), start_time TEXT, end_time TEXT, note TEXT CHECK (note IS NULL OR length(note) <= 200), created_at TEXT NOT NULL, created_by TEXT, CHECK ((start_time IS NULL) = (end_time IS NULL)), CHECK (start_time IS NULL OR start_time < end_time), CHECK (kind = 'block' OR start_time IS NOT NULL))` + índice `negotiator_exceptions_day(negotiator_id, date)`.
  - `viewing_requests` reconstruida con las columnas actuales (`id, listing_id, agent, kind, date, time, name, email, phone, status, created_at, updated_at, updated_by, listing_ref, listing_title_snapshot, notes`) + `negotiator_id INTEGER REFERENCES negotiators(id) ON DELETE SET NULL`, `end_time TEXT`, `outcome TEXT CHECK (outcome IS NULL OR outcome IN ('proceed','more_info','not_interested'))`, `outcome_note TEXT CHECK (outcome_note IS NULL OR length(outcome_note) <= 500)`; `email` NULL permitido con `CHECK (email IS NOT NULL OR phone IS NOT NULL)`; `status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','completed','no_show','cancelled'))`; `CHECK (outcome IS NULL OR status = 'completed')`. Índices `viewing_status(status, created_at)` y `viewing_negotiator_day(negotiator_id, date)`.
  - Copia (C8): `new→requested`, `contacted→confirmed`, `closed→completed` si `date < date('now')` y si no `cancelled` (comentario: la fecha UTC del día de la migración basta para filas cerradas); `negotiator_id = (SELECT id FROM negotiators WHERE name = agent)`; `end_time = substr(time(time, '+30 minutes'), 1, 5)`. Ids conservados.
- [ ] **Step 1: Write the failing tests**:
  - `test("0010: viewing requests keep ids and data and map their status")`: base 0001–0009 a mano, filas `new` (agent `Joshua Franco`), `contacted`, `closed` con fecha pasada, `closed` con fecha futura, agent `Someone else`; tras 0010 → estados `requested`, `confirmed`, `completed`, `cancelled`; `negotiator_id` del de Joshua o NULL; `end_time` = time + 30; un INSERT nuevo recibe id > el mayor copiado.
  - `test("0010: negotiators are seeded and exceptions enforce their CHECKs")`: 2 negociadores con el horario de arriba; `open` sin horas → `/CHECK/`; inicio ≥ fin → `/CHECK/`; borrar el negociador borra sus excepciones.
  - `test("0010: viewing requests refuse bad status, outcome outside completed and no contact")`.
  - `test("0010: viewing indexes exist")`: `PRAGMA index_list(viewing_requests)` lista los dos.
- [ ] **Step 2: Run** `node --test tests/server/schema.test.mjs` → FAIL.
- [ ] **Step 3: Write** la migración (mismo patrón de reconstrucción que `notifications` en 0009). Comentario de una línea por bloque.
- [ ] **Step 4: Run** `npm test` → PASS (ajustar las pruebas existentes que siembran `viewing_requests` con `status 'new'` u otros estados viejos; `tests/server/helpers.mjs` aplica todas las migraciones).
- [ ] **Step 5: Commit** `Add negotiators, their exceptions and the new viewing states`.

### Task 2: Reglas de huecos y validación

**Files:**
- Modify: `server/viewings.js` (quitar `TIMES`; añadir lo de abajo; `validateViewing` cambia)
- Test: `tests/server/viewings.test.mjs` (nuevo)

**Interfaces:**
- Produces:
  - `SLOT_MINUTES`, `BUFFER_MINUTES`, `PUBLIC_DAYS`, `MAX_DAYS`, `STATUSES = ['requested','confirmed','completed','no_show','cancelled']`, `ACTIVE = ['requested','confirmed']`, `OUTCOMES = ['proceed','more_info','not_interested']`, `WEEKDAYS = ['mon',…,'sun']`.
  - `jerseyNow(d = new Date()) → { date: "YYYY-MM-DD", time: "HH:MM" }` (Europe/Jersey); `jerseyToday` se queda y usa lo mismo.
  - `addMinutes("HH:MM", n) → "HH:MM"`.
  - `daySlots({ hours, exceptions, bookings, date, now, fromTomorrow }) → [{ time, booked }]` (pura). `hours` = objeto de `negotiators.hours` ya parseado; `exceptions` = filas de esa fecha; `bookings` = `[{ time, end_time, id }]` activas de ese negociador ese día; `now` = `jerseyNow()`; `fromTomorrow` true en la web. Reglas del spec §4, en ese orden.
  - `isFree(slots, time) → boolean` (existe y `booked: false`).
  - `validHours(obj) → errors|null` y `validException(body) → { value } | { errors }` (para Tarea 4).
  - `validateViewing(body, { today, panel })`: como hoy, pero `negotiator_id` (entero positivo) obligatorio, `time` con formato `HH:MM` (la rejilla la comprueba `isFree`, no la validación), `agent` ya no se lee del cuerpo; en la web la fecha va de mañana a `today + 60 días`, en el panel de hoy a un año. Email obligatorio en la web; en el panel email **o** teléfono. Valida `phone` ≤ 40 como ahora.
- [ ] **Step 1: Write the failing tests**:
  - `test("slots follow the weekly hours on a 30-minute grid")`: lunes 10:00–12:00 → 10:00, 10:30, 11:00, 11:30.
  - `test("an open exception replaces the day and a block removes its hours")`: domingo `open` 14:00–15:00 → 14:00, 14:30; `block` 10:30–11:30 → quita 10:30 y 11:00; `block` sin horas → [].
  - `test("a booking blocks its slot and its 15-minute margins")`: cita 10:00–10:30 → 10:00 `booked`, 10:30 `booked`, 11:00 libre.
  - `test("past times and, on the website, today are not offered")`.
  - `test("jerseyNow uses Jersey time across the clock change")`: `2026-10-24T23:30:00Z` → `2026-10-25`, `00:30` (BST); `2026-10-25T23:30:00Z` → `2026-10-25`, `23:30` (GMT).
  - `test("validateViewing needs a negotiator and an HH:MM time, and email or phone in the panel")`.
- [ ] **Step 2: Run** `node --test tests/server/viewings.test.mjs` → FAIL.
- [ ] **Step 3: Implement.** Comparar `HH:MM` como texto (mismo ancho). Comentario `ponytail:` en `daySlots` si se simplifica algo con techo.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Compute a negotiator's real viewing slots`.

### Task 3: API pública: disponibilidad y reserva atómica

**Files:**
- Create: `server/viewing-store.js`
- Modify: `server/routes/public.js`
- Test: `tests/server/public.test.mjs` (ajustar y añadir)

**Interfaces:**
- Consumes: Tarea 2.
- Produces (`server/viewing-store.js`, también para Tareas 4–5):
  - `loadAvailability(env, { from, days, now, fromTomorrow, includeInactive = false, negotiatorId? }) → { negotiators: [{id, name, role, active}], days: [{ date, slots: { [id]: [{time, booked}] } }] }`. Tres consultas en un batch (negociadores, excepciones del rango, citas activas del rango).
  - `bookStatement(env, v, { status, excludeId? })` → la sentencia `INSERT … SELECT … WHERE NOT EXISTS (cita activa del mismo negociador ese día con time < end+15 y end_time > time−15)` (los límites con margen calculados en JS y enlazados).
  - Patrón atómico: el batch es `[insert, evento, aviso]`; evento y aviso se insertan con `… SELECT … WHERE changes() = 1` o equivalente que **no** dependa de `last_insert_rowid()` de otra fila. Si el insert no entra, ninguno de los tres escribe nada. El implementador elige el mecanismo y lo prueba.
- Rutas:
  - `GET /api/availability?from&days`: `from` por defecto mañana (Jersey), `days` 1–14 (por defecto 12), solo activos, `fromTomorrow: true`. Respuesta del spec C12 con `slot_minutes`. `cache-control: no-store`. Entrada inválida → 400.
  - `POST /api/viewings`: valida (Tarea 2), comprueba la ficha publicada como hoy, comprueba que el negociador está activo y que la hora `isFree` en `loadAvailability` de ese día, y **luego** Turnstile (el token solo se gasta en una petición válida, como hoy). Guarda `status 'requested'`, `agent = nombre del negociador`, `end_time`, con su evento `viewing.requested` y aviso como hoy. Carrera perdida → 409 `{ error: "That time was just booked. Please choose another." }`.
- [ ] **Step 1: Write the failing tests**:
  - `test("availability lists active negotiators and their slots with booked flags and no personal data")`: la respuesta serializada no contiene el nombre ni el email de la cita sembrada.
  - `test("availability rejects bad from/days and starts tomorrow by default")`.
  - `test("a booking takes a free slot once; the second gets 409 and writes nothing")`: dos `POST` con el mismo hueco → 201 y 409; una sola fila, un solo evento `viewing.requested`, un solo aviso.
  - `test("a booking for an inactive negotiator, a non-grid time or a booked time is refused before Turnstile")`.
  - `test("a cancelled viewing frees its slot")`.
  - Ajustar las pruebas actuales de `POST /api/viewings` a `negotiator_id`.
- [ ] **Step 2: Run** `node --test tests/server/public.test.mjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Offer real slots on the website and refuse double bookings`.

### Task 4: API del panel: negociadores y excepciones

**Files:**
- Create: `server/routes/negotiators.js`
- Modify: `server/api.js` (registrar las rutas)
- Test: `tests/server/negotiators.test.mjs` (nuevo)

**Interfaces:**
- Rutas (todas de admin):
  - `GET /admin/negotiators` → `{ negotiators: [{id, name, role, active, hours, exceptions: [próximas, de hoy en adelante, por fecha]}] }`.
  - `POST /admin/negotiators {name, role?, hours?}` → 201 `{id}`; sin `hours` usa el horario sembrado de Tarea 1 (constante `DEFAULT_HOURS` en `server/viewings.js`). Nombre repetido → 409.
  - `PUT /admin/negotiators/:id {name?, role?, active?, hours?}`; `hours` validado con `validHours` (7 claves, `null` o `[inicio, fin]` `HH:MM` con inicio < fin).
  - `POST /admin/negotiators/:id/exceptions {date, kind, start_time?, end_time?, note?}` → 201; `DELETE /admin/negotiators/:id/exceptions/:eid`.
  - `GET /admin/availability?from&days&negotiator_id?` → como la pública pero con hoy (`fromTomorrow: false`) e `includeInactive` si se pide un `negotiator_id` concreto (para reprogramar citas de alguien desactivado a otro).
  - Sin `DELETE` de negociadores (D9): se desactivan.
- [ ] **Step 1: Write the failing tests**: alta, nombre repetido 409, horario inválido 400 (cada forma mala), desactivar → la disponibilidad pública ya no lo lista pero sus citas siguen en `GET /admin/viewings`, excepción que bloquea un día, borrar excepción, rutas sin cookie → 401.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Manage negotiators, their hours and exceptions`.

### Task 5: API del panel: ciclo de la visita, reserva y interés

**Files:**
- Modify: `server/routes/inbox.js`, `server/routes/listings.js` (`active_interest`), `server/routes/applicants.js` (sin cambios de consulta; solo si hace falta para estados nuevos)
- Test: `tests/server/admin.test.mjs` (ajustar las de visitas) y `tests/server/viewings-admin.test.mjs` (nuevo)

**Interfaces:**
- `GET /admin/viewings?tab=requests|upcoming|outcome|past&listing_id?`:
  - `requests`: `requested`, la más antigua primero.
  - `upcoming`: `confirmed` con `(date, end_time) >= ahora`, por fecha y hora.
  - `outcome`: `confirmed` con `(date, end_time) < ahora`, la más antigua primero.
  - `past`: `completed|no_show|cancelled`, la más reciente primero.
  - Cada fila con `listing_title` y `negotiator_name`; `counts` de las cuatro pestañas. LIMIT 500 como ahora. `listing_id` filtra (enlace desde la ficha).
- `POST /admin/viewings {listing_id?, negotiator_id, kind, date, time, name, email?, phone?, notes?}` → 201 `{id}`; `status 'confirmed'`, evento `viewing.booked`, sin aviso. Ficha: cualquiera existente (publicada o no). Mismo patrón atómico de Tarea 3; 409 si el hueco se ocupó.
- `PUT /admin/viewings/:id` con `notes` (como hoy) **o** `{action, …}`:
  - `confirm` (desde `requested`) → `confirmed`, evento, cierra el aviso.
  - `cancel` (desde `requested|confirmed`) → `cancelled`, evento, cierra el aviso.
  - `reschedule {negotiator_id, date, time}` (desde `requested|confirmed`) → mismo estado, evento `{from, to}`; atómico con `excludeId` = la propia cita; 409 si se ocupó.
  - `complete {outcome, outcome_note?}` (desde `confirmed`) y `no_show` (desde `confirmed`).
  - Transición no permitida → 409 `"This viewing is already <status>."`. Optimistic locking como en aplicantes: el cliente manda `updated_at`; si no coincide → 409.
- `GET /admin/listings/:id` añade `active_interest` (spec C10: emails distintos, `lower(email)`; filas sin email cuentan por teléfono).
- [ ] **Step 1: Write the failing tests**: cada pestaña con su orden y sus contadores (incluida una cita de hoy ya terminada en `outcome`); cada acción con su evento y su aviso; transiciones prohibidas; reprogramar al propio hueco y al contiguo (Review Focus 3); reserva del panel para hoy en una hora no pasada; carrera del panel → 409 sin escrituras; `active_interest` con dos citas del mismo email = 1, una `not_interested` = 0, una `proceed` de hace 31 días = 0.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Run a viewing from request to outcome in the panel`.

### Task 6: Panel: pantalla Availability

**Files:**
- Create: `admin/src/Availability.jsx`
- Modify: `admin/src/App.jsx` (ruta `#/availability`, entrada de barra «Availability»), `admin/src/styles.css`

**Interfaces:**
- Consumes: rutas de Tarea 4.
- Pantalla (DESIGN.md: tokens, botones, campos, estados vacíos y de error; teclado y foco visibles; 390 px sin scroll horizontal):
  - Lista de negociadores con nombre, cargo y estado (Active/Inactive), y «Add negotiator».
  - Al elegir uno: nombre, cargo, interruptor Active; tabla de 7 días con «Day off» o `<input type="time" step="1800">` desde–hasta; «Save hours».
  - «Exceptions»: lista próxima (fecha, Blocked all day / Blocked HH:MM–HH:MM / Open HH:MM–HH:MM, nota, Remove) y formulario para añadir.
  - `unsaved.js` protege cambios sin guardar como en el resto del panel.
- [ ] **Step 1:** Implementar. **Step 2:** `npm run build` sin avisos nuevos. **Step 3:** comprobar en navegador local (chrome-devtools o playwright-core `--no-sandbox`) a 1280×800 y 390×844: añadir negociador, cambiar horario, añadir y quitar excepción, consola limpia.
- [ ] **Step 4: Commit** `Add the Availability screen`.

### Task 7: Panel: Viewings, reserva, reprogramación e interés

**Files:**
- Modify: `admin/src/Viewings.jsx`, `admin/src/App.jsx` (la barra dice «Viewings»), `admin/src/ApplicantDetail.jsx` (Timeline: etiqueta del estado nuevo), `admin/src/ListingEditor.jsx` («Active interest: N» con enlace `#/viewings?listing=<id>` o el mecanismo de filtro que ya use el panel), `admin/src/styles.css`
- Create: `admin/src/SlotPicker.jsx` (negociador → día → hora, desde `GET /admin/availability`; usado por New viewing y Reschedule)

**Interfaces:**
- Consumes: rutas de Tareas 4 y 5.
- Pestañas Requests · Upcoming · Needs outcome · Past con contador; Upcoming agrupada por día (encabezado «Monday 26 October»).
- Detalle: lo actual + negociador, hora de fin, estado como badge (tonos de DESIGN.md: Requested = attention, Confirmed = ok, Completed/No-show/Cancelled = neutral), «N people interested», y las acciones válidas para su estado. Cancel con `confirm()`. Complete abre resultado (tres opciones) y motivo opcional.
- «New viewing»: formulario de C14 con `SlotPicker`; tras guardar, salta a Upcoming con la cita seleccionada.
- 409 → mensaje del servidor y recarga de huecos/lista.
- [ ] **Step 1:** Implementar. **Step 2:** `npm run build`. **Step 3:** navegador local a 1280×800 y 390×844: confirmar, reprogramar, cancelar, completar con resultado, no-show, reservar por teléfono, ver el interés en la ficha, foco tras cada acción, consola limpia.
- [ ] **Step 4: Commit** `Run viewings from the panel with real slots`.

### Task 8: Web pública: formulario con huecos reales

**Files:**
- Modify: `site/index.html` (`bookingForm`, `mountBooking`)
- Test: `tests/lib.test.js` o `tests/e2e.cjs` según dónde quede la lógica nueva

**Interfaces:**
- Consumes: `GET /api/availability`, `POST /api/viewings` (Tarea 3).
- El formulario pide la disponibilidad al montarse (una llamada para 12 días). Agentes = `negotiators` de la respuesta; foto y cargo de `TEAM` si el nombre coincide, si no solo nombre y cargo de la API. Días: los 12 de la respuesta; un día sin huecos libres para el agente elegido queda desactivado. Horas: las del agente y día elegidos; `booked` se ve como «Booked» y desactivada (sin datos de nadie). El primer día y la primera hora libres quedan marcados.
- Envía `negotiator_id`, `date`, `time`. En 409 muestra el mensaje, vuelve a pedir la disponibilidad y mantiene los datos tecleados.
- Si la API falla: el texto de C13 y el botón desactivado.
- Confirmación: igual que hoy, con el nombre del negociador.
- La lógica pura que se pueda separar (elegir primer libre, días desactivados) va a `site/lib.js` con su prueba en `tests/lib.test.js`.
- Accesibilidad: radios nativos, `aria-label` en días, «Booked» legible por lector («10:00, booked»).
- [ ] **Step 1: Write the failing tests** de la lógica pura en `tests/lib.test.js`. **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5:** navegador local con `wrangler pages dev` (o el servidor de pruebas de `tests/e2e.cjs`) a 1280×800 y 390×844: reservar desde la portada y desde una ficha; el hueco reservado aparece como Booked al reservar otra; consola limpia.
- [ ] **Step 6: Commit** `Book website viewings on real slots`.

### Task 9: Cierre de F3-A

**Files:**
- Modify: `tests/fixtures/seed.sql` (citas en cada estado, una excepción), `tests/e2e.cjs` (flujo de reserva pública y confirmación en el panel), `docs/roadmap/ESTADO.md` (fila F3: F3-A construida; F3-B pendiente de calendario y correo; revisar horarios sembrados; 0010 en remoto después de la 0009)

- [ ] **Step 1:** Prueba de concurrencia en el motor real de D1 local (`wrangler pages dev` con la base local): 10 `POST /api/viewings` simultáneos al mismo hueco (Turnstile de prueba de Cloudflare) → exactamente un 201. Script en el scratchpad, no en el repo; el resultado va al ledger.
- [ ] **Step 2:** Revisión del diff de F3-A con `security-best-practices`, `frontend-security-coder`, `web-performance-optimization`, `antislop`, `ponytail-review` y accesibilidad (DESIGN.md); una ronda de arreglos; `npm test`.
- [ ] **Step 3:** E2E en local (chrome-devtools MCP o playwright-core con `--no-sandbox`) a 1280×800 y 390×844: reserva pública → Inbox → Requests → Confirm → Upcoming; Availability; New viewing; consola limpia. `node tests/e2e.cjs` → PASS.
- [ ] **Step 4:** Commit `Close F3-A`. El despliegue va con la Entrega 2 (spec F3-A §7).
