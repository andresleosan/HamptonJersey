# Hampton App · F0 Cimientos: aplicantes y avisos

Fecha: 2026-10-23 · Estado: aprobado por Luis (23-oct) · Base: `ada40e3`
Parte de: `docs/roadmap/2026-10-23-arquitectura-hampton-app.md` (la «arquitectura»). Este documento concreta su fase F0; donde no dice nada, manda la arquitectura.

## 1. Intención

Hoy un aplicante que llama o escribe queda en la memoria o en notas sueltas del equipo. F0 hace que **cada aplicante entre por una sola puerta** (la web o el panel), quede guardado con todos sus requisitos y genere un aviso que alguien tiene que atender. Es el cimiento de F1: sin aplicantes estructurados no hay matching.

**Éxito (verificable):**
- Un registro hecho desde la web pública aparece en el panel con su aviso en menos de 1 minuto.
- Un segundo registro con el mismo email o el mismo móvil queda unido al mismo contacto.
- Una solicitud de visita de la web también crea su aviso, y el aviso se cierra cuando la solicitud deja de ser `new`.

**No-objetivos de F0** (llegan en su fase): matching e inventario (F1), Worker con cron (F1, porque en F0 no hay nada programado), correos y WhatsApp a nadie (F2+), portal del aplicante (F2), calendario de negociadores (F3).

**Anti-objetivos** (sería un fracaso aunque funcione):
- Que un desconocido pueda cambiar los datos de un aplicante existente escribiendo su email en el formulario público.
- Que el formulario público pida ingresos, empleador o documentos (eso es C3, F5).
- Que la web pública se vuelva lenta o cargue el asistente cuando nadie lo abre.
- Pestañas, botones o columnas vacías «para más adelante» en el panel.

## 2. Decisiones

| # | Decisión | Quién | Dónde |
|---|---|---|---|
| A1 | Firebase solo para el login con Google; todo lo demás en Cloudflare (Pages, Functions, D1, R2, Turnstile, Worker, AI Gateway) | Luis | Chat 23-oct |
| A2 | Datos sensibles (C3) con Ollama en el VPS, alcanzado solo por Cloudflare a través de un Cloudflare Tunnel privado (Workers VPC o Access con token de servicio) | Luis (túnel) + Claude (protección) | Chat 23-oct · aplica desde F5 |
| A3 | El dominio `hamptonestatesjersey.com` pasa a esta app; Luis pasa el acceso en unos días | Luis | Chat 23-oct |
| A4 | Las 3 fichas públicas y las 264 importadas se comercializan junto con la agencia que tiene el encargo (`co_listed`); publicar sus fotos está permitido | Luis | Chat 23-oct · aplica en F1 |
| A5 | P-01 aceptada: inventario del mercado diario + matching en SQL; Deep Research solo en casos raros | Luis | Chat 23-oct · aplica en F1 |
| A6 | Orden: DESIGN.md → F0 → F1 | Claude (Luis: «no tengo idea, analiza») | Chat 23-oct |
| A7 | Una vuelta completa por fase (§8), con pruebas al final de cada fase, no solo al final del proyecto | Claude, propuesto en chat | Chat 23-oct |
| A8 | Un solo rol, admin, con todos los permisos (se mantiene D6); `admins` no se renombra y solo gana `name`, para mostrar «Assigned to» | Luis (rol único) + Claude (`name`) | Chat 23-oct |
| A9 | Avisos compartidos por el equipo (sin estado «leído» por persona) | Claude: equipo de 2 a 4 | Este documento |
| A10 | El formulario público nunca modifica un contacto o aplicante existente (§3.3) | Claude: anti-objetivo 1 | Este documento |
| A11 | El asistente público y el alta en el panel comparten la validación del servidor; el panel usa un formulario de una página, no el paso a paso | Claude: el equipo teclea mientras habla, y así no hay dos asistentes que mantener | Este documento |
| A12 | El panel abre en **Inbox** en lugar de Listings | Claude | Este documento |
| A13 | `DESIGN.md` (raíz del repo) se escribe antes, como tarea propia, y el plan de F0 lo da por existente | Claude | Revisión del constructor |
| A14 | F0 sale en dos entregas: primero el panel (tablas, Inbox, Applicants, New applicant); después el asistente público, `#/privacy` y el enlace «Register», cuando Luis apruebe el aviso de privacidad y el plazo de respuesta | Claude | Revisión del constructor |
| A16 | Primera tarea de F0: unificar la paleta de web y panel según la propuesta de `DESIGN.md` y arreglar los contrastes que fallan hoy en la web (bronce 4,40:1, gris sobre mist 4,25:1, bordes de campos) | Claude, aprobado por Luis | Chat 23-oct |
| G1 | Los avisos de F0 solo se ven en el panel; el equipo de Hampton lo abre cada día laborable. El aviso por email llega en F2 | Luis | Grill-me 23-oct |
| G2 | Conservación: 12 meses desde la última actividad del contacto. F0: el aviso de privacidad lo dice y el borrado es manual (§3.4). F1: el cron avisa por email a los 11 meses y anonimiza a los 12 | Luis | Grill-me 23-oct |
| G3 | Sin columna `Queue` en F0: valdría lo mismo para todos (anti-objetivo 4). Llega con F1 | Claude | Grill-me 23-oct |
| G4 | Las solicitudes de visita no crean contactos en F0; la ficha del aplicante muestra las que tienen su mismo email o móvil (consulta al leer). Se unen de verdad en F3 | Luis | Grill-me 23-oct |
| G5 | El borrador del aviso de privacidad lleva `<TO CONFIRM>` en nombre legal, dirección, email de privacidad y registro JOIC (y Optimyze como encargado si aplica). Una prueba hace fallar la segunda entrega mientras quede algún `<TO CONFIRM>` en `site/` | Luis | Grill-me 23-oct |
| G6 | Solo vivienda en F0. El paso 1 enlaza «Looking for commercial premises? Contact us» al formulario general de la web (`#book`, sin propiedad elegida) | Luis | Grill-me 23-oct |
| A15 | La migración crea avisos para las solicitudes de visita que ya están en `new`, para que Inbox no empiece vacío | Claude | Revisión del constructor |

