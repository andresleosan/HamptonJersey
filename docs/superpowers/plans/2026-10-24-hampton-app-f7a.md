# Hampton App F7-A: Insights en el panel · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la web cuente sin datos personales las aperturas de cada ficha y que el panel muestre en Insights la demanda sin cubrir, las fichas más vistas, el embudo y los tiempos del equipo.

**Architecture:** Igual que F0/F1-A/F3-A. Migración 0011 (`daily_stats`). Un POST público que incrementa un contador en una sola sentencia. Cálculos puros en `server/insights.js` (nuevo) y una ruta de panel `GET /admin/insights` en `server/routes/insights.js` (nuevo) que lee con un batch de D1. Pantalla `admin/src/Insights.jsx` (nueva).

**Tech Stack:** Pages Functions + D1 · React 19 + Vite (panel) · sitio público vanilla (`site/index.html`) · Node 24 `node:test` + `node:sqlite`.

**Spec:** `docs/superpowers/specs/2026-10-24-hampton-app-f7a-design.md` (decisiones I1–I13; mandan). Bases: specs de F0, F1-A y F3-A. Diseño: `DESIGN.md`.

## Global Constraints

- Las Global Constraints del plan F0 (`docs/superpowers/plans/2026-10-23-hampton-app-f0.md`) siguen valiendo íntegras (inglés en la UI, un solo rol, NULL nunca 0, consultas con parámetros, sin `dangerouslySetInnerHTML`, sin dependencias nuevas, nada «para después», `main` y commit por tarea, push solo con el sí de Luis y nunca `--remote` desde la sesión).
- «Hoy» es la fecha de Jersey: `jerseyToday()` de `server/viewings.js`, nunca UTC. Los periodos se comparan como cadenas `YYYY-MM-DD`; para columnas ISO UTC (`created_at`, `at`) el límite es el inicio del primer día del periodo en hora de Jersey, convertido a ISO UTC.
- Nada personal en `daily_stats`, en la respuesta de `/admin/insights` ni en el navegador (ni `localStorage` ni `sessionStorage`): solo ids de ficha, recuentos y medianas.
- «Activo» = `activeSql("a")` de `server/applicants.js`. «Disponible» = `CANDIDATES_SQL` de `server/match-store.js` + `archived_at IS NULL` + la operación (`rent`↔`rent`, `buy`↔`sale`). Se importan, no se copian.
- Cada petición cabe en 10 ms de CPU: `/admin/insights` hace un solo `env.DB.batch` y agrega en JS sobre filas ya reducidas (nunca el texto de fichas ni `checks` de matches).

## Review Focus

1. **Matches sobre casas archivadas** (importación de agencias, 264 archivadas con `matchable = 1`): no sacan a un aplicante de «sin coincidencias» → prueba en Tarea 3.
2. **Aplicante que llegó a Offer y luego pasó a Lost**: cuenta en Viewing y Offer y en Lost → prueba en Tarea 3.
3. **Guardar una ficha** genera `applicant.matched` con un actor del equipo: no cuenta como atención en el tiempo (a) → prueba en Tarea 3.
4. **El contador falla o tarda** (red caída, 4xx/5xx): la ficha se pinta igual y no hay error en consola sin capturar → prueba en Tarea 2.
5. **Periodo y medianoche de Jersey**: una vista a las 00:30 BST cuenta en el día de Jersey, no en el UTC anterior → prueba en Tarea 1.

---

### Task 1: Migración 0011 y `POST /api/stats`

**Files:**
- Create: `migrations/0011_daily_stats.sql`
- Modify: `server/routes/public.js`
- Test: `tests/server/schema.test.mjs` (añadir), `tests/server/stats.test.mjs` (nuevo)

