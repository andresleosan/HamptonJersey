# Shared work progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Registrar planificación, construcción y relevo entre equipos, con un solo constructor por tarea y actualización visible del tablero.

**Architecture:** Estado independiente en el Durable Object existente; autenticación y transporte existentes, sin operar reservas antiguas. CLI activity con diario privado de reintentos; vista pública mínima sobre las tarjetas actuales. La skill obliga a registrar los hitos reales de cada invocación.

**Tech Stack:** Node/JavaScript, Cloudflare Durable Objects SQLite, node:test, Miniflare y Playwright existentes. Sin dependencias nuevas.

**Spec:** [Diseño aprobado por Luis](../specs/2026-11-09-avanzar-progreso-compartido-design.md).

## Global Constraints

- Base4858fdb; main en copia propia, candado local. Luis aprobó el diseño y concretó sesiones de solo planificación. No autorización de push/despliegue/migración.
- Modos plan/build. Planificación termina planned, no ocupa construcción ni cambia estado de producto. Construcción conserva exclusividad en active/paused/review/built, incluso ante desconexión. published libera ese tramo tras verificar SHA en main con el mecanismo existente.
- Alta atómica por tarea; updates por id/version/session; idempotencia por actor/operationId/fingerprint. Traspaso ofrecido por propietario y aceptado explícitamente por destinatario autorizado; sin autoapropiación por caducidad.
- Campos públicos estructurados: alias fijo según lista/equipo, etapa, hito/pendiente por códigos permitidos, referencia de documento versionado/commit, fecha. No texto libre de logs, rutas locales, emails ni identidades privadas.
- Usar catálogo ya existente solo para validar códigos y paquetes incluidos en el artefacto; no exigir importación ni evidencia del protocolo histórico. El registro no autoriza construir dependencias, publicar o migrar.
- Reutilizar CSS del tablero: paper#F4F6F8/surface#fff/ink#22303F/muted#566476/line#D3DAE2/accent#2B6CA3, Open Sans15px/1.55, Source Serif4 cabecera2rem, IBM Plex Mono código. Espacios8/12/16/24, controles44px, foco2px offset2, max1120px, breakpoints760/980. Son valores vigentes de equipo.css; DESIGN.md del producto no reemplaza este sistema. No cambios de paleta/fuentes ni propuestas de DESIGN.md aplicadas.
- Mantener tarjetas/details abiertos y foco al actualizar; textContent y enlaces allowlist. Poll15s, caché pública5s, sin añadir peticiones por tarjeta. Desktop1280/móvil390/zoom200.
- Skills: ponytail reutiliza almacenamiento/transporte/clases; impeccable y antislop durante el trabajo conservan interfaz operativa y copy factual; frontend-security-coder evita XSS y enlaces arbitrarios; security-best-practices preserva autoridad y datos mínimos; web-performance-optimization conserva carga/poll acotados. taste/redesign no aplican: no página nueva ni rediseño. Brainstorming/grill-me resueltos en spec; TDD y verification-before-completion para ejecución. Modelo/esfuerzo efectivos no expuestos, sin cambio.

## Review Focus

1. Dos sesiones con la misma identidad tampoco pueden construir dos veces la misma tarea.
2. Un timeout tras escritura no permite empezar otra tarea ni repetirla con identificador nuevo.
3. Plan preparado permanece visible cuando otro equipo construye; no desplaza la actividad del constructor.
4. Oferta de relevo no concede escritura al destinatario antes de aceptar; respuesta vieja no devuelve autoridad al propietario anterior.
5. Hitos locales no se convierten en producto publicado ni filtran texto privado al tablero.

### Task 1: Registro atómico y API

**Files:** Create coordination/src/activity.mjs; modify coordinator.mjs, worker.mjs, public-board.mjs; tests/avanzar-activity.test.js y coordination/test/activity-runtime.test.mjs.

**Interfaces:** emptyActivity() -> {revision,records,operations}; applyActivity(state,actor,action,body,catalog,prepared,now) -> {revision,record}; publicActivities(records) devuelve solo campos públicos. TeamCoordinator.activity(actor,action,body) ejecuta validación y transacción independiente; getBoard() añade work/activityRevision sin modificar claims.

- [x] RED: plan/planned sin exclusión, dos starts build, actor/session/version ajenos, reintento, body distinto, relevo, estados built/published, referencias inseguras y reservas inalteradas.
- [x] Implementar modelo/API con catálogo/paquetes validados, errores tipados y proyección mínima.
- [x] GREEN: node tests/avanzar-activity.test.js; runtime SQLite real con dos clientes/lectura pública y denegación anónima.

### Task 2: CLI y contrato de avanzar

**Files:** scripts/avanzar-activity.mjs, scripts/avanzar-team.mjs, tests/avanzar-activity-client.test.js; .agents/skills/avanzar/SKILL.md, docs/roadmap/AVANZAR.md.

**Interfaces:** activity list; activity start --task CODE --mode plan|build [--list1..4]; activity update --status planned|active|paused|review|built|published --milestone CODE --next CODE [--reference repo-path] [--sha SHA]; activity offer-handoff --target-actor ID --target-list N; activity accept-handoff --id ID. Estado separado .git/avanzar-activity-session.json, configuración existente o TEAM_ENDPOINT; no init/claim/watch.

- [x] RED: red caída conserva operación, retry igual, rechaza otro comando pendiente, actor remoto no disponible, plan cierra sin construcción, no sobrescribir estado histórico, inspección GitHub para start build.
- [x] Implementar cliente, reanudación por mismo checkout/session, comandos y requisitos en skill. Una selección local por paquete no toma todas sus tareas.
- [x] GREEN: node tests/avanzar-activity-client.test.js y regresiones cliente existentes; sin llamadas de escritura reales al servicio.

### Task 3: Tablero, validación y entrega

**Files:** docs/roadmap/tablero-publico.{js,html,css}, tests/public-board.test.js, tests/activity-board.e2e.cjs; ESTADO/checklist y ledger.

**Interfaces:** actividad pública con work.build y work.plans (sin IDs privados); estados planning/planned/active/paused/review/built/published; detalle y resumen de etapas del paquete muestran responsables y progreso independiente de state/porcentaje.

- [x] RED: render responsable/plan preparado, plan+build concurrentes, XSS/referencia rechazada, polling conserva foco, estado de error/vacío.
- [x] Implementar tarjetas y copy; actualizar checklist solo para explicar actividad, sin inventar nuevo código de producto ni marcar NOT-11 como coordinación de desarrollo.
- [x] GREEN: suites focales, npm test/build/check:release, catálogo/paquetes, runtime, e2e local1280/390/zoom y MCP si arranca. Distinguir bloqueo de entorno de fallos reales.
- [x] Revisión independiente final autorizada por executing-plans; corregir importantes con RED→GREEN; registrar limitaciones, siguiente recomendación y relevo privado. Commit concreto revisable en main sin push.

Pre-flight: API consume catálogo existente solo para validación; CLI produce exactamente cuerpos del modelo; público recibe solo proyección tipada. Regla vinculante: plan no adquiere exclusividad y nunca sustituye un build visible. Esta tarea es infraestructura de desarrollo fuera de las250tareas de producto; no atribuirla a NOT-11.
