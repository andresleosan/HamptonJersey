> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# SPR-01 Listing availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagentes de implementación solo con autorización aplicable.

**Goal:** Completar baños y fecha de disponibilidad en Listings con un contrato compartido con PUB-06.

**Architecture:** Extender `listings` con una fecha nullable, validarla en el servidor y editarla con el formulario existente. Reutilizar los formatos, las celdas responsive y el guardado con auditoría EST-18. Incorporar el campo a los triggers mediante una migración nueva, sin cambiar la proyección pública.

**Tech Stack:** React y JavaScript existentes, Cloudflare Pages/D1, SQLite, `node:test`, e2e Playwright y Playwright MCP. Sin paquetes nuevos.

**Spec:** [SPR-01 · diseño y decisiones D1–D10](../specs/2026-11-08-spr-01-listing-availability-design.md). Leer ambos documentos. Estado: plan preparado, pendiente revisión/aprobación de diseño y autorización futura de construcción; el encargo actual termina en documentos.

## Global Constraints

- Base: `6d2f77922f797a1ffd6a23e2030308440ca81adf`, `main`, comprobada contra GitHub el 8-nov-2026. Al ejecutar, volver a verificar preservando este trabajo y clasificar cualquier avance remoto.
- `available_from` es fecha opcional `YYYY-MM-DD`, año 0001–9999, o `null`; se permiten pasado/hoy/futuro. No es timestamp, fecha de visita ni confirmación.
- PUT parcial omitido conserva; `null`/vacío/espacios borran. Fecha no vacía con espacios, fecha imposible o tipos incorrectos: HTTP 400 con error de campo exacto del spec D3.
- Compartir nombre y semántica con PUB-06; este plan no completa sus demás campos económicos.
- Todo texto visible en inglés. Sin dependencias, fuentes ni assets nuevos, sin ampliación de endpoints públicos ni modificación de controles de infraestructura.
- Antes de código: reserva propia vigente, alcance exacto de producto y pruebas, revisión ligada a esos recursos y transición confirmada a `mode: build`. No usar este plan como atestación ni ejecutar `resume --mode build` durante el encargo solo de planificación.
- El número propuesto `0032` corresponde a la base inspeccionada; si otro trabajo lo ocupó, escoger el siguiente número libre antes de reservar/revisar ese path y registrar la elección. No sobrescribir otra migración.

## Review Focus

1. Fechas imposibles y año cero, frente a años bisiestos válidos: Task 1, tests V1/V2.
2. Omitir o borrar fecha frente a un formulario antiguo: Task 1, tests API1/API2 y Task 3, UI2.
3. Editar fecha sin confirmar disponibilidad ni perder cambios concurrentes: Task 1, API3/API4, Task 3, UI3.
4. Auditoría de columna nueva y datos existentes al recrear triggers: Task 2, EV1–EV4.
5. Baños cero/desconocidos y fecha conservada fuera del mercado, archivada o en otro huso: Task 3, UI1/UI4/UI5.

## Reglas concretas de DESIGN.md

Superficie: panel existente, `Listings.jsx` y `ListingEditor.jsx`. Tomar CSS vigente, no el YAML desfasado. La paleta descrita como propuesta en DESIGN.md ya está aplicada al panel según su anotación EST-09 y `admin/src/styles.css:1`.