**Interfaces:**
- Produces: tabla `daily_stats` exactamente como en spec §3 (comentario de una línea encima). `POST /api/stats` con cuerpo `{listing_id, metric}`: `metric ∈ STAT_METRICS = ["view","photos","tour"]` (exportada desde `server/routes/public.js` o un módulo que ya exista; no un archivo nuevo solo para eso); `listing_id` con forma `/^HE-[A-Z]\d{3,}$/`. Una sentencia: `INSERT INTO daily_stats (day, listing_id, metric, n) SELECT ?, id, ?, 1 FROM listings WHERE id = ? AND published = 1 AND archived_at IS NULL ON CONFLICT DO UPDATE SET n = n + 1`. `day = jerseyToday()`. Respuesta 204 sin cuerpo (cuente o no); 400 `{error}` si el cuerpo no es válido.
- [ ] **Step 1: Write the failing tests**:
  - `test("0011: daily_stats refuses unknown metrics and negative counts")` y que borrar la ficha borra sus filas.
  - `test("stats: a published listing counts once per call, per Jersey day")`: dos POST → una fila con `n = 2`.
  - `test("stats: drafts, archived and unknown listings are not counted but answer 204")`.
  - `test("stats: bad metric or id is 400")`.
  - `test("stats: cross-origin POST is 403")` (`call(..., { origin: "https://evil.test" })`).
  - `test("stats: the day is Jersey's")`: con el reloj en `2026-07-01T23:30:00Z` (00:30 BST) → `day = '2026-07-02'`. Usa la técnica de reloj que ya usen las pruebas de `viewings.test.mjs` (mock de `Date` de `node:test`).
- [ ] **Step 2: Run** `node --test tests/server/stats.test.mjs tests/server/schema.test.mjs` → FAIL.
- [ ] **Step 3: Implement** la migración y la ruta.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Count listing views, gallery and tour opens per day`.

### Task 2: La web avisa

**Files:**
- Modify: `site/index.html`
- Test: `tests/e2e.cjs` (añadir), `tests/fixtures/seed.sql` (filas de `daily_stats` con fechas relativas a hoy, para la Tarea 4)

**Interfaces:**
- Consumes: `POST /api/stats` (Tarea 1).
- Produces: `track(id, metric)` en `site/index.html`: si `id + metric` ya está en un `Set` en memoria no hace nada; si no, lo añade y llama `fetch("/api/stats", {method: "POST", keepalive: true, headers: {"content-type": "application/json"}, body})` con `.catch(() => {})`. Llamadas: `view` al pintar la ficha (`#/p/<id>`); `photos` al abrir el `dialog` `#lightbox`; `tour` al mostrar el tour en la ficha (pestaña «3D tour» o botón «Open the 3D tour», el que llegue primero).
- [ ] **Step 1: Write the failing e2e checks** (en `publicSite`): al abrir una ficha publicada sale un `POST /api/stats` con `metric: "view"`; volver a la portada y a la misma ficha no manda otro; abrir la galería manda `photos`; con `/api/stats` abortado (`page.route(... route.abort())`) la ficha se pinta y no hay `pageerror`.
- [ ] **Step 2: Implement** `track` y sus tres llamadas. Ningún cambio visible.
- [ ] **Step 3: Seed** en `tests/fixtures/seed.sql` filas de `daily_stats` para dos fichas publicadas del seed en `date('now','-1 day')` y `date('now','-40 day')` (para que 30 y 90 días den cifras distintas).
- [ ] **Step 4: Run** `npm test` → PASS y el e2e completo según la receta de la cabecera de `tests/e2e.cjs` → `e2e OK`.
- [ ] **Step 5: Commit** `Send listing view, gallery and tour counts from the website`.

### Task 3: Cálculos y `GET /admin/insights`

**Files:**
- Create: `server/insights.js`, `server/routes/insights.js`
- Modify: `server/api.js` (registrar las rutas)
- Test: `tests/server/insights.test.mjs` (nuevo)

**Interfaces:**
- Consumes: `activeSql`, `CANDIDATES_SQL`, `jerseyToday`, `plusDays`, `daily_stats`.
- Produces: `GET /admin/insights?days=7|30|90` (admin; otro valor → 400 `Choose 7, 30 or 90 days`; sin `days` → 30). Respuesta (los nombres de dentro son del implementador, pero estos bloques existen):
  - `period: {days, from, to}` (fechas de Jersey, `to` = hoy).
  - `totals: {views, viewing_requests, new_applicants, viewings_completed}` del periodo (`viewings_completed` = `viewing_requests` con `status = 'completed'` y `date` en el periodo).
  - `demand: {rent: rows, buy: rows}`; cada fila `{parish, applicants, unmatched, median_budget, listings}` con `parish` = una de las 12, `"Anywhere"` o `"Parish unknown"` (I6); filas con todo a cero fuera; orden: las 12 alfabéticas, luego Anywhere, luego Parish unknown.
  - `unmet: [{operation, parish, bedrooms_min, applicants, median_budget}]`, máximo 10, por `applicants` desc y luego `operation`, `parish`, `bedrooms_min` (I7).
  - `views: {first_day, rows: [{listing_id, title, views, photos, tour, viewings}]}` (top 10 por vistas del periodo; `first_day` = el `day` más antiguo de toda la tabla o null).
  - `funnel: {registered, viewing, offer, agreed, completed, lost}` (I10).
  - `times: {attend, viewing_reply, first_review}`, cada uno `{median_hours, cases, waiting}`; `median_hours` null sin casos (I11).
