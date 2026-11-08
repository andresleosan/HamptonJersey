# SAP-01 Search progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Encargo actual SOLO PLANIFICACIÓN: todos los pasos de producto siguientes están pendientes.

**Goal:** Mostrar estado y fechas verificables de comprobaciones completas de inventario, con EST-01 como prerrequisito separado.

**Architecture:** Fase A instrumenta recomputeForApplicant con progreso1:1 y tickets de generación; fase B presenta su proyección en Applicants y ficha. No usar eventos de matches como reloj ni introducir scheduler, servicios o dependencias.

**Tech Stack:** JavaScript/React/Vite, Pages Functions, D1/SQLite, node:test y Playwright existentes.

**Spec:** [SAP-01 + prerrequisito EST-01, decisiones D1–D7](../specs/2026-11-08-sap-01-search-progress-design.md).

## Global Constraints

- Base main93f8f25c0aa029f1850f0c46855fb89fd524a8e3 comprobada8-nov-2026. Antes de construir, verificar remoto y conservar estos documentos/cualquier entrega local.
- Lista1. Solo documentos hoy. FaseA=contrato EST-01; faseB=SAP-01. Registrar estados separados: ninguna fase termina por escribir este plan.
- Antes de producto: atestación real del alcance de EST-01/SAP-01, dependencias y reserva build confirmadas. EST-01 depende de BUS-01/EST-09; SAP-01 de EST-01 integrado. Si el alcance local exige desglosar unidad, resolverlo en catálogo revisado antes de claim, sin asumir permiso.
- scope=hampton_inventory; solo full recomputeForApplicant actualiza last_attempt/last_success. No prometer fuentes externas/disponibilidad; no tocar score/tope ni cierre humano.
- Progreso no modifica applicants.updated_at/contactos.last_activity_at/last_contact_at; FK ON DELETE CASCADE. Cero backfill de fechas y cero PII nueva persistida/expuesta.
- Una sola búsqueda vigente por ticket; éxito y resultados en mismo batch, falla conserva último éxito. GET y Reload status nunca escriben ni recalculan.
- Poll30000ms solo visible/sesión activa; filtros conservan debounce200ms. Umbral120000ms es aviso de falta de finalización, no timeout/cancelación de operación.
- Diseño vigente D6: paleta exacta, Tenor26/19/400, Montserrat14/1.5 y12 secundario, contenedor1240/padding24 16 120, radio14/padding24, espacios8/12/16/24, foco2/offset2, controles32px escritorio/44px móvil, reflow760 y verificación1280/390/zoom200%. Sin librerías/fuentes/animaciones nuevas.

## Review Focus

1. Cero matches creados no prueba inventario vacío; rechazadas/preseleccionadas y páginas no son denominador de búsqueda (Tasks3/4).
2. Fallo, intento anterior y cambio de versión/cierre no deben escribir éxito ni mantener un running falso (Tasks1/2).
3. Actualización de una vivienda no equivale a comprobación completa; no falsear fechas por side effects (Task2).
4. Reloj del dispositivo, DST, fecha inválida y respuesta HTTP tardía no deben inventar actualidad (Tasks3/4).
5. Refresco automático no cambia retención, formulario, foco, filtros, sesión o comportamiento público del alta (Tasks2/4/5).

## Mapa de archivos

Crear server/search-progress.js (persistencia/proyección de progreso), site/search-progress.js (contrato de presentación puro sin APIs de servidor), admin/src/SearchProgress.jsx (componente), migrations/0032_applicant_search_progress.sql (tabla1:1), tests/server/search-progress.test.mjs, tests/search-progress.test.js y tests/search-progress.e2e.cjs.
Modificar server/match-store.js, server/routes/applicants.js, admin/src/Applicants.jsx, admin/src/ApplicantDetail.jsx y admin/src/styles.css. Extender tests/server/match-store.test.mjs, tests/server/applicants.test.mjs, tests/server/match-hooks.test.mjs y tests/server/search-lifecycle.test.mjs. Reutilizar admin/src/poll.js, admin/src/api.js, tests/run-e2e.cjs y tests/serve-e2e.cjs sin reescribirlos.

0032 es nombre propuesto sobre la base inspeccionada; BUS-14/SPR-01/PUB-06 pueden ocuparlo antes. Elegir siguiente número libre al preparar alcance y registrarlo en spec/ledger; nunca sobrescribir otra migración. Los nombres de archivos de módulos son decisiones de este plan, no módulos ya presentes.

