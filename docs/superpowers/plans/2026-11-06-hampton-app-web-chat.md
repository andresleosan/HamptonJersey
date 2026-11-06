# Chat de la web con respuesta humana (MSG-02) Implementation Plan

Integración local del 6-nov-2026: chats usa `0022_chats.sql`, después de `0021_published_at.sql` de PUB-22. Sin migraciones aplicadas ni publicación; el permiso anterior era para otro SHA.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un visitante escribe desde la web, una persona del equipo contesta desde el panel y el visitante ve la respuesta, sin IA.

**Architecture:** Dos tablas nuevas (migración 0022). Las rutas públicas `/api/chat*` identifican el chat por la huella SHA-256 de una llave que solo viaja en `Authorization: Bearer`, y las del panel `/admin/chats*` van con sesión. En la web, un módulo `site/chat.js` cargado a demanda, y en el panel una pantalla `Messages.jsx` con el patrón `.inbox`. El interruptor es la fila `app_settings.webchat`.

**Tech Stack:** Cloudflare Pages Functions + D1 (SQLite), JS sin dependencias en la web, React 19 + Vite en el panel, `node:test` con D1 sobre `node:sqlite`.

**Spec:** `docs/superpowers/specs/2026-11-06-hampton-app-web-chat-design.md` (C1-C14). El plan la cita por número.

## Global Constraints
- Todo texto visible en inglés, en sentence case, sin exclamaciones y sin «—» como separador (D19, DESIGN.md).
- Sin dependencias nuevas, sin fuentes nuevas. Tenor Sans y Montserrat; pesos 400/500/600.
- Colores: solo los tokens existentes (web `--ink #151515`, `--paper`, `--mist #f4f3f0`, `--line #e3e0da`, `--stone`; bronce solo para foco y acción; texto bronce pequeño con `#86542d`). El verde y el rojo solo comunican estado.
- Espacios en código nuevo: 4, 8, 12, 16, 24, 32, 48, 64. Breakpoints nuevos: 480, 760, 980, mobile-first con `min-width`.
- Z-index de los niveles que ya existen (web: `.mbar` 15, header 20, skip 50). La burbuja y el panel del chat van al 15, por encima de `.mbar`.
- Formas: botones píldora 999px; campos 12px; panel del chat 16px (en móvil a pantalla completa, sin radio).
- Web: objetivo táctil ≥ 44px; inputs de 16px; `autocomplete` `name`/`email`/`tel`; etiqueta visible encima de cada campo; errores con `aria-invalid` + `aria-describedby`; foco al primer error.
- Panel: cuerpo 14px; `.card`, `.seg`, `.inbox`, `.badge`, `.btn`/`.btn ghost sm`, `<details class="more">` para lo destructivo; objetivo táctil ≥ 32px.
- Accesibilidad: foco visible 2px bronce; Escape cierra el panel del chat y el foco vuelve a la burbuja; conversación en `aria-live="polite"`; todo transition apagado con `prefers-reduced-motion`; un estado nunca solo con color.
- Seguridad: mensajes y datos de la API solo con `textContent` o `esc()`, nunca HTML; sin enlaces automáticos; sin `onclick=` ni `style=` inline; nada personal en `localStorage` (solo llave, hora y último id visto); `cache-control: no-store` en `/api/chat*`; nunca `dangerouslySetInnerHTML` en el panel; el email del equipo nunca en una respuesta pública.
- Rendimiento: `chat.js` solo se descarga al pulsar la burbuja o si hay llave guardada; Turnstile ya está en la página (`render=explicit`).
- Textos del visitante exactos de la spec («Textos para el visitante») y párrafos del aviso de privacidad exactos de la spec.

