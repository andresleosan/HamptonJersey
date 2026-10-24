# Hampton App F5-A: alquileres gestionados · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el equipo lleve en el panel cada vivienda gestionada, su propietario, su contrato, sus cobros (a mano o desde el CSV del banco), los atrasos, los plazos legales, las renovaciones, las reparaciones y la liquidación mensual.

**Architecture:** Igual que F3-C. Migración 0013. Reglas puras en `server/rentals.js` (nuevo). Rutas de panel en `server/routes/rentals.js` (propietarios, viviendas, obligaciones, reparaciones, ajustes) y `server/routes/rent.js` (contratos, cobros, pagos, importación, atrasos, liquidación), registradas en `server/api.js`. Saldos y atrasos en SQL. Pantallas `admin/src/Rentals.jsx`, `RentalDetail.jsx`, `RentImport.jsx`, `Statement.jsx` (nuevas) y el menú Settings en `App.jsx`.

**Tech Stack:** Pages Functions + D1 · React 19 + Vite · Node 24 `node:test` + `node:sqlite` · e2e con playwright-core contra `wrangler pages dev`.

**Spec:** `docs/superpowers/specs/2026-10-24-hampton-app-f5a-design.md` (decisiones R1–R30; mandan). Bases: specs de F0, F3-C y F7-A. Diseño: `DESIGN.md`.

## Global Constraints

- Las Global Constraints del plan F0 (`docs/superpowers/plans/2026-10-23-hampton-app-f0.md`) siguen valiendo íntegras: inglés en la UI y en la API, un solo rol, NULL nunca 0, consultas con parámetros, sin `dangerouslySetInnerHTML`, sin dependencias nuevas, nada «para después», `main` y un commit por tarea, push solo con el sí de Luis y nunca `--remote` desde la sesión.
- «Hoy», «este mes» y los días de atraso, en hora de Jersey: `jerseyToday()` de `server/viewings.js` y `jerseyDayStart` de `server/insights.js`, importados, no copiados. Fechas `YYYY-MM-DD` comparadas como texto.
- Dinero: libras enteras en rentas, depósitos, presupuestos y costes; **peniques** (`INTEGER`) en `charges.amount` y `payments.amount`. Nunca `REAL` para dinero.
- Todos los plazos legales y la secuencia de atraso viven **solo** en constantes de `server/rentals.js` (R8, R10, R13, R24, R30). El panel los recibe en las respuestas, no los repite.
- Toda escritura va en **un solo** `env.DB.batch` con su `rental_events`. Las transiciones son condicionales en SQL. Las ediciones de formulario llevan bloqueo por `updated_at` (el patrón `LOCK` exportado de `server/routes/applicants.js`).
- Saldos, cobro impagado más antiguo, días de atraso y siguiente paso se calculan **en SQL** (funciones de ventana sobre `charges` y `payments` de tipo `rent`), nunca recorriendo todas las filas en JS (R2). `GET /admin/rentals` es un solo batch y cabe en 10 ms de CPU con 300 contratos y 2 años de cobros.
- Datos de inquilinos y propietarios solo en respuestas de `/admin`; nada en `localStorage` ni `sessionStorage` (el CSV se lee en memoria y no se guarda).

## Review Focus

1. **El mismo extracto importado dos veces, o un pago marcado a mano que luego llega en el CSV**: ni un penique duplicado (R9, R25) → pruebas en la Tarea 4.
2. **Contrato que empezó en 2023 dado de alta hoy con `collect_from` este mes**: sin atrasos fantasma; con saldo inicial, un solo cobro `opening` → pruebas en la Tarea 3.
3. **Pagos parciales que cruzan meses**: el atraso cuenta desde el cobro más antiguo no cubierto (FIFO) y la secuencia se reinicia al cubrirlo (R27) → pruebas en la Tarea 4.
4. **`due_day` 28, febrero y medianoche de Jersey en BST**: un cobro vence el día de Jersey correcto y no se genera dos veces → pruebas en la Tarea 3.
5. **CSV hostil o raro**: importes «£1,234.56», «-50.00», columna «Paid in» vacía, fechas inválidas, celdas que empiezan por `=`, 2.001 filas, cabeceras repetidas. Se rechazan o se ignoran con un motivo claro y nunca se ejecuta ni se muestra como HTML → pruebas en las Tareas 4 y 8.

---

