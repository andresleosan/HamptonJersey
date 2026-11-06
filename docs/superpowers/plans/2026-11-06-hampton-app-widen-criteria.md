# Widen criteria (BUS-17 + Widen de SAP-10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a la ficha de un aplicante activo con menos de 3 casas le sale una tarjeta «Widen criteria» con tres alternativas (presupuesto +10 %, una parroquia más, un dormitorio menos), cuántas casas nuevas daría cada una y un botón «Use this» que rellena Requirements sin guardar.

**Architecture:** una función pura `widen()` en `server/widen.js` usa `evaluate()` sin tocar sus reglas; `GET /admin/applicants/:id` la devuelve como `widen` solo cuando hace falta; el panel la pinta en la pestaña Matches. Sin migración.

**Tech Stack:** Cloudflare Pages Functions + D1, React 19 con Vite, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-06-hampton-app-widen-criteria-design.md` (W1–W11).

## Global Constraints
- Ninguna regla de `evaluate()` cambia; `MIN_SCORE` (35) y `MAX_FOUND` (25) se importan, no se copian.
- Redondeo hacia arriba: £50 en alquiler (al mes), £1,000 en compra. Tope: `BUDGET[operation][1]` de `server/applicants.js` (50,000 / 100,000,000).
- Sin migración, sin tablas nuevas, sin escribir nada al calcular.
- Copy en inglés, sentence case, sin exclamaciones, sin emoji, sin «—» como separador.
- DESIGN.md: solo `.card`, `.btn ghost sm`, `.muted`, `.count`, `.sr`; nada de colores, fuentes, librerías ni `style=` nuevos; nunca `dangerouslySetInnerHTML`.
- Accesibilidad: botones nativos con nombre accesible único (texto `.sr`), foco al campo cambiado, todo con teclado, nada tapado por la actionbar.
- Trabajo en main, un solo commit al final con ESTADO y checklist (regla de /avanzar).

## Review Focus
1. Aplicante con `budget_stretch`: sube el estirado, no el máximo (prueba en Task 1).
2. Parroquia excluida o ya pedida: nunca se propone (Task 1).
3. Casa rechazada o ya emparejada: no se cuenta (Task 1).
4. Shortlisted de una casa que ya no es candidata (vendida): no cuenta para el «menos de 3» (Task 2).
5. Formulario con cambios sin guardar: los botones están desactivados con su motivo (Task 3, e2e).

---

### Task 1: `widen()` pura

**Files:**
- Create: `server/widen.js`
- Modify: `server/applicants.js:44` (exportar `BUDGET`)
- Test: `tests/server/widen.test.mjs`

**Interfaces:**
- Consumes: `evaluate`, `MIN_SCORE`, `MAX_FOUND` de `server/matching.js`; `OPTIONS`, `BUDGET` de `server/applicants.js`.
- Produces: `widen(a, listings, taken, found) → Alternative[]`
  - `a`: fila de `applicants` tal como la guarda D1 (listas como texto JSON).
  - `listings`: filas candidatas de la operación del aplicante con las columnas que lee `evaluate()`.
  - `taken`: `Set` de `listing_id` con cualquier fila en `matches` para este aplicante.
  - `found`: número de matches Found del aplicante (para el tope `MAX_FOUND - found`).
  - `Alternative` = `{ key: "budget", field: "budget_stretch" | "budget_max", from, to, added }` · `{ key: "parish", field: "parishes_wanted", parish: string | null, to: string[] | null, added }` · `{ key: "bedrooms", field: "bedrooms_min", from, to, added }`. Siempre en ese orden; solo las que aplican (W7). `[]` = nada que ampliar.

- [ ] **Step 1: Escribir las pruebas que fallan** (`tests/server/widen.test.mjs`, filas como en `matching.test.mjs`):
  - `budget: +10 % on the top the matching uses, rounded up` — compra `budget_max: 900000` → `{ field: "budget_max", from: 900000, to: 990000 }`; con `budget_stretch: 950000` → `field: "budget_stretch", to: 1045000`; alquiler `budget_max: 2010` → `to: 2250` (2211 redondeado a £50).
  - `budget: hidden without a top or past the validation limit` — sin `budget_max` ni stretch no hay `key: "budget"`; compra con `budget_max: 95000000` (104.5M > 100M) tampoco.
  - `budget: counts the listings the new top lets in` — dos casas a £950,000 y una a £1,200,000, `budget_max: 900000` → `added: 2`.
  - `parish: the free parish that adds most, ties alphabetical` — `parishes_wanted: ["St Helier"]`, casas en St Clement (2) y Grouville (2), St Saviour excluida con 3 → `parish: "Grouville"`, `added: 2`, `to: ["St Helier", "Grouville"]`.
  - `parish: never an excluded or wanted one; hidden when any parish is fine` — sin `parishes_wanted` no hay `key: "parish"`; con las 12 entre pedidas y excluidas tampoco.
  - `parish: none adds any` — `{ key: "parish", parish: null, to: null, added: 0 }`.
  - `bedrooms: one fewer, hidden at 1 or less` — `bedrooms_min: 3` → `to: 2` y cuenta las casas de 2; con `1` o `null` no hay `key: "bedrooms"`.
  - `taken listings are never counted` — una casa que pasaría está en `taken` → no suma.
  - `capped at the room left under MAX_FOUND` — 30 casas que entrarían, `found: 2` → `added: 23`.
- [ ] **Step 2:** `node --test tests/server/widen.test.mjs` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar `widen`** en `server/widen.js`. Una casa cuenta si no está en `taken` y `evaluate(variante, l)` da `pass && score >= MIN_SCORE`. Parroquia: una sola pasada; cada casa con parroquia libre se evalúa con `parishes_wanted` + la suya, contando por parroquia; se recorre `OPTIONS.parishes` en orden y gana el primer máximo. Cabecera de una línea que diga que es la ampliación de BUS-17 y que no decide ninguna regla.
- [ ] **Step 4:** `node --test tests/server/widen.test.mjs` → PASS; `npm test` → todo verde.

### Task 2: `widen` en el detalle del aplicante

**Files:**
- Modify: `server/match-store.js` (exportar `LISTING`), `server/routes/applicants.js` (`detail`)
- Test: `tests/server/widen.test.mjs` (pruebas de ruta, con `makeEnv`/`seedListing` y la forma de llamar a la API de `tests/server/applicants.test.mjs`)

**Interfaces:**
- Consumes: `widen` (Task 1), `CANDIDATES_SQL`, `LISTING`, `recomputeForApplicant`.
- Produces: `GET /admin/applicants/:id` → `widen: Alternative[] | null`. `null` cuando la búsqueda no está activa (`isActive`) o tiene 3 o más Found + Shortlisted de casas candidatas.

- [ ] **Step 1: Pruebas que fallan:**
  - `detail: widen with fewer than 3 live matches, null with 3` — 2 Found → array; 3 Found → `null`.
  - `detail: a shortlisted listing that left the candidates does not count` — 3 Shortlisted, una con `availability = 'sold'` → array.
  - `detail: closed or archived searches get null` — stage `lost`, y `archived_at` puesto → `null`.
  - `detail: the counted listings are the new found ones after saving the change` — aplicante con 0 matches; se hace `PUT` con `{ [alt.field]: alt.to }` de cada alternativa por separado (en aplicantes distintos) y tras el recálculo los Found nuevos son exactamente `alt.added`.
- [ ] **Step 2:** ejecutar → FAIL (`widen` es `undefined`).
- [ ] **Step 3: Implementar.** En el batch de `detail`, un recuento de `matches` Found/Shortlisted cuyo `listing_id` está en `SELECT id FROM listings WHERE ${CANDIDATES_SQL}`. Solo si es activa y el recuento < 3, una segunda consulta `SELECT ${LISTING} FROM listings WHERE ${CANDIDATES_SQL} AND operation = ?` y `widen(applicant, rows, new Set(matches.map(m => m.listing_id)), foundCount)`. `applicant` es la fila cruda de `loadApplicant` (listas como texto).
- [ ] **Step 4:** pruebas → PASS; `npm test` → verde. Medir con 300 fichas sembradas el tiempo de `widen()` y dejarlo en un comentario `ponytail:` con su techo.

### Task 3: tarjeta «Widen criteria» en el panel

**Files:**
- Modify: `admin/src/ApplicantDetail.jsx` (`Matches` y la llamada), `admin/src/styles.css` solo si hace falta una regla de rejilla para las filas
- Test: `tests/e2e.cjs` (un paso nuevo tras los de la ficha del aplicante)

**Interfaces:**
- Consumes: `data.widen` (Task 2); `form`, `setForm`, `dirty`, `go` de `ApplicantDetail`.

- [ ] **Step 1: Paso e2e que falla** `widenCriteria`: crea por la API un aplicante de compra con `budget_max` justo por debajo de una ficha del seed y `bedrooms_min` 2; en `#/applicants/<id>/matches` comprueba:
  - la tarjeta con el título «Widen criteria» y la fila del presupuesto con «N more listings» (o «No more listings»);
  - escribe algo en Requirements, vuelve a Matches → los botones «Use this» están desactivados y se lee «Save or discard your changes first.»; Discard;
  - «Use this» del presupuesto → se abre Requirements, el foco está en `#a-budget_max` con el valor nuevo y sale «Unsaved changes»; Save → en Matches aparecen las casas contadas;
  - capturas a 1280 y 390, sin scroll lateral a 390.