## Review Focus
1. **Llave de otra persona o inventada**: cualquier llave que no sea la huella de un chat vivo (o con `last_at` de más de 7 días) recibe el mismo 401, sin revelar si existió. Prueba en la tarea 2.
2. **Dos mensajes del visitante a la vez** (doble clic, dos pestañas): el tope de 40 y los 3 s se comprueban en la misma sentencia del INSERT; nunca 41. Prueba en la tarea 2.
3. **El equipo contesta a un chat que el visitante acaba de borrar**: 404 «This chat was deleted», sin 500. Prueba en la tarea 3.
4. **Interruptor apagado con chats abiertos**: abrir uno nuevo da 404, pero leer, escribir y contestar siguen. Prueba en la tarea 2.
5. **El email del equipo o datos del chat por la puerta de Hermes**: `GET /api/chat` firma con el nombre y `news`/`status` solo traen números. Pruebas en las tareas 2 y 3.

---

### Task 1: Migración 0022

**Files:**
- Create: `migrations/0022_chats.sql`
- Test: `tests/server/schema.test.mjs` (añadir un caso)

**Interfaces:**
- Produces: tablas `chats` y `chat_messages` con las columnas de la spec («Dónde va»); índices `chats_waiting` (parcial, `status = 'waiting'`, sobre `waiting_since`), `chats_last` (`last_at`), `chat_messages_chat` (`chat_id, id`).

- [ ] **Step 1: Prueba que falla** `test("0022: a chat needs an email or a phone, and its messages go with it")`: insertar un chat sin email ni teléfono lanza CHECK; uno con email y dos mensajes, borrado, deja 0 filas en `chat_messages`; un `role` fuera de `visitor`/`team` y un `text` vacío o de 2.001 caracteres lanzan; borrar la ficha deja `listing_id` en NULL.
- [ ] **Step 2:** `node --test tests/server/schema.test.mjs` → FAIL (no such table).
- [ ] **Step 3:** Escribir la migración. CHECK de `text`: `length(text) BETWEEN 1 AND 2000` (el tope de 1.000 del visitante va en el código). `status` por defecto `'waiting'`. Comentario de cabecera como en `0018_jobs.sql`.
- [ ] **Step 4:** `npm test` → todo PASS.

### Task 2: Rutas públicas del chat

**Files:**
- Create: `server/chat.js` (reglas puras y SQL compartido), `server/routes/chat.js`
- Modify: `server/api.js` (registrar rutas; `chat` en el regex de `no-store`), `server/routes/public.js` (`config` añade `chat`)
- Test: `tests/server/chat.test.mjs` (nuevo), `tests/server/public.test.mjs:109` (el `deepEqual` de config pasa a `{ turnstileSiteKey: "site-key", chat: false }`)

**Interfaces:**
- Produces en `server/chat.js`:
  - `validateStart(body) -> {value} | {errors}` (name 1-100; email con `EMAIL` de `viewings.js`, en minúsculas; phone con `normalizePhone`; al menos uno; `privacy === true`; `text` recortado 1-1000; `listing_id` string o null).
  - `chatOn(env, request) -> Promise<boolean>`: fila `webchat` con `on` verdadero y host que no termina en `.pages.dev`.
  - `previewHost(request) -> boolean`.
  - `newKey() -> string` (32 bytes, base64url) y `keyHash(key) -> Promise<string>` (hex SHA-256).
  - `signature(name) -> string`: `"Gilberto · Hampton Estates"` o `"Hampton Estates"`.
  - Constantes `KEY_DAYS = 7`, `MAX_VISITOR = 40`, `GAP_MS = 3000`, `VISITOR_MAX = 1000`, `TEAM_MAX = 2000`, `KEEP_DAYS = 30`.
  - `conversation(env, chatId) -> Promise<{status, listing: {id,title}|null, messages: [{id, role, from, text, at}]}>`: `from` = `signature(admins.name)` para `team` y `null` para `visitor`. La usan esta tarea y la 3.
- Rutas: `POST /chat`, `GET /chat`, `POST /chat/messages`, `DELETE /chat` (sin sesión).