## Task1 · EST-01: almacenamiento, tickets y proyección

**Files:** crear migración, server/search-progress.js y tests/server/search-progress.test.mjs; extender search-lifecycle.test.mjs.
**Interfaces:** beginFullCheck(env,applicant,{nowIso}):Promise<CheckTicket|null>; CheckTicket={applicantId:number,seq:number,inputVersion:string,startedAt:string}. fullCheckGuard(ticket):{sql:string,args:Array<string|number>} produce guard de ticket/versión/actividad. fullCheckSuccessStatement(env,ticket,{finishedAt,checkedCount}) devuelve sentencia para el batch del escritor. finishFullCheckFailure(env,ticket,{finishedAt}):Promise<boolean>. projectSearchProgress(applicant,row,nowIso):SearchProgressV1 pura con esquema D3.

- [ ] Escribir casos makeEnv/SQLite: legacy→unrecorded y null; begin incrementa seq incluso con misma hora y preserva éxito; ticket anterior no finaliza; versión/cierre/archive/comercial impiden una ejecución válida; primer intento fallido sin éxito previo no inventa fecha; fallo conserva last_success; una fila por búsqueda y cascada real. Probar a la vez dos begins y que cada ticket pertenece a la secuencia obtenida por su operación atómica.
- [ ] Ejecutar node --test tests/server/search-progress.test.mjs tests/server/search-lifecycle.test.mjs; comprobar RED real sin usar fallos de entorno como prueba.
- [ ] Crear tabla exactamente D1 con CHECKs/nullable y sin backfill. Implementar begin atómico que devuelve su propia secuencia en la misma operación; no adoptar una secuencia por lectura posterior. Implementar guards y sentencias de cierre sin tocar versiones de edición/actividad personal.
- [ ] Implementar proyector con precedencia D3:120000ms exactos, versión antigua, lifecycle y comercial. Cada fecha debe ser UTC ISO válida y no posterior al now de lectura; inconsistencia degrada a estado no verificable, sin inventar éxito. No persistir el estado derivado interrupted por un GET.
- [ ] Repetir comando hasta PASS. Probar instalación limpia y migración sobre fixture poblada: matches/events/contactos intactos, foreign_key_check vacío, integrity_check=ok y conservación de updated_at/retención.

## Task2 · EST-01: instrumentar el recálculo completo real

**Files:** modificar server/match-store.js; extender match-store.test.mjs, match-hooks.test.mjs, search-progress.test.mjs y search-lifecycle.test.mjs. Leer server/routes/public.js, server/routes/matches.js y sales/listings consumidores de afterSave.
**Interfaces:** recomputeForApplicant(env,id,actor,restoreNotice=false) conserva {created}; afterSave conserva contrato de no rechazar tras guardado; recomputeForListing no afirma progreso full. Consume ticket/guard/cierre de Task1.

- [ ] Añadir pruebas de: inicio visible antes de evaluación; success solo cuando el batch de matches termina; cero incorporaciones con coincidencias previas; cero candidatas como éxito; excepción de evaluación y rollback del batch; dos ejecuciones finalizadas en orden inverso; edición/cierre antes del commit; éxito seguido de fallo preserva hora anterior; listing incremental no cambia last_success. Comprobar eventos/decisiones existentes y restoreNotice.
- [ ] Ejecutar node --test tests/server/search-progress.test.mjs tests/server/match-store.test.mjs tests/server/match-hooks.test.mjs tests/server/search-lifecycle.test.mjs; registrar RED pertinente.
- [ ] Instrumentar solo full recompute elegible: comenzar ticket, añadir fence a todas sus escrituras y sentencia final de éxito al mismo batch. Comprobar efecto de la sentencia final; guard fallido no es éxito. checkedCount cuenta entradas del inventario candidato evaluadas, no matches creados ni Shortlisted fuera del inventario.
- [ ] En error registrar failed solo para ticket/versión vigente, sin enmascarar el error original si también falla esa escritura; afterSave conserva guardado y emite únicamente código operativo fijo sin datos del cliente. Si begin falla, no ejecutar sin ticket y no inventar hora de fallo.
- [ ] Mantener waitUntil del alta pública y sus respuestas iguales para duplicado/alta; no introducir telemetría que revele existencia del contacto. Comprobar que no cambia last_activity_at por comprobar inventario ni el filtro de búsquedas activas.
- [ ] Repetir comando hasta PASS. Si BUS-14 está integrado, conservar sus guardas de vivienda, candidatos sin cap y eventos efectivos; si no, no implementarlos de rebote por esta tarea.