Se mantienen D1–D19 del spec del panel (2026-10-07), en particular D9 (borrar = archivar) y D19 (todo en inglés en web, panel y API).

## 3. Datos (migración `0008_applicants.sql`)

Reglas de la arquitectura: dato desconocido = `NULL`, nunca 0; precios con moneda y periodo; cada cambio de estado escribe un evento; nada se borra sin archivar antes (salvo el borrado definitivo del §3.4).

### 3.1 Tablas

**`admins`** (existe) + `name TEXT` (NULL = se muestra el email). Sin roles: todo admin puede todo (D6).

**`contacts`**: una persona.
- `id` INTEGER PK; `name` (1–120); `email` (minúsculas, único si no es NULL); `phone` (formato internacional `+…`, único si no es NULL); al menos uno de los dos.
- `preferred_channel` (`whatsapp` | `call` | `email`), `best_time` (texto corto).
- `privacy_ack_at` (obligatorio en el alta pública), `marketing_opt_in_at` (NULL si no aceptó), `consent_source` (`web` | `phone` | `walk_in` | `email`).
- `last_activity_at`: se actualiza con cada alta, cambio de un admin o envío duplicado del contacto o de sus búsquedas (base del plazo de G2).
- `created_at`, `updated_at`, `updated_by`.

**`applicants`**: una búsqueda de un contacto.
- `id` INTEGER PK, `contact_id` FK.
- `operation` (`rent` | `buy`), `stage` (`new` | `searching` | `viewing` | `offer` | `agreed` | `completed` | `paused` | `lost`), `lost_reason`, `source` (`web` | `phone` | `walk_in` | `email`), `assigned_to` (email de `admins`, NULL = sin asignar).
- Presupuesto: `budget_min`, `budget_max`, `budget_stretch` (REAL, GBP; en alquiler, al mes).
- Casa: `property_types` (JSON: `flat`, `house`, `cottage`, `studio`), `bedrooms_min`, `bedrooms_ideal`, `bathrooms_min`, `parking_spaces` (0, 1, 2, 3 = «3+»; NULL = no lo dijo), `outdoor` (JSON: `garden`, `terrace`, `balcony`), `furnished` (`yes` | `no` | `either`, solo alquiler), `pets` (JSON `{kind: none|cat|dog|other, count}`).
- Zona: `parishes_wanted`, `parishes_excluded` (JSON con las 12 parroquias), `near` (texto: trabajo, colegio).
- Tiempo: `move_in_date`, `lease_term_months` (alquiler); `buyer_position` (`first_time` | `nothing_to_sell` | `needs_to_sell` | `cash`), `mortgage_aip` (`yes` | `no` | `in_progress`) (compra).
- Elegibilidad: `housing_status` (`permanent_entitled` | `entitled` | `licensed` | `licensed_lease_only` | `entitled_work_only` | `standard` | `not_sure`), `household_adults`, `household_children`.
- `requirements` (texto libre: «Anything else that matters?»), `created_at`, `updated_at`, `updated_by`, `archived_at`.