- [ ] **Step 1: Pruebas que fallan** en `tests/server/chat.test.mjs` (Turnstile simulado como en `public.test.mjs:8`; encender con una fila `webchat` `{"on":true}`):
  - `starts a chat and returns the key once`: 201 con `key` de 43 caracteres; en D1 solo `key_hash` (≠ key); status `waiting`, `waiting_since` = `last_at`; un mensaje `visitor`.
  - `switch off, preview host or a failed Turnstile: no new chat`: sin fila → 404; host `x.pages.dev` → 404; Turnstile `false` → 400 sin filas nuevas.
  - `asks for a name, an email or a phone, the privacy box and a message`: 400 con `fields` para cada caso; un `listing_id` que no es una ficha publicada se ignora (null).
  - `the key reads only its own chat, and an unknown or old key gets the same 401`: llave inventada, llave de un chat con `last_at` de hace 8 días, sin cabecera → mismo cuerpo 401 «This chat has ended. Start a new one.».
  - `a team reply comes back signed with a first name, never an email` (insertar el mensaje `team` a mano con `sent_by` del admin con `name` «Gilberto Franco», y otro de un admin sin nombre): `from` = `"Gilberto · Hampton Estates"` y `"Hampton Estates"`; el JSON no contiene `@example.test`.
  - `visitor messages: 3 s apart, at most 40, back to waiting`: segundo mensaje antes de 3 s → 429; tras `handled`, un mensaje lo pone en `waiting` con `waiting_since` nuevo; con 40 → 429 «This chat is full. Please start a new one or call us.»; dos POST simultáneos con 39 dejan 40, no 41.
  - `switch off keeps open chats working`: apagar y luego GET y POST mensajes → 200/201.
  - `reading updates visitor_seen_at at most once a minute`.
  - `the visitor deletes the chat and its messages`: DELETE → 204; la llave ya da 401.
  - `chat answers are never cached`: `cache-control: no-store` en las cuatro.
  - `config says whether the chat is on`: `chat: true` encendido; `false` en `*.pages.dev`.
- [ ] **Step 2:** `node --test tests/server/chat.test.mjs` → FAIL.
- [ ] **Step 3:** Implementar. Abrir chat: comprobaciones baratas, después `chatOn`, después Turnstile (como `createViewing`), y luego un `batch` con el INSERT del chat (`RETURNING id`) y el del mensaje. Mensaje del visitante: un solo `INSERT … SELECT … WHERE (SELECT COUNT(*) …) < 40 AND NOT EXISTS (mensaje visitor en los últimos 3 s)`, y en el mismo batch el UPDATE de `status='waiting'`, `waiting_since = COALESCE(waiting_since si ya esperaba, ahora)`, `last_at`; si el INSERT no cambia filas, se distingue 40 de 3 s con una lectura. La llave se busca con `key_hash = ? AND last_at >= now - 7 días`.
- [ ] **Step 4:** `npm test` → PASS.

### Task 3: Rutas del panel, contador, interruptor y `news`

**Files:**
- Create: `server/routes/chats.js` (rutas del panel)
- Modify: `server/api.js`, `server/routes/notifications.js` (`openCounts` añade `chats`), `server/routes/automations.js` (devuelve `webchat`; `POST /admin/webchat`), `server/routes/hermes.js` (`news` añade `chats_waiting`)
- Test: `tests/server/chats-admin.test.mjs` (nuevo), `tests/server/hermes.test.mjs`, `tests/server/automations.test.mjs`

**Interfaces:**
- Consumes: `conversation`, `TEAM_MAX` (tarea 2).
- Produces (con sesión):
  - `GET /admin/chats?status=waiting|answered|handled|all` → `{chats: [{id, name, status, listing_title, last_at, waiting_since, last_text}], counts: {waiting, answered, handled}}`, ordenada `waiting` por `waiting_since` ascendente y el resto por `last_at` descendente;
  - `GET /admin/chats/:id` → `{chat: {id, name, email, phone, status, listing: {id,title}|null, visitor_seen_at, created_at}, messages}`;
  - `POST /admin/chats/:id/reply {text}` → 201;
  - `POST /admin/chats/:id/handled` → 200;
  - `DELETE /admin/chats/:id` → 204;
  - `POST /admin/webchat {on: boolean}` → `{webchat: {on, at, by}}`.
  - `openCounts(env).chats: number`.
  - `GET /admin/automations` añade `webchat: {on, at, by} | {on: false, at: null, by: null}`.
  - `GET /hermes/news` añade `chats_waiting: number`.