## Task3 · EST-01: API de progreso y contrato de consumidor

**Files:** modificar server/routes/applicants.js; extender applicants.test.mjs y search-progress.test.mjs; crear site/search-progress.js y tests/search-progress.test.js.
**Interfaces:** GET /admin/applicants/:id/progress → {applicant_id,search_progress,match_counts,server_time}, con match_counts={found,shortlisted,rejected} globales. list/detail añaden el mismo SearchProgressV1 y match_counts. describeSearchProgress(progress,{found,shortlisted,rejected},serverTime):{message:string,tone:string,attemptLabel:string|null,successLabel:string|null,isCurrent:boolean}; fmtSearchCheckTime(iso):string, Europe/Jersey explícito.

- [ ] Probar401 sin sesión,404 inexistente, ID0 o entero no seguro400 y segmento no numérico404 por router, lectura sin modificaciones de DB y misma proyección en listado/detalle/progress. Todas las búsquedas, incluidas las sin fila, siguen apareciendo; todos los filtros/contadores conservan significado. Cambiar matches entre dos lecturas no puede combinar éxito nuevo con counts antiguos; probar una incorporación tras la carga inicial de detalle y antes del primer poll. Verificar número de consultas independiente de número de filas: LEFT JOIN1:1, no una por aplicante.
- [ ] Ejecutar node --test tests/server/search-progress.test.mjs tests/server/applicants.test.mjs tests/search-progress.test.js y comprobar RED.
- [ ] Añadir SELECT/LEFT JOIN, incluyendo applicants.updated_at interno, y endpoint protegido con IDs parametrizados. Leer applicant/progreso/counts de la misma instantánea SQL/DB.batch y devolver los tres counts globales con cada respuesta; no calcularlos desde páginas. No enviar información de contactos ni excepciones internas en /progress. Capturar nowIso/server_time después de obtener la instantánea; usar esa misma hora para todas sus filas. Probar begin concurrente entre inicio de petición y SELECT para evitar falso unverifiable.
- [ ] Implementar presentación pura D4, incluyendo cero con rechazadas frente a cero sin historial y count global, no tamaño de página/created. Formato en-GB/Europe/Jersey, null→etiqueta omitida y fecha exacta accesible. Failed sin éxito no promete un éxito debajo ni una nota de versión anterior; solo mostrar esa nota con fecha válida existente. No cambiar fmtDate global.
- [ ] Añadir pruebas de DST invierno/verano de Jersey y navegador en otra zona, reloj cliente desplazado, ISO inválido/futuro, umbral120s, ausencia de fechas y state=unverifiable/copy exacto ante inconsistencia. Ejecutar hasta PASS sin necesitar servicios externos.

## Task4 · SAP-01: lista y ficha sin pérdida de edición

**Files:** crear admin/src/SearchProgress.jsx y tests/search-progress.e2e.cjs; modificar Applicants.jsx, ApplicantDetail.jsx y styles.css; reutilizar SearchLifecycle.jsx sin cambiar sus transiciones.
**Interfaces:** SearchProgress({progress,serverTime,counts,compact=false,refreshError=null,onReload}) consume Task3; no ejecuta matching. El padre de detalle conserva su formulario y solo refresca progreso/match_counts/server_time/estado de conexión como snapshot, no setData de todo el registro.