**`events`**: todo lo que pasa.
- `id` INTEGER PK, `at`, `actor` (email del admin, `public` o `system`), `entity_type` (`applicant` | `contact` | `viewing` | `admin`), `entity_id`, `type` (p. ej. `applicant.created`, `applicant.updated`, `applicant.stage_changed`, `viewing.requested`), `data` (JSON: los campos cambiados, antes y después).
- Índice `(entity_type, entity_id, at)`.

**`notifications`**: lo que el equipo debe ver o hacer.
- `id` INTEGER PK, `event_id` FK, `category` (`new_applicant` | `viewing`), `title`, `entity_type`, `entity_id`, `action_required` (0/1), `created_at`, `resolved_at`, `resolved_by`.

Las 12 parroquias, los estatus de vivienda y demás listas cerradas viven en un solo módulo del servidor que el panel y la web consumen (por API o copiadas en el build; elige el constructor).

### 3.2 Eventos y avisos de F0

| Evento | Aviso | Se cierra |
|---|---|---|
| `applicant.created` (web) | `new_applicant`, Needs action: «New applicant: <name> · To Let» | Botón Done, o al asignarlo o cambiar su etapa desde `new` |
| `applicant.created` (panel) | Feed (informativo) | No requiere acción |
| `applicant.duplicate_submitted` (§3.3) | `new_applicant`, Needs action: «<name> registered again» | Done |
| `viewing.requested` | `viewing`, Needs action | Done, o cuando la solicitud deja de ser `new` |
| `applicant.updated`, `applicant.stage_changed`, `applicant.archived` | Ninguno (solo historial) | — |

### 3.3 Duplicados (anti-objetivo 1)

- El alta pública busca un contacto con el mismo email **o** el mismo móvil.
- Si no existe: crea contacto y aplicante.
- Si existe: **no toca** el contacto ni sus aplicantes. Guarda el envío completo en un evento `applicant.duplicate_submitted` y crea el aviso. En el panel, el equipo ve las diferencias y decide (copiar campos, crear la segunda búsqueda, ignorar).
- La respuesta pública es idéntica en los dos casos, para no revelar si un email ya está registrado.
- Si email y móvil apuntan a dos contactos distintos, se trata como duplicado del primero y el aviso lo dice.
- **Excepción de consentimiento** (art. 36): si el envío duplicado deja sin marcar el marketing, `marketing_opt_in_at` pasa a NULL al momento (una objeción se respeta sin esperar a nadie). Si el contacto no tenía `privacy_ack_at`, se rellena. Un alta nueva de marketing por el formulario duplicado **no** se aplica sola: queda en el evento y el equipo la confirma. Cada cambio escribe su evento `contact.consent_changed`.
- **Dónde se ve**: el evento y el aviso apuntan al **contacto**. El enlace del aviso abre su búsqueda activa con la misma operación; si no hay, la búsqueda más reciente; si no tiene ninguna, el alta del panel con el contacto ya elegido. La franja de §6 aparece en esa ficha.
- «Copy fields» copia los requisitos de la búsqueda y, del contacto, solo `preferred_channel` y `best_time`; nunca el nombre, el email ni el móvil. «Create second search» solo se ofrece si el contacto no tiene una búsqueda activa con esa operación.
- Alta desde el panel: si encuentra contacto, el formulario lo muestra y ofrece «Add a new search for this contact» en vez de crear otro.

### 3.4 Borrado

- Archivar (D9): cualquier admin; reversible.
- Borrado definitivo del aplicante, y del contacto si no tiene otras búsquedas: cualquier admin, desde Archived, escribiendo el nombre. Sus eventos se conservan sin los datos personales (`data` se vacía y queda el tipo y la fecha). Es la vía para atender el derecho de supresión.