| Aspecto | Valor que debe conservarse | Fuente y comprobación |
| --- | --- | --- |
| Paleta vigente | ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#6b665e`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, warn-bg `#fff6e5`, field-line `#8f8a82`. | DESIGN Colors, nota EST-09; CSS `:root`. Inspección de estilos calculados. Bronce pequeño usa bronze-dk. |
| Texto | Montserrat/system-ui `14px/1.5`; metadatos `12px`, stone; H1 Tenor Sans/Georgia/serif `26px`, peso 400; cabeceras `12px/600`, sentence case, sin tracking. | DESIGN Typography y Tables; CSS body/h1/.meta/.list th. |
| Espacios y tamaños | `.meta` flex-wrap con gap `4px 12px`; celdas `10px 12px`; `.grid2` columnas auto-fit `minmax(220px,1fr)`, gap `12px`; tarjeta padding `24px`, radio `14px`; miniatura `72×54px`, radio `8px`; botones padding `10px 20px`, píldora `999px`. | DESIGN Spacing/Components y CSS vigente. Reutilizar clases, sin crear tarjeta nueva. |
| Responsive | A `max-width:760px` la tabla usa tarjetas, columnas `72px 1fr`, gap `4px 12px`, padding `10px`. `.meta` envuelve. El nuevo campo debe caber también a 390px sin desbordar el grid. | DESIGN Tables y CSS responsive. Verificar 1280/390 y viewport equivalente al 200 %. |
| Campo y estados | `input type="date"` en `field()`/`ctl()`, etiqueta real; foco `2px` bronze, offset `2px`; error con `aria-invalid` y `aria-describedby`. Guardado usa `.actionbar`, Save deshabilitado cuando corresponda; éxito `role=status`, fallo `role=alert`. | DESIGN Inputs/Dialogs/Empty; editor existente. Conservar borrador en error y 409. |
| Accesibilidad | Texto normal ≥4.5:1, foco/controles ≥3:1; controles nativos, teclado completo, zoom 200 %, objetivo táctil de campo nuevo ≥44px móvil (propuesta adoptada para este control) y ≥32px escritorio; sin animación nueva. | DESIGN Requisitos verificables y propuesta Densidad, adoptada expresamente para el campo. Comprobar foco y estilos. |
| Rendimiento | Dos columnas más en el SELECT normal, ninguna petición por fila ni efecto nuevo. Conservar `?slim=1`, miniaturas y lazy loading. Sin biblioteca de fechas ni fuentes nuevas. | DESIGN Rendimiento; inspección de red/build durante ejecución. |
| Seguridad | Texto React escapado, sin `dangerouslySetInnerHTML`, sin estilos/handlers HTML inline nuevos; validación real en servidor y SQL con parámetros; sesión/CSRF y versión existentes. Datos/errores no van a localStorage ni a logs. | DESIGN Seguridad frontend; regresiones 400/401/403/409 y revisión de diff. |

No adoptar el rediseño propuesto de Properties como rejilla, una nueva paleta, nuevos badges ni skeletons: SPR-01 completa información en los componentes vigentes.

## Aportación de skills

- `brainstorming` y `grill-me`: spec separado, alternativas explícitas y decisiones D1–D10; resolver por lectura fecha vs confirmación, cero vs desconocido, concurrencia, publicación e historial. No hay aprobación inventada.
- `writing-plans`: tareas por entregable, rutas, contratos, pruebas y puertas de ejecución.
- `impeccable` (adapt): conservar jerarquía y densidad de la tabla; nuevos datos en spans y línea secundaria, con reflujo móvil y estados reales. Las reglas numéricas de Hampton prevalecen sobre sugerencias genéricas.
- `security-best-practices` y `frontend-security-coder`: whitelist, fecha real, parametrización, sesión/CSRF y JSX escapado; no hace falta instalar sanitizadores ni cambiar CSP para texto simple.
- `antislop`, durante el trabajo según decisión vigente de Luis: cada elemento cumple SPR-01; sin nuevos paneles estadísticos, iconos de relleno, assets ni datos fabricados. Dirección: DESIGN.md; no iniciar instalación ni volver a preguntar modo.
- `web-performance-optimization`: comprobar que la lectura sigue siendo una sola petición y que build no añade dependencia; registrar diferencias de bundle y cualquier advertencia previa, sin atribuir mediciones no realizadas.
- `ponytail`: reutilizar `realDate`, `fmtDayMonth`, `field`, `ctl`, guardado y pruebas existentes; un campo y, si procede, un helper de texto pequeño.
- `taste-skill`/`design-taste-frontend`: no aplica, no hay página nueva. `redesign-skill`/`redesign-existing-projects`: no aplica, no se rehace la pantalla.