- [ ] Preparar e2e local con estados unrecorded/running/succeeded-empty/failed-with-success/interrupted/version-old/resolved/archived/commercial. Añadir cero con todas rechazadas y una preseleccionada no visible en primera página; la UI no confunde esos casos.
- [ ] Ejecutar E2E_SCRIPT=tests/search-progress.e2e.cjs npm run test:e2e y comprobar RED previo a la UI. Usar únicamente runtime/fixtures locales existentes.
- [ ] Añadir variante compacta bajo Queue y bloque completo junto a SearchLifecycle; mostrarlo en Matches sin duplicar anuncios. Conservar columnas/filtros existentes y no modificar semántica de Queue/Stage/Matches. Renderizar <time dateTime> y copy exacto D4 con ámbito visible en detalle.
- [ ] Reutilizar usePoll30000ms con callback visible y no solapado: listado conserva debounce200ms/filtros; detalle usa /progress. Invalidar respuestas tardías por ID/generación y descartar después de desmontaje/cambio de filtros y tras Save/Apply, resolución/reapertura, archivo/restauración, revisión/Undo locales aunque el ID se conserve. Parar con sesión caducada siguiendo hs:signed-out; no nuevos intervals/daemons.
- [ ] Implementar error/reintento de lectura sin borrar snapshot: indicar Last recorded status y Couldn't refresh search status.; Reload status min32px/44px, solo GET. Un fallo de lectura no se presenta como fallo de matching ni deja running actual sin verificar. Mantener fechas relativas fuera de la región live para no anunciar cada tick. No se modifica el formulario, sucio, foco o razón de cierre al refrescar.
- [ ] Aplicar paleta y tamaños D6 mediante clases existentes, reflow bajo760, status polite único en detalle por cambios reales, sin anuncios de todas las filas ni cada segundo. Sin nuevas fuentes/animaciones/tarjetas decorativas.
- [ ] Repetir e2e hasta PASS. Probar1280/390, Tab/Enter, foco inmóvil en polling, zoom200%, errores/vacíos, fecha DST, respuesta vieja posterior a navegación y a guardado/cierre/review del mismo ID, hidden tab sin peticiones y vuelta visible,401, consola/red y sin overflow.

## Task5 · Verificación integrada y entrega futura

**Files:** los anteriores, spec/plan/ledger, fuentes canónicas de EST-01/SAP-01 en docs/roadmap/tasks, ESTADO/checklist/derivados cuando exista código. No editar HTML/JSON de producto para declarar terminada la planificación.

- [ ] Al empezar código, verificar dependencias reales: BUS-01/EST-09 para EST-01 y EST-01 integrado para SAP-01. Preparar alcance exacto revisado por unidad con documentos/producto/pruebas y e2e:hostId; confirmar build. Si se requiere desglose del alcance local, concretarlo en catálogo revisado sin fabricar evidencia.
- [ ] Ejecutar npm test, npm run build y npm run check:release; separar errores nuevos/previos/ambientales. Ejecutar npm run test:e2e, E2E_SCRIPT=tests/search-progress.e2e.cjs npm run test:e2e y E2E_SCRIPT=tests/search-lifecycle.e2e.cjs npm run test:e2e usando fixtures limpios por recorrido.
- [ ] Playwright MCP a1280/390 con éxito, errores, vacíos, teclado/foco, zoom200%, consola/red. Comprobar que el polling no pierde edición ni produce peticiones ocultas/solapadas; no sustituir la comprobación por build. Capturas en carpeta autorizada del entorno; en Hermes /home/taller/encargos/capturas.
- [ ] Revisión independiente del diff, especialmente fences/transacción/retención/public duplicates. Corregir hallazgos importantes y repetir las pruebas afectadas. Esta revisión documental no valida ese código futuro.
- [ ] Registrar por separado EST-01/SAP-01 construido/verificado/integrado/activado y lo que falte del inventario común. Migración por flujo autorizado, commit concreto y aprobación de SHA antes de publicar. No probar producción mediante recálculos masivos no autorizados.

## Skills y decisiones aplicadas

writing-plans: interfaces, archivos y pasos RED/GREEN; brainstorming/grill-me: alcance aprobado, semántica full/incremental, fallos/concurrencia y prerequisito separados. impeccable/antislop: estados/copy concretos, contraste, teclado y energía operativa1/ritmo1/movimiento1. ponytail: una tabla1:1, proyección pura y componentes existentes; sin cola/cron/IA/dependencias nuevas. web-performance-optimization: LEFT JOIN, lectura pequeña y poll30s visible. security-best-practices/frontend-security-coder: sesión, IDs parametrizados, escape React y cero PII en nuevos registros/log/storage. taste-skill/redesign-skill no aplican a nueva página o rediseño general porque no existen en este alcance.

## Entrega de planificación

Diseño funcional aprobado; pasos de código sin ejecutar. Spec/plan/ledger se guardan en la copia de main comprobada, sin reserva, scopes, watch, submit o complete. La revisión documental y sus resultados reales se registran en el ledger. Playwright:no aplica a la entrega Markdown, obligatorio en Task5. No se afirma integración/activación de EST-01 o SAP-01 por tener estos documentos.
