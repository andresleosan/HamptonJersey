# NOT-01 Event Inbox Build Implementation Plan

> **For agentic workers:** Usar superpowers:executing-plans en esta sesión. Revisión independiente del conjunto al terminar; TDD por tarea y ledger. No implementar antes de revisión de scope y claim build confirmado.

**Goal:** Conectar hechos y colas existentes al Inbox compartido con enlaces exactos y alertas urgentes opcionales.
**Architecture:** Triggers Feed/puente, destinos tipados NOT-11, reconciliador CAS acotado y UI existente. No cola, wrapper global DB ni reconstrucción histórica.
**Tech Stack:** JavaScript/React/D1/SQLite/Pages/Jobs existentes, sin dependencias nuevas.
**Spec:** [contrato9-nov](../specs/2026-11-09-not-01-event-inbox-build-design.md), sobre [plan8-nov](2026-11-08-not-01-event-inbox.md) conservado como antecedente.

## Global Constraints

Base3213c166 publicado; NOT-11/EST-18 evidencia integrated real. Preservar guardas, eventos y búsqueda EST-09. No modificar cron/infra/auth/credenciales ni activar canales. Migración0033 solo local durante construcción; aprobación separada de SHA para producción. Límites: Feed/Needs action200, historial50, identidades50 por pass, parámetrosD1≤100. Sin N+1 por fila; selección externa a ventana permite una consulta exacta adicional. Cada firma y cierre se revalidan dentro del batch, no solo CAS del cursor.

Valores DESIGN/CSS: ink#151515,paper#fff,mist#f4f3f0,line#e3e0da,stone#6b665e,bronze#a56b3d,bronze-dk#86542d,ok#2f6b4f,err#a32020,warn-bg#fff6e5,field-line#8f8a82. Tenor/Georgia26/19px400,Montserrat/system14px/1.5,labels12px400/600; página1240/24 16 120,card24/radio14,campo9 12/radio10,botón10 20/radio999,gaps8/12/16/24,containerInbox820/auto-fit. Foco2px bronze-dk/offset2,32+px/44px móvil, contraste4.5/3, reduced-motion; ENERGY1/RHYTHM1/MOTION1. Fuente DESIGN Colors/Components/Layout y admin/src/styles.css + inbox-tasks.css; no tratar tokens YAML antiguos o propuestas como CSS vigente.

## Review Focus

1. Triggers encadenados y guardas changes/rowid: Task1 prueba escritor real, no-op y fallo que revierte negocio.
2. Oferta Sales sobre evento applicant y pago movido/unmatched: Task1/3 prueban relación y selección exacta actual.
3. Snapshot obsoleto con evento nuevo y cursor perdedor: Task2 inyecta carrera dentro del batch y exige cero estado viejo.
4. Ciclo corregido/desaparecido/Done humano: Task2 exige cierre de anterior, reentrada explícita y nada por tick idéntico.
5. Permiso/pestaña oculta/respuesta tardía/elección fuera200: Task3 prueba privacidad, baseline, líder y borrador conservado.

## Task 1: Esquema, Feed atómico y destinos

**Files:** crear migrations/0033_notification_events.sql y server/notification-events.js; modificar server/notification-tasks.js,server/notification-query.js,server/routes/notification-tasks.js; crear tests/server/notification-events.test.mjs,notification-producers.test.mjs; ampliar expectativas justificadas en tests/server/events.test.mjs,listing-events.test.mjs,notifications.test.mjs,applicants.test.mjs,matches.test.mjs,rentals-overview.test.mjs y pruebasNOT11.

**Interfaces:** taskStatements/syncTask conservados, JSONbind1–50; target validado por fuente y relación, contexto tipado; futureTaskStatements(env,{work,phase,episode,target,eventId,...}) solo work must/source/call/capture/review21/dictation, fase declarada por productor y clave estable por asunto/episodio. No API pública de descriptores. GET /admin/notification-alerts metadata urgente autenticada, sin contenido personal.

- [x] RED: migración poblada, grupo50 con límite100params, offer/sale sobre applicant, puente rental/unmatched sin PII, fuente desconocida/legacy sin duplicar; fallos de proyección revierten el batch y conservan rowid/changes de escritor real.
- [x] Implementar0033, índices/triggers y adaptación mínima helper/query; no sobrescribir eventos existentes. Scope valida los campos/contextos y borra target atómicamente, DTO link/phone nulos al faltar.
- [x] Pruebas de todos los eventos allowlist reales (viewing/sales/rentals/listing), guardas no-op/409, borrado/cascada/retención/replay/fuente tardía y firma/ID de destino inmutable. Replay de recibo manual pre0033 conserva hash exacto;50descriptores se prueban con adaptador que impone100binds, flags omitido/null y capturas de IDs divergentes.
- [x] PASS focal y regresión de events/listing-events/notifications/applicants/matches/rentals, sin afirmar productores futuros activos.

## Task 2: Pendientes actuales y cursor seguro