- [ ] **Step 2: Implementar** en `Matches` una `<section className="card widen" aria-labelledby="widen-h">` encima de los grupos, solo si `widen` no es `null`:
  - `h2` «Widen criteria»; `p.muted` «Fewer than 3 listings fit this search. Each change on its own would add:».
  - Una fila por alternativa: «Budget up 10%: £900,000 to £990,000» (alquiler: «… a month»), «Add Grouville» (sin parroquia: «Add a parish»), «1 bedroom fewer: at least 2»; a la derecha «N more listing(s)» o «No more listings».
  - Botón `.btn ghost sm` «Use this<span className="sr">: …la misma frase…</span>» solo si `added > 0`; `disabled={dirty}`, `title` y un `p.muted` «Save or discard your changes first.» cuando `dirty`.
  - `[]` → `p.empty` «Nothing to widen: no budget limit, no parish to add and no bedroom to take off.»
  - «Use this»: `setForm(f => ({ ...f, [field]: field === "parishes_wanted" ? to : String(to) }))`, `go("requirements")` y, tras pintar, foco en `#a-${field}` o en el checkbox `input[name="a-parishes_wanted"][value="<parish>"]`.
  - Archivada o cerrada nunca llega aquí (`widen` es `null`).
- [ ] **Step 3:** `npm run build` y el e2e (cabecera de `tests/e2e.cjs`; en el taller se para en Turnstile: correr el paso aislado con un arnés fuera del repo) → PASS. Recorrido con Playwright MCP a 1280 y 390, capturas en `/home/taller/encargos/capturas/widen/`.

### Task 4: documentos y cierre
- [ ] Checklist (bloque `datos`): BUS-17 → `hecho` con hecho/falta/evidencia y `actualizado`; SAP-10 → `hecho` gana Widen criteria, `falta` queda Pause search; fecha `actualizado` del bloque.
- [ ] ESTADO.md: fila F1 (Widen en producción tras el push), «Actualizado el 6-nov-2026» y la línea «Siguiente recomendado».
- [ ] Ledger `docs/superpowers/plans/2026-11-06-hampton-app-widen-criteria-ledger.md`.
- [ ] Revisión independiente (errores, seguridad y privacidad, DESIGN.md, código de más); arreglar; `npm test`, `npm run build`; un commit en main.