## 4. API

Mismo patrón que `server/routes/*.js`: tabla de rutas, `fail()`, consultas con parámetros, validación en el servidor con mensajes en inglés.

| Ruta | Quién | Qué |
|---|---|---|
| `POST /api/applicants` | Público, Turnstile, mismo origen | Alta desde el asistente. Valida primero y gasta el token de Turnstile después (como `createViewing`). Responde `201 {ok:true}` siempre que sea válido (§3.3) |
| `GET /api/admin/applicants` | admin | `operation` (`rent`/`buy`/todas), `sort` (`newest`/`oldest`), `stage`, `assigned`, `q` (nombre, email o móvil), `archived` |
| `GET /api/admin/applicants/:id` | admin | Aplicante + contacto + eventos (más recientes primero) |
| `POST /api/admin/applicants` | admin | Alta desde el panel (sin Turnstile; `source` obligatorio) |
| `PUT /api/admin/applicants/:id` | admin | Requisitos, etapa, asignación; un evento por guardado con antes y después |
| `PUT /api/admin/contacts/:id` | admin | Datos del contacto |
| `POST /api/admin/applicants/:id/archive` · `/restore` | admin | D9 |
| `DELETE /api/admin/applicants/:id` | admin | Borrado definitivo (§3.4) |
| `GET /api/admin/notifications` | admin | `box` (`action`/`feed`), `category`; incluye el contador de pendientes por categoría |
| `PUT /api/admin/notifications/:id` | admin | `{resolved:true}` |
| Rutas de `/admin/users` | admin | Además, aceptar y editar `name` |

- `createViewing` añade su evento y aviso en el mismo `batch` que la inserción. `PUT /admin/viewings/:id` cierra el aviso si el estado deja de ser `new`.
- Límites: textos con longitud máxima, listas JSON solo con valores permitidos, números en rangos razonables (dormitorios 0–20, presupuesto > 0), cuerpo de la petición de 32 KB como máximo.

## 5. Web pública: «Register your search»

