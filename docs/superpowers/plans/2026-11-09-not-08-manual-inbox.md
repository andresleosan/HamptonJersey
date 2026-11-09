# NOT-08 manual Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No ejecutar código hasta resolver el bloqueo de coordinación y revisar diseño/alcance.

**Goal:** Categorías Agency replies, Messages y Compliance con tareas y destinos comunes, sin activar canales externos.

**Architecture:** Ampliar el contrato cerrado de categorías de NOT-11/NOT-01; reutilizar proyección, reconciliación, filtros SQL, preferencias, recibos y follow-up. Una tarea conserva su identidad al cambiar categoría.

**Tech Stack:** JavaScript ESM, React 19, D1/SQLite, pruebas Node y e2e locales existentes.

**Spec:** [diseño propuesto](../specs/2026-11-09-not-08-manual-inbox-design.md).

## Global Constraints

Base 79ddcb0. EST-17 conserva reserva y turno; no modificar su copia, SHA o estado. NOT-08 requiere reserva propia build y alcance revisado. NOT-11/EST-18 base integrated satisfacen el tramo manual; correo/Meta condicionan solo sus canales reales. Migrar/publicar requiere aprobación independiente del SHA final.

Tokens vigentes de styles.css, frente a la cabecera antigua de DESIGN.md: ink #151515, paper #ffffff, mist #f4f3f0, line #e3e0da, stone #6b665e, bronze #a56b3d, bronze-dk #86542d, ok #2f6b4f, err #a32020, warn-bg #fff6e5, field-line #8f8a82. Tenor Sans/Georgia H1 26px/H2 19px/peso400; Montserrat/system-ui 14px/1.5, labels12px. Page1240px/padding24px16px120px; card24px/radio14px; field9px12px/radio10px; btn10px20px/radio999px, hoverbronze-dk/disabled.45. Gaps8/12/16/24px. Reusar seg/field/btn/warn/empty/inbox-list. Container820px y móvil760px; controles36px escritorio/44px móvil; foco2px bronze-dk/offset2px; contraste texto4.5:1 y foco3:1. Teclado/aria-pressed/status/alert/labels, 1280/390/zoom200, reduced motion. Inglés, sin nuevas fuentes/animaciones/librerías. Sin PII en storage, URL, logs o documentos públicos. Mantener batch/CAS, límite200, polling30s visible y SQL agregado; no N+1.

Skills: avanzar para coordinación; brainstorming/grill-me para decisiones y riesgos del spec; executing-plans/TDD para RED→GREEN; impeccable/product y antislop durante el trabajo para legibilidad y estados; security-best-practices/frontend-security-coder para validación/privacidad/permisos; web-performance-optimization para consultas/polling; ponytail para reutilizar contratos. Taste/redesign no aplican a ampliación funcional sin rediseño.

## Review Focus

- Compatibilidad de operation_id antiguo y nuevo: omitir categoría conserva el hash histórico, Task2.
- Reconstrucción de tabla no rompe vistas/triggers/FKs o contexto de 0033/EST-17, Task1.
- Un compañero cambia categoría mientras existe borrador o retry incierto, Task3.
- Preferencias antiguas no pierden elecciones ni ocultan Needs action, Task1/2.
- Más de200avisos y Compliance resuelto en origen conservan contador/destino correctos, Task2/3.

## Task 1: Categorías y migración poblada

**Files:** crear `shared/notification-categories.js`, `migrations/0035_notification_categories.sql`, `tests/server/notification-categories.test.mjs`; modificar `server/notification-query.js` y dependencias SQL verificadas tras integrar EST-17.

**Interfaces:** exportar `TASK_CATEGORIES` con new_applicant/viewing/matched/task/agency_reply/message/compliance y etiquetas UI compartidas; mantener nombre exportado desde notification-query para callers actuales. DDL de migración conserva columnas y objetos existentes. El número0035 solo es válido después de0034 y con ruta libre; comprobarlo antes de revisión del alcance.

- [x] Resolver EST-17 mediante flujo autorizado; comprobar GitHub, base y diseño; revisar archivos/recursos notifications-schema/inbox-ui/agency-consultations-contract/messages-contract y obtener claim build NOT-08 confirmado. Watch foreground propio; no copiar identidades privadas.
- [x] Escribir pruebas `populated_migration_preserves_ids_reads_receipts_and_context`, `all_categories_round_trip`, `existing_preferences_are_unchanged` y `event_projection_survives_migration` sobre SQLite local poblada con FKs.
- [x] Ejecutar `node tests/server/notification-categories.test.mjs`: RED por categorías nuevas aún rechazadas, no por fixture roto.
- [x] Implementar catálogo mínimo y migración; nuevos compliance.updated se clasifican Compliance sin backfill histórico. Conservar triggers, vistas, índices y contenido. Cambiar preferencias no es responsabilidad de DDL.
- [x] Repetir focal: PASS, foreign_key_check vacío, filas/IDs anteriores conservados y evento nuevo proyectado una vez. Registrar evidencia en ledger.