### Task 1: Migración 0013 y reglas puras

**Files:**
- Create: `migrations/0013_rentals.sql`, `server/rentals.js`
- Test: `tests/server/schema.test.mjs` (añadir), `tests/server/rentals-rules.test.mjs` (nuevo)

**Interfaces:**
- Produces: las tablas de spec §3 con sus `CHECK` (enums, rangos de R20, `end_on` obligatorio en `fixed`, `due_day` 1–28, `fee_percent` 0–100, importes en peniques > 0, `opening_balance` ≥ 0), claves foráneas (`rentals.landlord_id` y `tenancies.rental_id` sin cascada; `charges`, `arrears_steps`, `compliance_items` y `rent_changes` en cascada con su padre), índices de spec §3 (incluido el único parcial de contrato activo y el parcial de pagos sin emparejar).
- Produces en `server/rentals.js`:
  - `LEGAL`: `{ depositDays: 30, reportDays: 7, licenceYears: 2, eicrYears: 5, gasYears: 1, alarmsYears: 1, warnDays: [60, 30, 7], renewalDays: 90, rentNoticeMonths: 2, rentIntervalMonths: 12, regime2025From: "2026-04-15", tenantNoticeMonths: 1, landlordNoticeMonths: 12 }`.
  - `ARREARS_STEPS`: `[[1,"reminder","Friendly reminder"],[5,"firm","Firm reminder"],[7,"call","Call the tenant"],[10,"landlord","Tell the landlord"],[14,"letter","Formal letter"]]`.
  - `COMPLIANCE`: `[["licence","Rental dwelling licence",2],["eicr","Electrical safety (EICR)",5],["gas","Gas safety",1],["alarms","Smoke and CO alarms",1]]`.
  - `paymentRef(id) → "HE-T0042"` y `REF_RE = /HE-?T\s*(\d{4,})/i`.
  - `addMonths(date, n) → "YYYY-MM-DD"`: fin de mes con tope, así que 31-ene + 1 mes da 28-feb o 29-feb.
  - `nextStep(daysLate, doneKeys) → [days, key, label] | null` (R27: el último debido no hecho).
  - `complianceStatus(item, today) → "ok" | "due60" | "due30" | "due7" | "overdue" | "missing"`.
  - `rentAssistant(tenancy, rpi, today) → { applies, max_rent, earliest_on, notes }` (R12, R30).
  - `earliestMoveOut(tenancy, notice) → "YYYY-MM-DD"` (R13).
  - `validateLandlord`, `validateRental`, `validateTenancy`, `validateRepair`, `validatePayment` → `{ value } | { errors }`. Mismo estilo que `server/sales.js`; solo validan las claves enviadas cuando `partial`.
  - `parseMoney(text) → pence | null`. Acepta «£1,234.56», «1234.5» y «-50». Devuelve null si no es un número.
  - `parseBankDate(text, format) → "YYYY-MM-DD" | null`. Formatos `DMY` y `ISO`; null si la fecha no es real.
- [ ] **Step 1: Write the failing tests**:
  - `test("0013: one active tenancy per property; ended ones don't count")`.
  - `test("0013: a fixed tenancy needs an end date and due_day must be 1-28")`.
  - `test("0013: a charge is unique per tenancy, due date and kind; an import hash only once")`.
  - `test("addMonths: 31 Jan + 1 is the last day of February, leap years included")`.
  - `test("nextStep: day 0 none; day 6 firm; day 15 letter even if nothing was done; done letter → null")`.
  - `test("complianceStatus: missing, overdue, 7/30/60-day warnings and ok")`.
  - `test("rentAssistant: 2025 tenancy caps at RPI and waits 12 months and 2 months' notice; 2011 tenancy does not apply")`.
  - `test("parseMoney and parseBankDate: pounds, commas, minus, junk and impossible dates")`.