- Funciones puras exportadas desde `server/insights.js`, con sus pruebas: `median(nums)` (null si vacía), `reachedStages(currentStage, stageHistory)` → conjunto de etapas del embudo alcanzadas con las anteriores implícitas, `groupDemand(applicants, listings)` y `topUnmet(applicants)`.
- [ ] **Step 1: Write the failing tests**:
  - Puras: `median([])` null, impar, par; `reachedStages("lost", ["viewing","offer"])` contiene viewing y offer y no agreed; `reachedStages("agreed", [])` contiene viewing, offer, agreed.
  - Ruta, con datos sembrados por la prueba (contactos, aplicantes con parroquias, fichas disponibles y archivadas, matches, eventos, visitas, `daily_stats`): cifras exactas de cada bloque; Review Focus 1 (match `found` solo sobre ficha archivada → sigue en `unmatched`); Review Focus 2; Review Focus 3 (`applicant.matched` del equipo no cierra la espera de (a)); un aplicante con dos parroquias cuenta en las dos filas; `days=15` → 400; sin cookie → 401; la respuesta no contiene ningún nombre, email ni teléfono sembrado (`JSON.stringify` no los incluye).
- [ ] **Step 2: Run** `node --test tests/server/insights.test.mjs` → FAIL.
- [ ] **Step 3: Implement** con un solo `env.DB.batch`. Las consultas devuelven columnas mínimas (ids, etapa, operación, parroquias JSON, `bedrooms_min`, `budget_max`, tiempos), nunca nombres.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Add the insights figures to the admin API`.

### Task 4: Pantalla Insights

**Files:**
- Create: `admin/src/Insights.jsx`
- Modify: `admin/src/App.jsx` (enlace después de Viewings y la ruta `#/insights`), `admin/src/styles.css`
- Test: `tests/e2e.cjs` (añadir en `admin`)

**Interfaces:**
- Consumes: `GET /admin/insights` (Tarea 3); `show("budget_max", v)` de `admin/src/format.js` para importes, con « a month» en alquiler (como `Review.jsx`); enlace a la ficha `#/p/<id>`.
- Produces: la pantalla de spec §5 en ese orden. Selector de periodo con tres botones (`aria-pressed`) que recargan. Cada bloque con su línea de origen y su estado vacío (I9 para vistas). Barras del embudo con CSS (ancho proporcional al registrado, la cifra siempre visible como texto). Tiempos: horas si < 48, días con un decimal si no; «—» sin casos; «N waiting» si hay.
- [ ] **Step 1: Write the failing e2e check**: entrar en Insights, ver las cuatro cifras, la fila de una parroquia del seed en Unmet demand, la ficha sembrada en Most viewed con sus vistas, pasar de 30 a 90 días y ver que las vistas cambian; la vista contada en la Tarea 2 por el propio e2e aparece.
- [ ] **Step 2: Implement** la pantalla.
- [ ] **Step 3: Check in the browser** a 1280×800 y 390×844 (playwright-core con `--no-sandbox`): sin scroll horizontal de página, la barra de navegación en una línea a 1280, tablas legibles en móvil (scroll dentro de la tabla, no de la página), estado vacío con una base sin datos.
- [ ] **Step 4: Run** `npm test`, `npm run build` del panel y el e2e completo → PASS / `e2e OK`.
- [ ] **Step 5: Commit** `Add the Insights screen to the panel`.

### Task 5: Cierre

**Files:**
- Modify: `docs/roadmap/ESTADO.md`

- [ ] **Step 1:** Fila F7 de ESTADO.md: F7-A construida, sale con la Entrega 2; al desplegar, `0011` en remoto después de la `0010` y antes del push; la regla WAF pendiente incluye `POST /api/stats` (I4); F7-B pendiente (resumen semanal por email, Cloudflare Web Analytics, que Luis puede activar ya en el panel de Cloudflare).
- [ ] **Step 2: Commit** `Close F7-A`.