## Mapa de archivos de la futura construcción

| Archivo | Responsabilidad |
| --- | --- |
| Crear `migrations/0032_listing_available_from.sql` | Columna nullable y recreación de los dos triggers de EST-18. |
| Modificar `server/listing.js` | `EDITABLE`, validación de fecha; conservar `toPublic` sin campo nuevo. |
| Modificar `server/routes/listings.js` | `LIST_SQL` añade baños y fecha; guardado conserva reglas actuales. |
| Modificar `admin/src/ListingEditor.jsx` | Añadir campo a FIELDS/formulario, hint accesible, guardar y descartar. |
| Modificar `admin/src/Listings.jsx` | Baños en meta, fecha en Availability solo para ON_MARKET sin archived_at. |
| Modificar `admin/src/listing-filters.js` | Exportar `bathsLabel(n: number|null|undefined): string` junto a `bedsLabel`; sin tocar filtros. |
| Modificar `admin/src/styles.css` | Solo si hace falta para el tamaño/reflujo del input fecha; reutilizar `.field`/`.grid2`, sin restyle. |
| Modificar `tests/server/listing.test.mjs`, `tests/server/listings-list.test.mjs`, `tests/server/listing-filters.test.mjs`, `tests/server/listing-events.test.mjs` | Validación, contrato admin/slim, plural y auditoría/migración. |
| Crear `tests/server/listing-available-from.test.mjs`; modificar `tests/e2e.cjs` | API completa y recorrido funcional con fixtures sintéticos. |
| Actualizar `docs/roadmap/ESTADO.md`, `docs/roadmap/tasks/SPR-01.json`, `docs/roadmap/tasks/PUB-06.json` y derivados mediante `scripts/render-roadmap.mjs` | Registrar solo lo realmente construido/verificado y el campo compartido; PUB-06 sigue parcial. Reservar generados antes de modificarlos. |

### Task 1: Fecha validada y contrato admin

**Interfaces:** `validateListing(input, {partial})` mantiene su firma y añade `available_from` a la whitelist; devuelve `{value}` o `{errors}`. POST `/api/admin/listings` y PUT `/api/admin/listings/:id` reutilizan sus rutas y validación. Los tests `call` usan `/admin/...`, como los existentes. GET normal expone `bathrooms:number|null` y `available_from:string|null`; slim conserva solo id/title/published/archived_at.

- [ ] Añadir V1 a `listing.test.mjs`: `2028-02-29`, `2026-01-01` y `0001-01-01` aceptados sin cambio; `null`, `""`, `"   "` → null; omitido en partial → sin clave.
- [ ] Añadir V2: `2026-02-29`, `2026-02-30`, `2026-13-01`, `0000-01-01`, timestamp, texto con espacios, número, array y objeto → `errors.available_from` exacto de D3.
- [ ] Añadir API1/API2 en `listing-available-from.test.mjs`: crear omitido/null/fecha, editar, GET detalle/lista, borrar con null y conservar al editar solo título; slim no añade claves. Listados conservan bedrooms/matched/interested y devuelven baños 0/null/2.
- [ ] Añadir API3/API4: actualizar solo fecha conserva confirmed_at/availability/published; Still available conserva la fecha; 400 no modifica fila; dos PUT con misma versión dan 200+409 y un solo valor ganador. Peticiones sin sesión o sin protección CSRF válida conservan el rechazo actual.
- [ ] Ejecutar `node --test tests/server/listing.test.mjs tests/server/listings-list.test.mjs tests/server/listing-available-from.test.mjs`; comprobar RED debido a contrato ausente.
- [ ] Crear la migración nueva con `ALTER TABLE listings ADD COLUMN available_from TEXT;`. En `server/listing.js`, añadir la clave a EDITABLE y rama antes de specs: tras blank, `realDate(v)` y año >0, error de D3; sin timestamp/trim implícito. Añadir `l.bathrooms, l.available_from` a LIST_SQL.
- [ ] Repetir el comando y comprobar PASS; verificar que `toPublic` mantiene exactamente su contrato y `checkPrice` no obliga la fecha. Conservar `afterSave(recomputeForListing, ...)`: no incorporar la fecha al criterio de matching ni suprimir el recálculo normal de un guardado.
- [ ] Commit acotado de schema/API/tests, sin aplicar migraciones remotas. Los siguientes pasos completan el historial antes de revisar una entrega publicable.