- [ ] **Step 2: Run** `node --test tests/server/schema.test.mjs tests/server/rentals-rules.test.mjs` → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Add the managed rentals tables`.

### Task 2: Propietarios, viviendas, obligaciones y ajustes

**Files:**
- Create: `server/routes/rentals.js`
- Modify: `server/api.js`
- Test: `tests/server/rentals.test.mjs` (nuevo)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - Propietarios y viviendas:
    - `POST/GET /admin/landlords`, `GET/PUT /admin/landlords/:id`, `POST /admin/landlords/:id/{archive,restore}`. Archivar se rechaza (409) si el propietario tiene viviendas sin archivar.
    - `POST /admin/rentals`: crea la vivienda y sus filas de `compliance_items` (`gas` solo si `has_gas` no es 0) en el mismo batch.
    - `GET/PUT /admin/rentals/:id`. Cambiar `has_gas` a 1 crea la fila `gas` si falta.
    - Pasar de `let_only` a `full` con un contrato activo exige `collect_from` en el cuerpo (R22) y lo guarda en el contrato en el mismo batch.
    - `POST /admin/rentals/:id/{archive,restore}`. Archivar se rechaza (409) con contrato activo o reparaciones abiertas.
  - `PUT /admin/rentals/:id/compliance/:kind` con `{done_on, expires_on?, note?}`. Si no llega `expires_on`, es `done_on` + el periodo de `COMPLIANCE`.
  - Ajustes:
    - `GET/PUT /admin/settings/rpi` `{percent, as_of}` (0–30 %, con dos decimales);
    - `GET/PUT /admin/settings/gst` `{percent}` (0–30);
    - `GET/PUT /admin/settings/csv-map?header=<huella>` (huella SHA-256 de la cabecera, calculada en el cliente).
  - Un helper `rentalEvent(env, {rental_id, tenancy_id?, actor, type, data})` que devuelve la sentencia. Lo reutilizan las Tareas 3–5.
  - Cada escritura deja su evento: `landlord.created`, `landlord.updated`, `rental.created`, `rental.updated`, `rental.archived`, `compliance.updated`, etc.
- [ ] **Step 1: Write the failing tests**:
  - `test("rental: creating one adds its compliance rows; no gas row when has_gas is 0")`.
  - `test("rental: a stale updated_at is 409 and nothing changes")`.
  - `test("rental: switching to full with an active tenancy needs collect_from")`.
  - `test("rental: archive refused with an active tenancy or open repairs; landlord archive refused with active properties")`.
  - `test("compliance: done_on sets expires_on from the period; an explicit expires_on wins")`.
  - `test("settings: RPI and GST out of range are 400; csv-map round-trips by header")`.
  - `test("rentals routes: signed out 401, cross-origin 403")`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Add landlords, properties and compliance`.

### Task 3: Contratos y cobros

**Files:**
- Create: `server/routes/rent.js`
- Modify: `server/api.js`
- Test: `tests/server/tenancies.test.mjs` (nuevo)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `ensureCharges(env, today, tenancyId?) → stmt`. Una sola sentencia idempotente (CTE recursiva de meses) que inserta los cobros `rent` que falten de los contratos `full` con `collect_from`:
    - el primero vence en `collect_from` y los siguientes el `due_day` de cada mes (R23);
    - llega hasta el mes siguiente a hoy, sin pasar de `ended_on`;
    - pasado `end_on` sigue cobrando mientras no haya `ended_on` (R24);
    - el importe es la renta vigente en cada fecha según `rent_changes`;
    - va con `ON CONFLICT DO NOTHING`.
  - `POST /admin/rentals/:id/tenancies`:
    - crea el contrato (409 si ya hay uno activo) con su `payment_ref`, que se fija en el mismo batch a partir del id insertado;
    - crea un `rent_changes` inicial con `effective_on` = inicio;
    - crea el cobro `opening` si hay saldo inicial y los cobros con `ensureCharges`;
    - escribe el evento `tenancy.created`.
  - `PUT /admin/tenancies/:id` (datos, con bloqueo). No cambia la renta ni las fechas de cobro.
  - `PUT /admin/charges/:id` `{amount}` (en peniques): corrige un cobro, lo marca `edited` y escribe evento (R23).
  - Cambios de renta y renovación:
    - `POST /admin/tenancies/:id/rent` `{rent, effective_on}` sigue R28;
    - `POST /admin/tenancies/:id/renew` `{kind, end_on?, rent?, effective_on?}` sigue R24: el régimen pasa a `2025` si la renovación es posterior a `LEGAL.regime2025From`.
  - Preaviso y fin:
    - `POST /admin/tenancies/:id/notice` `{given_on, by}` responde con `earliestMoveOut`;
    - `POST /admin/tenancies/:id/end` `{ended_on}`, que puede ser una fecha futura.
  - `GET /admin/tenancies/:id` devuelve:
    - el contrato, sus cobros y pagos de los últimos 24 meses y su saldo;
    - `arrears` (deuda, cobro más antiguo, días, siguiente paso, pasos hechos);
    - `assistant` (con el RPI guardado) y los plazos del contrato (depósito y los dos inventarios, con su estado).