## Task 2: API manual, filtros y productores actuales

**Files:** modificar `server/notification-tasks.js`, `server/notification-query.js`, `server/routes/notifications.js`, `server/routes/notification-tasks.js`, `server/notification-reconcile.js` y su productor real de checks/plazos si el preflight demuestra otra ruta; ampliar `tests/server/notification-tasks.test.mjs`, `tests/server/notifications.test.mjs`, `tests/server/notification-reconcile.test.mjs`, `tests/server/notification-events.test.mjs`.

**Interfaces:** createTask conserva firma `(env,actor,body)` y añade `body.category` opcional, allowlist task/agency_reply/message/compliance, defaulttask. taskTarget acepta rental manual con contexto cerrado y validación de pertenencia. Conservar byte a byte hash antiguo si category no existe; incluir categoría explícita en el hash nuevo. noticeDto mantiene enlaces internos existentes. Descriptores Compliance conservan taskKey al reconciliar.

- [x] Escribir casos de cada categoría manual, unknown400, destino inexistente409, contexto de otro rental rechazado, no actorHTTP, replay antiguo, replay nuevo y misma operation_id con categoría distinta409; fallo de inserción revierte evento+tarea+recibo.
- [x] Añadir casos de filtro/contador con201avisos, preferencias antiguas/nuevas, completados visibles, reclasificación de pendiente conservando identidad y `Done` sin alterar fuente Compliance.
- [x] Ejecutar suites focales directamente: observar RED concreto. Implementar extensión mínima sobre los helpers existentes y consultas parametrizadas; no generar eventos de canal ni modificar futureTaskStatements para fingir productores.
- [x] Repetir focales: PASS y sin pérdida de contratos NOT-11/NOT-01. Registrar firmas reales si el escritor difiere y ampliar alcance antes de tocar otra ruta.

## Task 3: UI, regresión y entrega

**Files:** modificar `admin/src/Inbox.jsx`, `admin/src/InboxPreferences.jsx`, `admin/src/InboxTask.jsx`, `admin/src/inbox-tasks.css`; crear `tests/notification-categories.e2e.cjs`, `docs/roadmap/work/NOT-08/implementation-evidence.md`; actualizar esta spec/plan/ledger, `docs/roadmap/ESTADO.md`, `docs/roadmap/tasks/NOT-08.json`, checklist y catálogo generado con scripts existentes, dentro del alcance revisado.

**Interfaces:** UI consume categorías compartidas; creación devuelve tarea con categoría real y `changed({task,action:'created'})` selecciona esa categoría. Se conservan callbacks dirty/pending y guard de navegación. Sin proveedor de correo/Meta nuevo.

- [x] Añadir e2e de siete filtros, contadores, vacíos por caja, selector manual y destino rental/applicant/viewing. Nueva categoría, carga/error/retry, destino borrado y 409 conservan información y foco.
- [x] Cubrir polling que mueve tarea entre categorías con borrador, retry incierto, lectura y preferencias. RED sobre base antes de UI; implementar reusando componentes actuales y labels del catálogo.
- [ ] Revisión visual y flujo completo Playwright MCP local1280/390/zoom200: teclado/foco, sin overflow, XSS escapado, consola/red, capturas solo con datos locales. Registrar bloqueo MCP como tal si existe; runner alternativo no lo acredita.
- [x] Reservar e2e del host antes del fixture compartido. Ejecutar focales, e2e general según cabecera de tests/e2e.cjs, `npm test`, `npm run build`, `npm run check:release`, `npm run team:check`, `npm run check:packages` y diffcheck. Distinguir fallos previos/bloqueados; no modificar controles para pasar.
- [x] Revisión independiente, arreglar hallazgos importantes y repetir pruebas afectadas. Actualizar estado por tramo con evidencias reales y siguientes productores/canales pendientes; no marcar toda la tarea hecha por preparar categorías.
- [x] Analizar siguiente tarea/modelo/esfuerzo según rúbrica, actualizar recomendación una sola vez en ESTADO y relevo; stage de archivos explícitos sin datos privados. Commit inglés, submit/turno y verificador antes de pedir aprobación del SHA exacto. Sin push ni migración remota hasta autorización.


Estado del recorrido: runner local1280/390/zoom200 y revisión visual PASS; MCP bloqueado antes de navegar por sandbox. No se certifica MCP. La última casilla de entrega cubre preparación local para revisar; migración/publicación siguen pendientes del sí sobre el SHA final.

## Autorrevisión documental

Aceptación1/4→Task1/2;2/3/5→Task2;6/7→Task3. Compatibilidad/privacidad/migración/permisos y bloqueo de coordinación explícitos. Firmas propuestas no se presentan como código existente. Revisión humana y construcción siguen pendientes.