### Task 2: Historial atómico para la columna nueva

**Interfaces:** conservar `listingBatch`, contexto/clock, revisiones y formato JSON EST-18. Añadir solo la clave `available_from` a los eventos de la columna nueva; conservar nombres y comportamiento de todas las demás claves y triggers.

- [ ] Añadir EV1 en `listing-events.test.mjs`: crear con fecha registra `after.available_from`; cambiar fecha produce evento con before/after/fields correctos; borrar registra after null. Cambiar solo fecha no añade confirmed_at a fields.
- [ ] Añadir EV2: fecha igual no agrega evento; stale 409 y fecha inválida no agregan evento ni dejan contexto residual.
- [ ] Añadir EV3: trigger de fallo sintético de events revierte fecha y updated_at. Mantener regresiones existentes de precio, texto privado, publicación, archivado y borrado.
- [ ] Añadir EV4: migrar base poblada hasta 0031, aplicar la nueva migración en transacción; comparar filas previas, eventos/notificaciones y foreign_key_check; columna nueva null; escritura posterior conserva auditoría tanto de precio como de fecha. Ejecutar también `PRAGMA integrity_check`.
- [ ] Ejecutar `node --test tests/server/listing-events.test.mjs tests/server/listing-available-from.test.mjs` y comprobar RED del evento faltante.
- [ ] En la misma migración nueva, `DROP TRIGGER listing_event_insert; DROP TRIGGER listing_event_update;` y recrearlos a partir de 0029 agregando available_from en fields/after del insert y before_values/after_values/changed del update. No reescribir 0029 ni cambiar otros triggers, FKs, IDs o eventos existentes.
- [ ] Repetir el comando y comprobar PASS. Revisar diff de los cuerpos con los originales para detectar pérdida de campos o reglas de no-op.
- [ ] Commit de auditoría y regresiones; anotar que la migración de Task 1 solo está completa tras Task 2. No publicar una entrega intermedia.

### Task 3: Editor y filas desktop/móvil

**Interfaces:** `bathsLabel(null|undefined) → ""`, `bathsLabel(0) → "0 baths"`, `bathsLabel(1) → "1 bath"`, `bathsLabel(2) → "2 baths"`. Editor: `FIELDS` incluye available_from; `toForm` null→"" y `toBody` ""→null existentes. Formato de fecha: `fmtDayMonth(d)` conserva año y día UTC, sin llamar a `fmtDate`.

