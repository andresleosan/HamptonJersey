# NOT-11 Shared Tasks Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans en esta sesión; revisión independiente al finalizar. No construir sin scope y reserva build confirmados.

**Goal:** Gestión compartida y consistente en el Inbox existente.
**Architecture:** Metadata aditiva sobre notifications, sentencias componibles D1 y recibos por actor/operación; React reutiliza la lista/detalle actual.
**Tech Stack:** Node, JavaScript ES modules, React19, D1/SQLite, Pages/Workers; sin dependencias nuevas.
**Spec:** [contrato](../specs/2026-11-09-not-11-shared-tasks-design.md).

## Global Constraints

Reservar NOT-11 real, no PAQ-01. Preservar EST-09, logEvent y listingEventStatements; no publicar/migrar/activar canales. Núcleo common Inbox y permisos admin existentes. Rutas/UI inglés y no-store.

DESIGN vigente contrastado con admin/src/styles.css: ink#151515,paper#ffffff,mist#f4f3f0,line#e3e0da,stone#6b665e,bronze#a56b3d,bronze-dk#86542d,ok#2f6b4f,err#a32020,warn-bg#fff6e5,field-line#8f8a82. Tenor Sans/Georgia H1 26px/H2 19px,peso400; Montserrat/system-ui14px/1.5,labels12px. Page1240px/padding24px16px120px; card24px/radio14px,field9px12px/radio10px,botones10px20px/radio999px; gaps12/16/24px,editor280px,apilado900px y controles nuevos760px. Hover bronze-dk,disabled.45,foco2px bronze/offset2px o bronze-dk si contraste lo exige. Texto≥4.5:1,foco/bordes≥3:1,controles32px escritorio/44px móvil,labels/aria-invalid/describedby,status/alert,zoom200%,reduced-motion. Fuente: DESIGN Colors/Typography/Layout/Components/Requisitos y CSS vigente. No activar propuestas de paleta unificada ni añadir fuentes/imágenes/animaciones. ENERGY1/RHYTHM1/MOTION1; el contraste/hierarquía sirve a operar tareas.

## Review Focus

1. cambios de fuente entre lectura y Done: CAS/recibo sin cerrar versión nueva, Task1/2.
2. changes()/last_insert_rowid() con triggers: referencias/eventos correctos, Task1.
3. borrado/retención y fuente tardía: sin restaurar datos personales, Task2.
4. polling/409 con borrador: preservarlo y recargar explícitamente, Task3.
5. link viewing inválido/fuera de tab: error o selección exacta, Task3.

## Task1: Modelo, proyección componible y auditoría

**Files:** crear migrations/0032_notification_tasks.sql, server/notification-tasks.js, tests/server/notification-tasks.test.mjs, tests/server/notification-task-producers.test.mjs.
**Interfaces:** taskStatements(env,descriptor) devuelve D1PreparedStatement[]; syncTask(env,descriptor) lo ejecuta sin prometer unir un batch previo. Descriptor y T01–06 del spec.

- [x] Escribir tests T01/T04/T06 para migración poblada, FK/ID/eventos, dos targets, versiones y rollback; ejecutar y observar RED específico antes del código.
- [x] Implementar migración con índices/triggers y helpers mínimos; afirmar que los productores legacy siguen creando un aviso y su evento original.
- [x] Fuente más nueva actualiza tarea sin cambiar responsable/plazo omitido; igual/vieja no repite. El fallo de auditoría revierte el batch de negocio.
- [x] Ejecutar pruebas nuevas y events/notifications/listing-events; registrar PASS real.

## Task2: Rutas, concurrencia, privacidad y preferencias

**Files:** crear server/routes/notification-tasks.js; modificar server/api.js, server/routes/notifications.js, server/routes/applicants.js, server/routes/inbox.js, server/routes/public.js, server/retention.js; ampliar pruebas de Task1. Ampliación revisada: server/events.js,server/match-store.js y expectativas aditivas en tests/server/applicants.test.mjs,matches.test.mjs,rentals-overview.test.mjs, atestada antes de editar.
**Interfaces:** rutas/métodos/body/respuestas del spec; currentAdmin/readJson/fail/sha256 y DB.batch existentes. Respuestas GET devuelven estado actual y revisión; operación idempotente conserva su UUID al reintentar.