- [ ] **Step 1: Pruebas que fallan**:
  - `the panel lists chats by status with their counts`.
  - `a reply is signed by its sender and answers the chat`: status `answered`, `waiting_since` NULL, `sent_by` = email del admin; texto vacío o de 2.001 → 400.
  - `a reply to a deleted chat is a 404, not a 500`.
  - `mark handled, and delete with its messages`.
  - `the switch remembers who turned it on and when`; `on` no booleano → 400; sin sesión → 401 en todas.
  - `the bar counts waiting chats only` (`/admin/notifications/counts` → `chats`).
  - En `hermes.test.mjs`: `news carries how many chats wait, and nothing else of them`: `chats_waiting` = 2 con dos chats `waiting` y uno `answered`; el JSON de `news` y de `status` no contiene el nombre, el email ni el texto de los chats.
- [ ] **Step 2:** `npm test` → FAIL en los nuevos.
- [ ] **Step 3:** Implementar. El reply es un batch: INSERT del mensaje con `SELECT … FROM chats WHERE id = ?` (0 filas → 404) y el UPDATE de estado y `last_at`. `openCounts` añade una consulta al batch sobre el índice parcial.
- [ ] **Step 4:** `npm test` → PASS.

### Task 4: Borrado a los 30 días

**Files:**
- Modify: `server/retention.js` (`runRetention`, `recordRetentionDay`), `server/routes/automations.js` (`retention.chats ?? 0`)
- Test: `tests/server/retention.test.mjs`

**Interfaces:**
- Produces: `runRetention` devuelve además `chats: number`; `retention_run.chats`.

- [ ] **Step 1: Prueba que falla** `test("chats go 30 days after their last message, with their messages")`: un chat con `last_at` a 31 días y otro a 29; tras la pasada, solo queda el de 29 y sus mensajes; `chats: 1`; tope `RETENTION_CAP`.
- [ ] **Step 2:** `node --test tests/server/retention.test.mjs` → FAIL.
- [ ] **Step 3:** Una sentencia más al final del batch: `DELETE FROM chats WHERE id IN (SELECT id FROM chats WHERE last_at < strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '-30 days') ORDER BY last_at LIMIT ${RETENTION_CAP})`; los mensajes van en cascada. Comentario E-style como los demás.
- [ ] **Step 4:** `npm test` → PASS.

### Task 5: Pantalla Messages e interruptor en el panel

**Files:**
- Create: `admin/src/Messages.jsx`
- Modify: `admin/src/App.jsx` (ruta `#/messages`, `#/messages/<id>`; entrada «Messages» con `counts.chats` tras Inbox), `admin/src/Automations.jsx` (tarjeta «Web chat»), `admin/src/styles.css` (solo si falta algo; reutilizar `.inbox`)

**Interfaces:**
- Consumes: rutas de la tarea 3.

- [ ] **Step 1:** Messages: `.head` con H1 «Messages»; `.seg` Waiting / Answered / Handled / All con contadores (`aria-pressed`); `.inbox` con la lista (nombre, ficha, «waiting 25 min» o la fecha, primer trozo del último mensaje) y el detalle: contacto (mailto, `tel:`, WhatsApp con `safeHref` como en `ApplicantDetail.jsx`), ficha enlazada al editor, C14 («Visitor on the website now» / «Last on the website 3 h ago» / «Not back since»), conversación en orden con quién y hora, `<textarea>` con su `<label>` «Reply» y contador de 2.000, «Send reply» primario, «Mark handled» ghost, Delete en `<details class="more">` con `confirm`. Sondeo con `usePoll` cada 30 s la lista y cada 10 s el detalle abierto; tras cada acción, `onChange` (refresca el contador). Vacíos: «No chats are waiting.» / «No chats here yet. They appear when the web chat is on.».
- [ ] **Step 2:** Automations: tarjeta «Web chat» con `role="switch"` y texto On/Off, «Turned on by <email> on <fecha>», y `confirm("Turn the web chat on? It appears on the website within 5 minutes.")` al encender.
- [ ] **Step 3:** `npm run build` → OK, sin avisos nuevos.