- [ ] **Step 1: Write the failing tests**:
  - `test("tenancy: payment reference HE-T plus four digits, unique")`.
  - `test("charges: generated from collect_from to next month, once, even if called twice")`.
  - `test("charges: a 2023 tenancy collected from this month has no backlog; an opening balance is one charge")`.
  - `test("charges: due_day 28 in February and a BST midnight land on the right Jersey day")`.
  - `test("charges: stop at ended_on; continue past end_on while the tenant stays")`.
  - `test("rent change: only future charges not edited by hand take the new rent; past effective date is 400")`.
  - `test("renew: same reference, new end or periodic, regime 2025 after 15 April 2026")`.
  - `test("let_only: no charges at all")`.
  - `test("second active tenancy on a property is 409; after a future ended_on the next one can be created")`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Add tenancies and monthly charges`.

### Task 4: Pagos, importación y atrasos

**Files:**
- Modify: `server/routes/rent.js`
- Test: `tests/server/payments.test.mjs` (nuevo)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `ARREARS_SQL` (CTE exportada) que, por contrato `full` activo, da `balance` en peniques (cobros vencidos menos pagos `rent`), `oldest_unpaid_on` (FIFO con `SUM() OVER (ORDER BY due_on)` frente al total pagado) y `days_late` (hoy de Jersey menos esa fecha). La usan la Tarea 5 y el `GET` de contrato.
  - `POST /admin/payments` `{tenancy_id, received_on, amount, kind, description?}` (manual).
  - `PUT /admin/payments/:id` `{tenancy_id?, kind?}`: asignar un pago sin emparejar a un contrato `full` o cambiar su tipo, con evento.
  - `POST /admin/payments/import` `{rows: [{date, amount, description, n}], dry_run}`:
    - entran como máximo 2.000 filas ya convertidas por el cliente: fecha ISO, importe en peniques y `n` = número de aparición de esa misma fila en el archivo;
    - el servidor revalida cada fila y descarta las de importe ≤ 0 contándolas como «ignored»;
    - calcula `import_hash` = SHA-256 de `date|amount|description|n` con `crypto.subtle`;
    - empareja por `REF_RE` con contratos `full` (R9) y aplica R25;
    - `dry_run` responde `{matched, unmatched, duplicate, by_hand, ignored, rows: [{…, status, payment_ref}]}` sin escribir;
    - sin `dry_run` inserta en un solo batch (`INSERT … ON CONFLICT(import_hash) DO NOTHING`) con un evento de resumen por contrato.
  - `PUT /admin/tenancies/:id/arrears/:due_on/:step` `{note?}` marca un paso hecho (R27). Solo vale si `due_on` es el cobro impagado más antiguo y el paso ya es debido; si no, 409.
- [ ] **Step 1: Write the failing tests**:
  - `test("FIFO: a partial payment covers the oldest charge first; days late count from the oldest uncovered one")`.
  - `test("arrears: the next step is the latest due one; marking it done; a full payment clears it")`.
  - `test("arrears: a partial payment that covers the oldest charge restarts the sequence on the next one")`.
  - `test("import: dry run counts matched, unmatched, ignored without writing")`.
  - `test("import: the same file twice adds nothing; two identical rows in one file are two payments")`.
  - `test("import: a row matching a manual payment of the same amount within 7 days takes its place")`.
  - `test("import: a reference of a let_only or unknown tenancy is unmatched; assigning it later counts")`.
  - `test("import: 2001 rows is 400; a cell starting with = is stored as plain text")`.
  - `test("deposit and other payments don't reduce arrears")`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Add payments, bank import and arrears`.

### Task 5: Reparaciones, liquidación, pantalla de datos y contador