- [x] Tests T02/03/05/07/08 con dos cookies, Promise.all y DB local: una acción, replay único, conflicto, fallo de evento rollback, preferencias propias y lectura obsoleta.
- [x] Implementar CAS+recibos/eventos y validación estricta; limpiar task_reason con los caminos de anonimización existentes. Legacy Done sin revisión solo cierra mediante CAS una fila intacta revision1; contexto modificado devuelve409.
- [x] Añadir metadata indexada a lista/counts sin N+1 ni cambios a sus significados. Preferencias solo para informativos del Feed.
- [x] Repetir pruebas focales y búsqueda de todos los productores/anonimizadores afectados; no afirmar productores ausentes.
- [x] Regresiones de revisión: pantalla legacy vieja frente a fuente nueva devuelve409; inserción de evento omitida con rowid previo válido no proyecta; dos proyecciones agrupadas capturan el mismo evento; cierre por dominio no se deshace por contexto; creación y duplicados posteriores a borrado no restauran título/motivo.

## Task3: Interfaz y enlaces exactos

**Files:** modificar admin/src/Inbox.jsx,admin/src/App.jsx,admin/src/Viewings.jsx; crear admin/src/InboxTask.jsx,admin/src/InboxPreferences.jsx,admin/src/inbox-tasks.css,tests/notification-tasks.e2e.cjs; GET visita en server/routes/inbox.js.
**Interfaces:** InboxTask({n,users,me,paused,onChanged,onRead,onDirty,onPending,reloadUsers}) conserva borrador/reintento/409; InboxPreferences({onSaved}) preferencias propias; Viewings({listing,requestedId}) resuelve ID exacto por API y pestaña actual. Emplear api y fmtDate existentes.

- [x] Tests de contrato T09 y e2e T10 añadidos. RED backend observado; e2e posterior a implementación se registra como aceptación, sin inventar RED de interfaz (desviación documentada).
- [x] Construir controles nativos y estados; no permitir polling tardío sobre formulario sucio ni reenviar con UUID nuevo una operación incierta.
- [x] Preferencias/usuarios una carga; historial acotado; nuevas fuentes/actualizaciones aparecen con polling existente.
- [ ] Playwright MCP local1280/390 (bloqueado por arranque sandbox/root; runner local separado sí recorrido): asignar/plazo/Done/Reopen,follow-up,lectura personal,prefs,conflicto/vacío/error,teclado/foco/zoom200%,enlace exacto; capturas y consola/red. Pendiente MCP explícito en ledger, sin modificar controles del entorno.

## Task4: Entrega y publicación separadas

**Files:** spec/plan/ledger, docs/roadmap/tasks/NOT-11.json,docs/roadmap/ESTADO.md,docs/roadmap/work/NOT-11/producer-evidence.md y generados oficiales catalog/checklist/reparto/work-units/paquetes/public assets cuando correspondan; no datos privados.

- [x] Cierre final npm test,npm run build,npm run check:release,npm run test:e2e según cabecera; distinguir fallos anteriores/bloqueados.
- [x] Revisión independiente del cambio completo; corregir importantes y repetir comprobaciones afectadas. Antislop: cuatro bloques con evidencia real; no reportar PASS sin recorrer.
- [x] Registrar exactamente código construido/verificado y lo no activado. EST-18 permanece parcial por productores futuros; NOT-01/08 requieren integración y no se reservan aún.
- [x] Siguiente tramo PAQ-01 analizado; docs/generados y relevo preparados para el cierre con commit de rutas concretas y submit/turno según equipo.md. Estado coordinado y SHA final se confirman en relevo privado.
- [ ] Aprobar SHA concreto, aplicar migración0032/publicar y comprobar integración real; no activar canales ni declarar todo PAQ-01 terminado por esta entrega.

Skills: aportación concreta en spec; usar security/frontend con React y runtime servidor actual, sin introducir Express/Next. Impeccable/antislop para conservar panel; taste/redesign no aplican a crear otra página. No copiar archivos privados ni reconstruir evidencia de canales.