### Task 6: La burbuja y el chat en la web; aviso de privacidad

**Files:**
- Create: `site/chat.js`
- Modify: `site/index.html` (CSS de la burbuja y del panel; botón; carga de `chat.js`), `site/apply.js` (`renderPrivacy`, textos exactos de la spec), `scripts/check-release.mjs` si lista los archivos de `site/`
- Test: `tests/chat.test.js` (nuevo, funciones puras de `site/chat.js`)

**Interfaces:**
- Consumes: `/api/config.chat`, rutas de la tarea 2.
- Produces en `site/chat.js` (exportadas para la prueba): `pollDelay(msSinceLastMessage) -> number|null` (5.000 hasta 60 s, 15.000 hasta 5 min, 30.000 hasta 2 h, `null` después); `readStore(raw, nowMs) -> {key, at, seen}|null` (null si falta algo o `at` tiene más de 7 días); `openChat(opts)` y `bootChat(opts)`.

- [ ] **Step 1: Pruebas que fallan** en `tests/chat.test.js`: los cuatro tramos de `pollDelay`; `readStore` con JSON roto, sin llave, con 8 días → null; con 6 días → objeto.
- [ ] **Step 2:** `node --test tests/chat.test.js` → FAIL.
- [ ] **Step 3:** `site/chat.js`. Formulario de inicio (Name; Email; Mobile; «Your message» con contador de 1.000; casilla con enlace al aviso en pestaña nueva; Turnstile con el plan B de 6 s de la reserva; «Send»), conversación (`<ol aria-live="polite">`, cada mensaje con quién y hora; «You» para el visitante; la firma C6 para el equipo), caja de respuesta, «End chat» y «Delete chat» (con `confirm`). Sondeo con `pollDelay`, parado con `document.hidden`. Guardado en `localStorage` «hampton-chat» `{key, at, seen}`. Errores de la API en `.form-status` con `role="alert"`, conservando lo escrito.
- [ ] **Step 4:** `index.html`: botón «Message us» (`.btn`, fijo abajo a la derecha, z 15, sobre `.mbar` en `/p/` bajo 760px con `safe-area-inset-bottom`), oculto en `#/apply` y `#/privacy`; se muestra si `config.chat` o hay llave guardada (y el host no es `*.pages.dev`). Con llave, `import("/chat.js")` al cargar para el aviso «1 new reply» (texto en el botón, no solo un punto). Panel del chat: `section role="dialog" aria-labelledby`, 16px de radio y `--shadow` en escritorio (≈ 380px de ancho), pantalla completa en móvil; Escape cierra y devuelve el foco.
- [ ] **Step 5:** `renderPrivacy`: el punto, la sección «Web chat» y la frase de «In your browser», exactos de la spec.
- [ ] **Step 6:** `npm test` y `npm run build` → PASS.

### Task 7: e2e, recorrido y documentos

**Files:**
- Modify: `tests/e2e.cjs` (paso `webChat`), `tests/fixtures/seed.sql` si hace falta la fila `webchat`, `docs/roadmap/ESTADO.md`, `docs/roadmap/checklist-hampton-app.html` (MSG-02, MSG-03 «hecho» parcial del chat web, `actualizado`)

- [ ] **Step 1:** Paso `webChat` del e2e: encender el interruptor desde Automations; en la web a 390 abrir la burbuja, enviar un mensaje; en el panel, «Messages 1» y contestar; en la web, la respuesta firmada; recargar y seguir viéndola; «Delete chat».
- [ ] **Step 2:** Correrlo contra `wrangler pages dev` (cabecera de `tests/e2e.cjs`); el e2e completo se para en Turnstile en el taller: decirlo.
- [ ] **Step 3:** Recorrido con Playwright MCP a 1280 y 390, capturas en `/home/taller/encargos/capturas/web-chat/`.
- [ ] **Step 4:** ESTADO.md y checklist en el mismo commit.