- **Entrada**: enlace en la navegación («Register») y una llamada a la acción en la home («Tell us what you're looking for»). Ruta `#/apply` en el router actual de `site/index.html`.
- **Carga**: el código del asistente vive en un archivo aparte (por ejemplo `site/apply.js`) y se carga solo al abrir `#/apply`.
- **Pasos** (uno por pantalla, móvil primero, opciones que se tocan, barra de progreso, Back y Continue, unos 2 minutos):

| Paso | Título | Campos (obligatorios en **negrita**) |
|---|---|---|
| 1 | What are you looking for? | **To Let / To Buy** |
| 2 | Where? | Parroquias deseadas (12 fichas), parroquias que no quiere, «Near…» |
| 3 | What kind of home? | Tipo, **dormitorios mínimos**, ideales, baños mínimos, parking (None, 1, 2, 3+), exterior, amueblado (solo alquiler), mascotas y cuántas |
| 4 | Budget and timing | **Máximo**, mínimo, «I can stretch to…» (alquiler en £/mes); fecha de entrada; duración (alquiler); situación de compra e hipoteca (compra) |
| 5 | Living in Jersey | Estatus de vivienda, con una línea que explica por qué se pregunta («It decides which homes you can rent or buy in Jersey»); adultos y niños |
| 6 | About you | **Nombre**, **email**, **móvil**, canal preferido, mejor hora, «Anything else that matters?», **aceptar el aviso de privacidad**, casilla aparte y opcional de marketing |

- El avance se guarda en `sessionStorage` (envuelto en try/catch) para no perderlo al recargar; se borra al enviar.
- Errores del servidor por campo: el asistente vuelve al paso del primer campo con error.
- **Final**: «Thank you, <name>. We'll be in touch within one working day.» (el plazo es un texto editable; ver §9).
- **Aviso de privacidad**: página nueva `#/privacy`. Hoy la web no tiene ninguna y el alta recoge datos personales. El constructor redacta un borrador con lo que exige la Data Protection (Jersey) Law 2018 (quién es el responsable, para qué se usan los datos, base legal, plazo de conservación, derechos, contacto, derecho a oponerse al marketing según el art. 36) y lo marca como **borrador pendiente de Hampton** en el propio código. No se despliega a producción sin el visto bueno de Luis (§9).

## 6. Panel

- **Navegación**: Inbox (con contador de pendientes) · Applicants · Listings · Viewing requests · 3D tours · Users. `#/` abre Inbox.
- **Inbox**: dos bloques, **Needs action** y **Feed**; pestañas All · New applicants · Viewings (solo las categorías que existen en F0; Matched llega en F1 y Missing payments en F5). Cada aviso: título, hace cuánto, enlace a su ficha, **Call** (`tel:`) si hay móvil, **Done**. Se actualiza cada 30 s solo mientras la pestaña está visible.
- **Applicants**: control segmentado All / To Let / To Buy; orden Newest / Oldest; búsqueda por nombre, email o móvil; filtros Stage y Assigned to; columnas Name, Phone, Applied, Stage, Assigned to (G3). Pestaña Archived.
- **Ficha del aplicante**: cabecera con nombre, Call (`tel:`), WhatsApp (`https://wa.me/<número>`), Email (`mailto:`), etapa (selector) y Assigned to. Pestañas **Requirements** (editable, misma barra Save/Discard que el editor de fichas) y **Timeline** (eventos con su autor y diferencias, más las solicitudes de visita con el mismo email o móvil, G4). Si hay un envío duplicado pendiente, una franja arriba lo enseña con «Copy fields», «Create second search» o «Dismiss».
- **New applicant**: formulario de una página con los mismos campos y `source` (Phone, Walk-in, Email).
- **Users**: columna Name editable.
- Todo sigue `DESIGN.md`.

## 7. Cambio de dominio (tarea aparte, cuando llegue el acceso)

1. Preparar antes, sin acceso: leer el sitemap público de la web de Wix y escribir `site/_redirects` con un 301 por cada URL antigua hacia su equivalente.
2. Añadir el dominio personalizado al proyecto Pages `hamptonjersey` y apuntar el DNS.
3. Añadir el dominio a los dominios autorizados de Firebase y a los hostnames del widget de Turnstile.
4. Comprobar `_headers`, el login con Google, una reserva y un registro reales en el dominio nuevo.

## 8. Cómo se construye cada fase

Este es el ciclo acordado (A7) y se repite en F1, F2…:

1. Brainstorming de la fase → documento como este → grill-me sobre el documento → plan con writing-plans.
2. Construcción por tareas, cada una con su prueba del servidor (`node --test`, patrón de `tests/server/`).
3. Revisión con antislop, ponytail y web-performance-optimization sobre el diff; revisión de seguridad (security-best-practices y frontend-security-coder) sobre rutas nuevas y todo lo que pinta datos en la página.
4. Pruebas de extremo a extremo con Playwright (MCP) contra `wrangler pages dev` con la base de pruebas, nunca contra producción: escritorio y móvil, teclado, consola sin errores.
5. Migración en remoto y push a `main` solo con el sí de Luis.
6. Se marca la fase en `docs/roadmap/ESTADO.md` (lista de fases con su estado, enlace a spec y plan, y lo pendiente).

Reglas de calidad que cada plan copia como criterios de aceptación:
- **Seguridad**: validación en el servidor de todo lo que llega del público; consultas con parámetros; nada de datos del usuario en `innerHTML` sin `esc()` en la web; en React nada de `dangerouslySetInnerHTML`; enlaces `tel:`, `mailto:` y `wa.me` construidos solo con valores ya validados; respuestas de admin con `no-store` (ya lo hace `handleApi`); ninguna respuesta pública revela si un email existe.
- **Rendimiento**: el asistente no pesa en la home; nada de librerías nuevas para lo que el navegador ya hace (fechas, diálogos, validación).
- **Accesibilidad**: cada paso con su `<fieldset>` y `<legend>`, foco al título del paso al avanzar, errores asociados al campo, todo usable con teclado, contraste según DESIGN.md.
- **Limpieza**: sin código «para después», sin pestañas vacías, una sola fuente para las listas cerradas.

## 9. Queda para el constructor

Nombres internos, estructura de archivos dentro de `server/` y `admin/src/`, cómo se comparten las listas cerradas con la web, el texto exacto de los mensajes, y el diseño visual dentro de DESIGN.md. Lo que sí necesita a Luis antes de producción: el texto del aviso de privacidad y el plazo de respuesta que promete la pantalla final.