**Files:**
- Modify: `server/routes/rentals.js`, `server/routes/rent.js`, `server/routes/notifications.js` (`openCounts`)
- Test: `tests/server/rentals-overview.test.mjs` (nuevo)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - Reparaciones (R14):
    - `POST /admin/rentals/:id/repairs` y `PUT /admin/repairs/:id` con transiciones condicionales;
    - un presupuesto por encima del `approval_limit` del propietario fuerza `awaiting_approval` antes de `approved`;
    - el estado `done` exige `done_on` y `cost`;
    - cada cambio escribe su evento.
  - `GET /admin/statements?landlord=<id>&month=YYYY-MM` (R15, R26, R29) devuelve `{landlord, month, rentals: [{address, rent_received, fee, repairs: [...], other_received}], totals: {rent, fee, gst, repairs, net}}`, todo en peniques. Las fechas siguen el calendario de Jersey.
  - `GET /admin/rentals?q=&service=&filter=&archived=` devuelve:
    - `todo`: `{arrears, compliance, renewals, repairs, unmatched}`. Arrears solo con un paso debido. Compliance incluye las del contrato y lo «missing». Renewals incluye «Renewal due» y «Fixed term ended».
    - `rentals`: la lista con `landlord_name`, `tenant_name`, `rent`, `balance` y las marcas.
    - `totals`.
    
    Todo en un solo batch, que empieza con `ensureCharges(env, today)`.
  - `openCounts` añade `rentals` según R16 con una sola sentencia más; `action` no cambia.
- [ ] **Step 1: Write the failing tests**:
  - `test("repair: a quote above the landlord's limit needs approval; done needs date and cost")`.
  - `test("statement: rent received in the Jersey month, fee, GST when set, repairs charged, net; deposits apart")`.
  - `test("overview: to-do lists arrears due today, compliance within 60 days or missing, renewals at 90 days, open emergencies first")`.
  - `test("overview: search by tenant name, payment reference and address; filters")`.
  - `test("counts: rentals adds overdue items and unmatched payments; action unchanged")`.
  - `test("overview: 300 tenancies with two years of charges in under 10 ms of handler CPU")`: una medición en el doble de D1, que da una referencia. Si queda por encima, se apunta como riesgo en el informe.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `Add repairs, statements and the rentals overview`.

### Task 6: Barra con Settings y pantalla Rentals

**Files:**
- Create: `admin/src/Rentals.jsx`
- Modify: `admin/src/App.jsx` (Rentals después de Sales con `counts.rentals`; menú **Settings** con Availability, 3D tours y Users, R17; rutas `#/rentals`, `#/rentals/new`, `#/rentals/landlords/<id>`), `admin/src/styles.css`
- Test: `tests/e2e.cjs` (añadir), `tests/fixtures/seed.sql` (un propietario `full` con vivienda, contrato con atraso y obligación vencida; un `let_only` con contrato a 60 días de su fin)

**Interfaces:**
- Consumes: rutas de las Tareas 2–5; patrones de `Sales.jsx`, que se reutilizan importándolos: Modal, dinero, `Received`.
- Produces:
  - el menú Settings: botón con `aria-expanded`/`aria-controls`; Escape y el clic fuera lo cierran y el foco vuelve al botón; con `aria-current` cuando la página actual está dentro;
  - Rentals según spec §4: bloques «To do», con «Mark done» de atraso y «Assign» de pago sin emparejar en diálogo;
  - la lista con búsqueda y filtros, con búsqueda diferida como en Record offer;
  - los formularios New landlord y New property (con propietario existente o nuevo) en diálogo o página, y la ficha de propietario con barra Save/Discard;
  - estados vacíos y de error en cada bloque.
- [ ] **Step 1: Write the failing e2e check**:
  - la barra va en una línea a 1280 con contadores de dos cifras en Inbox, Sales y Rentals (con la respuesta de counts simulada), y el menú Settings funciona con el teclado;
  - Rentals muestra el atraso del seed con su siguiente paso, y «Mark done» lo hace avanzar;
  - la obligación vencida del seed aparece y suma en el contador;
  - New landlord + New property funcionan y la vivienda aparece en la lista.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Check in the browser** a 1280×800 y 390×844: sin scroll horizontal de página; el menú usable en el móvil.
- [ ] **Step 4: Run** `npm test`, `npm run build` y el e2e completo resembrado → PASS y `e2e OK`.
- [ ] **Step 5: Commit** `Add the Rentals screen and the Settings menu`.

### Task 7: Ficha de la vivienda

**Files:**
- Create: `admin/src/RentalDetail.jsx`
- Modify: `admin/src/App.jsx` (`#/rentals/<id>`), `admin/src/styles.css`
- Test: `tests/e2e.cjs` (añadir)