- [ ] Añadir UI1 a `listing-filters.test.mjs` con las cinco salidas del helper; mantener bedsLabel(0)=Studio y filtros sin alteración.
- [ ] Añadir recorrido UI2 a `tests/e2e.cjs`, fixtures locales: abrir editor, introducir fecha, Save/recarga, editar título y conservar fecha, cambiar fecha y Discard, borrar y Save. La etiqueta/hint están asociados y Save se habilita solo al cambiar.
- [ ] Añadir UI3: interceptar una respuesta 400 para fecha y una 409 sin modificar producción; el borrador se conserva, error de campo enlazado por aria-describedby y mensaje de fallo con role=alert. La API real se valida en Task 1, no sustituirla por mocks aprobatorios.
- [ ] Añadir UI4/UI5: filas con baths 0/1/2/null, Studio, fecha null/pasada/futura; To confirm y visibilidad conservados. Sold/Withdrawn y archivadas con `for_sale`/`to_let` no muestran línea activa y conservan fecha en editor. Comprobar el mismo `12 Nov 2026` para `2026-11-12` en contextos de navegador Europe/Jersey y America/Los_Angeles.
- [ ] Ejecutar test de helper y recorrido focal local; comprobar RED del helper, campo y texto faltantes.
- [ ] Implementar helper y spans en la meta existente. Importar ON_MARKET y fmtDayMonth; fecha opcional en un bloque secundario de la celda de disponibilidad solo si `l.archived_at == null` y `ON_MARKET.includes(l.availability)`. Añadir input/hint al editor con IDs y contrato de D5. No ocultar/eliminar el dato al cambiar la operación; no alterar prepub ni toPublic.
- [ ] Verificar contraste, foco y tamaños del nuevo control. Si el input nativo desborda a 390px, ajustar únicamente su contenedor con min-width:0 y ancho disponible, sin alterar el grid global.
- [ ] Repetir helper/e2e; comprobar PASS con estados vacíos, loading/error ya existentes, teclado y controles sin pérdida de foco inesperada.
- [ ] Commit de interfaz, helper y pruebas, con archivos concretos.

### Task 4: Verificación y cierre de la implementación futura

- [ ] Reservar `e2e:<hostId>` antes del servidor/fixtures compartidos. Ejecutar `npm test`, `npm run build`, `npm run check:release` y el e2e completo según cabecera de `tests/e2e.cjs`/`npm run test:e2e`, solo datos y D1 locales.
- [ ] Playwright MCP local a 1280 y 390px: camino guardar/recargar/borrar, Discard, unknown/0/Studio, Sold/Withdrawn, error 400, 409, teclado, foco, zoom 200 %, consola y red. Capturas en ubicación de evidencias del entorno; en Hermes `/home/taller/encargos/capturas`. Registrar lo comprobado y lo bloqueado, sin desactivar sandbox ni protecciones.
- [ ] Comparar número de llamadas al cargar la lista antes/después: una GET admin normal; no peticiones por propiedad. Registrar bundle y advertencias de build sin inventar métricas.
- [ ] Actualizar ESTADO y las tareas canónicas SPR-01/PUB-06; regenerar checklist/reparto/catalog/work-units según el renderer y ejecutar `npm run team:check`. Reservar estos paths antes; si otro trabajo los tiene, integrar por relevo/turno cuando corresponda sin editar lo ajeno. Mantener PUB-06 parcial y registrar la fecha única ya implementada cuando lo esté.
- [ ] Revisión independiente del diff y evidencia; corregir hallazgos importantes, repetir comprobaciones afectadas y actualizar ledger. Analizar siguiente tarea con la rúbrica de modelo/esfuerzo antes del commit final.
- [ ] Entregar el SHA exacto revisado; aplicar migración de producción y publicar solo con autorización específica y turno válido. Hasta entonces distinguir construido, probado, local, publicado y activado. No solicitar turno de publicación ni evidencia integrated por esta entrega de planificación.

## Condición de entrega de este encargo de planificación

Spec, plan y ledger revisados y sin cambios de producto. Comprobación documental de enlaces, rutas y cobertura A1–A7 y `git diff --check`. Con revisión documental real, una identidad coordinadora puede registrar evidencia `design` ligada al alcance actual y ejecutar `complete` en modo plan: cierra solo la planificación, no la construcción. No requiere `submit`, integración ni publicación. El servidor actual rechaza `submit` con archivos desde plan; no falsear `changedPaths` ni cambiar a build para eludirlo. Los documentos locales se conservan y otra tarea requiere una copia limpia. Playwright, tests de producto, build y migraciones: no ejecutados en esta entrega; Playwright no aplica a documentos. No registrar evidencia integrated o activated ficticia.