**Files:** crear server/notification-reconcile.js y tests/server/notification-reconcile.test.mjs; modificar server/routes/rent.js y server/routes/sales.js para compartir exportaciones de reglas existentes (incluido Waiting offers),server/jobs.js y tests/server/jobs.test.mjs. No reimplementar dinero/plazos ni añadir cron.

**Interfaces:** notificationsPass(env,isoNow):{processed,hasMore,contended}; máximo50 total. Query builders comparten lectura y predicado/firma de revalidación SQL. Ciclos del spec; observations y cursor en0033. Jobs usa processing now, aisla fallo de esta pasada. Un evento real de observación nuevo determina sourceVersion; nada por firma idéntica.

- [x] RED: cada cola, mismo tick doble, CAS perdido, carrera que paga/cierra/corrige entre lectura y escritura, rollback, guardas de tiempo antiguo y madrugada Europe/Jersey.
- [x] Implementar lectura agrupada/cursor estable y batch CAS abortante + observación guardada + tarea ifInserted + cursor final. Revalidar cierres y altas, observar pendientes propios que desaparecieron. Ningún grupo expande sin límite.
- [x] Probar continuidad con>50 fuentes distribuidas, cierre del paso/ciclo anterior, Done humano estable con preserveDone, reentrada real, archivo/borrado y nada diario repetido. Emergency→routine→emergency y pago asignado→unmatched entre ticks reabren; título/open→open/importe corregido no reabren. Incluir Waiting offers y sus backups.
- [x] PASS focal, jobs/email/retention continúan sin cambios de red ni envíos extra.

## Task 3: UI exacta y notificación nativa

**Files:** modificar admin/src/App.jsx,Inbox.jsx,InboxTask.jsx,Sales.jsx,SaleDetail.jsx,Rentals.jsx,RentalDetail.jsx,inbox-tasks.css; crear admin/src/browser-alerts.js,admin/src/BrowserAlerts.jsx,tests/browser-alerts.test.js,tests/notification-events.e2e.cjs; modificar server/routes/sales.js y server/routes/rent.js para GET exacto protegido de oferta/pago; ajustar tests/e2e.cjs solo si expectativas del nuevo comportamiento lo requieren.

**Interfaces:** Sales({requestedOffer}),SaleDetail({requestedMilestone}),RentalDetail({selection}),Rentals({requestedPayment,unmatched}); validar relaciones/IDs y mantener borradores. GET /admin/offers/:id y /admin/payments/:id auténticos, no sustitución genérica. Controlador browser-alerts inyectable con Notification/WebLocks/BroadcastChannel/fetch/visibility para pruebas; UI permiso explícito/status y textos exactos del spec.

- [x] RED browser-alerts: sin auto prompt, denied/unsupported, baseline global con>200 históricos, deltas>200 con hermanos de misma versión y cursor compuesto, metadatos sin PII, dos pestañas/un líder/handoff, cancelación de fetch y cierre/caducidad sin alerta tardía.
- [x] RED e2e real de controles/casos nuevos antes de UI; fixture propia local sobre0033, dos ofertas/contratos/pagos, pasado, desaparecido, selección fuera200 y respuesta concurrente con borrador.
- [x] Implementar enlaces/contextos y control opcional nativo, polling solo visible/autorizado. Click nativo a Inbox y sin contenido del cliente en Notification/canal/almacenamiento.
- [x] Recorrido1280/390/zoom200, foco/teclado, load/vacío/error/validación, dos actores y consola/red. MCP intentar según entorno; si falla sandbox, anotar pendiente y usar runner separado sin fingir MCP pasado.

## Task 4: Entrega del tramo

**Files:** tres documentos9-nov, docs/roadmap/tasks/NOT-01.json,docs/roadmap/work/NOT-01/producer-evidence.md,ESTADO y generados catalog/checklist/reparto/coordinationpublic. Conservar250códigos/23paquetes, historialEST18 aplazado y canales futuros sin cerrar.

- [x] npm test/build/check:release y e2e general+focal secuenciales con assets estables. Catalog/paquetes y links correctos. Registrar RED/PASS reales y cualquier limitación.
- [x] Revisión independiente del conjunto, corregir importantes con regresión y repetir solo lo afectado; gate antislop4bloques con click-through real.
- [ ] Analizar próximoNOT08/NOT09/NOT05 según dependencias, actualizar estados locales/lo no publicado y relevo; commit inglés de rutas concretas, submit/turno y nuevo sí por SHA para0033/publicación.

Skills: brainstorming/grill resuelven ramas leyendo código y decisiones existentes, sin reentrevistar. Writing-plans fija contratos; executing-plans/TDD implementan inline y reviewer independiente al final. Impeccable/antislop conservan operación y foco; taste/redesign no aplican a una página nueva. Security/frontend: sesión/CSRF, binds, pointers, privacidad/permiso nativo; web-performance: lotes, índices y polling; ponytail: reusar helpers/SQL y componentes, cero dependencia/cola nueva.