**Interfaces:**
- Consumes: `GET/PUT /admin/rentals/:id`, `GET /admin/tenancies/:id` y las acciones de las Tareas 2–5.
- Produces: la ficha de spec §4:
  - datos con Save/Discard;
  - el contrato con su referencia de pago bien visible, saldo, atraso con su paso, y cobros y pagos recientes (con corrección de un cobro);
  - los diálogos Record payment, Change rent con el asistente (R12, R30, y el RPI editable ahí), Renew, Record notice (con la salida más temprana) y End tenancy;
  - New tenancy cuando no hay contrato activo, con `collect_from` y saldo inicial, explicados en una línea («For tenancies already running, collect from the next rent day and enter what is owed today.»);
  - obligaciones con Update y estado coloreado según `DESIGN.md`;
  - reparaciones con New repair y su ciclo;
  - contratos anteriores plegados e historial.
  
  En el móvil, el contrato y el to-do van primero.
- [ ] **Step 1: Write the failing e2e check**: en la vivienda del seed:
  - Record payment parcial: el saldo baja y los días de atraso pasan al siguiente cobro;
  - Change rent con el asistente: la renta máxima y la fecha se muestran, y aplicar crea el cambio;
  - una reparación con presupuesto por encima del límite pide aprobación y se completa;
  - New tenancy en una vivienda libre con `collect_from` este mes no crea atrasos.
- [ ] **Step 2: Implement.** **Step 3: Check in the browser** a 1280×800 y 390×844.
- [ ] **Step 4: Run** `npm test`, `npm run build` y el e2e completo → PASS y `e2e OK`.
- [ ] **Step 5: Commit** `Add the property page`.

### Task 8: Importar el CSV del banco y liquidación imprimible

**Files:**
- Create: `admin/src/RentImport.jsx`, `admin/src/Statement.jsx`
- Modify: `admin/src/App.jsx` (`#/rentals/import`, `#/rentals/statements`), `admin/src/styles.css` (`@media print`)
- Test: `tests/e2e.cjs` (añadir), `tests/fixtures/bank.csv` (nuevo, datos inventados)

**Interfaces:**
- Consumes: `POST /admin/payments/import`, `GET/PUT /admin/settings/csv-map`, `GET /admin/statements`.
- Produces:
  - un lector de CSV mínimo en el cliente (comillas, comas dentro de comillas, CRLF, BOM), sin dependencias, con tope de 1 MB;
  - la elección de columnas con muestra de 5 filas, recordada por la huella de la cabecera;
  - la conversión con `parseMoney`/`parseBankDate`, compartidas (`admin` puede importar de `server/rentals.js` como ya hace con `server/sales.js`);
  - el resumen del `dry_run` por estado y luego Import;
  - tras importar, enlace a los pagos sin emparejar de Rentals;
  - la liquidación con selector de propietario `full` y mes, totales, y el botón Print (`window.print()`). La impresión oculta barra, botones y menú.
- [ ] **Step 1: Write the failing e2e check**:
  - importar `tests/fixtures/bank.csv` (una fila que empareja, una sin referencia, un cargo negativo, una fila repetida) muestra el resumen correcto;
  - importar escribe y el contrato baja su saldo;
  - reimportar no añade nada;
  - la liquidación del mes muestra la renta importada, los honorarios y la reparación de la Tarea 7;
  - `page.emulateMedia({media: "print"})` oculta la barra.
- [ ] **Step 2: Implement.** **Step 3: Check in the browser** a 1280×800 y 390×844, y en vista de impresión.
- [ ] **Step 4: Run** `npm test`, `npm run build` y el e2e completo → PASS y `e2e OK`.
- [ ] **Step 5: Commit** `Add bank import and printable statements`.

### Task 9: Cierre

**Files:**
- Modify: `docs/roadmap/ESTADO.md`

- [ ] **Step 1:** Fila F5 de ESTADO.md:
  - F5-A construida; sale con la Entrega 2;
  - al desplegar, `0013` en remoto después de la `0012` y antes del push;
  - antes de usar la gestión completa en producción: registro en la JFSC (R21) y revisión de los plazos de R10 y R13 por un abogado; Luis confirma si Hampton cobra GST (R29);
  - F5-B pendiente: envíos, portal y solicitudes del inquilino, firma electrónica, inspecciones e IA.
- [ ] **Step 2: Commit** `Close F5-A`.
