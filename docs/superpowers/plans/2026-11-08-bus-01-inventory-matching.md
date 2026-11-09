# BUS-01 · Inventory matching Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Cruce de alta/cambios contra inventario con episodios.

**Para ejecutar/completar:** Contrato de evaluación y versión integrados, progreso real y no duplicar/reabrir búsquedas. No investigación nueva por cada aplicante. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03. Dependencias: BUS-06, BUS-12, EST-09; BUS-10 identidad y legado compatibles; BUS-15 para revisión humana.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. La otra sesión construirá tras satisfacer dependencias.

**Goal:** Cada alta y cambio de requisitos cruza el inventario común disponible con progreso real y sin duplicar propiedades o decisiones.

**Architecture:** Consumir el evaluador BUS-12 y proyección de identidad BUS-10/07. Trabajo paginado y episodios de revisión permiten conservar historial y servir las tarjetas actuales sin convertir anuncios externos en fichas públicas.

**Tech Stack:** JavaScript, D1, reloj AUT-07 existente, React y node:test; no IA de matching nueva.

**Spec:** [Diseño común, contrato6](../specs/2026-11-08-list2-market-batch-design.md). Dependencias: BUS-06/BUS-12/EST-09 integrados; identidad/enlaces de BUS-10/07 para deduplicar legado.

## Global Constraints

- BUS-12 decide requisitos, exclusiones y orden; no bajar umbrales ni inventar reglas comerciales para que las pruebas pasen. Acordar su firma real con su constructor.
- CandidateKey por propiedad+operación; legacy no enlazado usa legacy:<id>:<operation>. Una propiedad ofrecida en venta/alquiler no mezcla búsquedas.
- Un episodio activo por búsqueda/CandidateKey; conservar Rejected/Shortlisted históricos. Reapertura excepcional por precio pertenece a BUS-04; aquí no se implementa una regla general de reabrir rechazados.
- 50 candidatos/página, hasta5páginas/tick y20s entre páginas, cursor persistido; sin pérdida por límite de visualización. Alta no dispara investigación/scraping.
- Estado de búsqueda de EST-09 manda dentro de la transacción; resolver/archivar/restaurar no se deduce de Stage, visita o negociación.
- Panel de progreso usa tokens ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d/bronze-dk#86542d/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82; Tenor26/19 y Montserrat14/1.5, label12, card24/r14, botón10px20px/r999/44px, foco2/offset2, reflujo760. Copy inglés, estados accesibles y datos personales privados; DESIGN.md y skills comunes.

## Review Focus

1. Misma casa propia y en tres webs: tarea1, un candidato actual y todas las fuentes.
2. Requisitos cambian durante el cruce: tareas2–3, no guardar resultados de versión antigua.
3. Búsqueda cerrada mientras llega el último lote: tarea2, no reapertura ni aviso nuevo.
4. Inventario aún incompleto o fuente caída: tarea3, progreso/pendiente, no cero mercado.
5. Legacy Rejected/Shortlisted compite con episodio nuevo: tarea4, prioridad temporal explícita y acciones sobre target correcto.

## Tarea 1 · Proyección común para BUS-12

Archivos: crear `server/market-candidates.js`, `tests/server/market-candidates.test.mjs`; consumir market-store/identity/legacy y evaluador BUS-12 real.

Interfaces: `getInventoryCandidates(env,applicant,{cursor,limit:50}) -> {items,next_cursor,inventory_revision}`. Adaptador acordado `evaluateMarketCandidate(applicant,candidate,{facts,availability}) -> {requirements_status,checks,requirements_rank,score,budget_result}`. Si BUS-12 ya expone otro contrato, adaptar aquí y actualizar todos los consumidores, no duplicar evaluate.

- [ ] Escribir `legacy_and_three_sources_one_candidate`, `sale_rent_separate`, `unknown_pets_pending`, `unconfirmed_availability_separate`, `commercial_uses_bus12` y `keyset_stable`.
- [ ] Proyectar originales/evidencia/fechas y unidades menores sin crear listings ficticias. Vinculación ambigua queda separada/revisable; no colapsar por dirección.
- [ ] Prioridad humana y exclusión comercial se consumen de EST-16/15; si faltan sus contratos operativos, dejar integración pendiente sin afirmar confirmación de disponibilidad.
- [ ] Ejecutar `node --test tests/server/market-candidates.test.mjs` y pruebas del evaluador BUS-12 existentes; no corregir sus fallos cambiando los criterios de esta tarea. Commit del adaptador.

## Tarea 2 · Runs y episodios atómicos

Archivos: crear `server/market-match-store.js`, `tests/server/market-match-store.test.mjs`; migración nominal `migrations/0037_market_matches.sql`, verificar siguiente ordinal libre. Consumir getInventoryCandidates y evaluateMarketCandidate.

Interfaces: `enqueueInventoryMatch(env,{applicant_id,applicant_version,reason},actor) -> {run_id,status}`; `inventoryMatchTick(env,ts) -> {processed,pending,failed}`; tablas market_match_runs/market_match_episodes del spec6.

- [ ] Probar `duplicate_enqueue_single_run`, `stale_applicant_cannot_commit`, `closed_search_cannot_commit`, `repeat_tick_no_duplicate_notice`, `more_than_25_candidates_not_lost` y `shortlist_preserved`.
- [ ] Persistir versión/cursores y un episodio activo por CandidateKey; conservar clasificación distinta de status humano. No borrar desconocidos o decisiones al refrescar evidencia.
- [ ] Guardar snapshots financieros estructurados y procedencia al revisar/rechazar desde ahora. No rellenar rechazo antiguo con precio actual.
- [ ] Escribir página/cursor/episodios/aviso en transacción con estado activo y versión vigentes. Un fallo se reintenta desde último cursor confirmado.
- [ ] Ejecutar `node --test tests/server/market-match-store.test.mjs`; verificar integridad y un aviso abierto agregado por búsqueda, sin duplicar avisos legacy. Commit del almacenamiento.

## Tarea 3 · Disparadores de altas y progreso

Archivos: modificar `server/routes/public.js`, `server/routes/applicants.js`, `server/match-store.js`, `server/jobs.js` y sus pruebas; crear `tests/server/inventory-match-triggers.test.mjs`, `admin/src/InventoryMatchProgress.jsx`, `tests/inventory-match-progress.test.js`.

Interfaz: disparadores llaman enqueueInventoryMatch tras guardar; reloj llama inventoryMatchTick. Componente props `{run,onRetry}`; estado `queued | working | completed | failed | superseded`.

- [ ] Probar alta pública/panel, editar requisitos, restaurar resuelto y reabrir con decisión humana. Mantener Turnstile y contratos de registro existentes.
- [ ] Encolar solo después de transacción del alta; duplicación de submit usa mismo run. Devolver confirmación del alta aunque continúe el cruce; no exigir descargar todo el inventario en la respuesta web.
- [ ] Una edición nueva invalida/sustituye el run antiguo; restauración de EST-09 no reabre búsqueda resuelta. Reloj continúa paginado, sin cron ni servicio nuevo.
- [ ] UI diferencia `Matching available inventory`, `Some details need confirmation`, `Matching failed. Try again.` y vacío final verdadero. Respuesta pública solo información permitida, sin fuentes privadas/contactos ni candidatos internos.
- [ ] Ejecutar pruebas de disparadores/progreso/jobs y regresiones de registro/EST-09. Commit de integración de alta.

## Tarea 4 · Lectura/revisión unificada y contrato para BUS-03/04

Archivos: crear `server/routes/market-matches.js`, `tests/server/market-match-routes.test.mjs`; modificar `server/api.js`, `server/routes/matches.js`, `server/routes/applicants.js` y consultas de contadores/Review/Inbox afectadas. No cambiar endpoint legacy de manera incompatible.

Interfaces: `getUnifiedMatches(env,applicantId,{cursor,limit:50,group}) -> {items,next_cursor,summary,run}`; GET `/api/admin/applicants/:id/market-matches`; POST `/api/admin/market-matches/:id/review` con `{version,from,status,reject_reason?,applicant_version}`. Cada tarjeta tiene target discriminado legacy/market, no ID ambiguo.

- [ ] Probar401/origen, doble decisión409, cierre concurrente, Undo, episodio actual que sustituye fila legacy y recuentos que incluyen solo la generación activa.
- [ ] Integrar proyección de lectura sin borrar histórico; rechazo legado se conserva salvo episodio posterior autorizado por BUS-04. Acciones legacy sobre estado sustituido devuelven409 con recarga.
- [ ] Reutilizar barandillas de review/first_reviewed_at/Inbox actuales; emitir un evento por decisión e incluir entidad/episodio sin datos personales en notificación externa.
- [ ] Acordar con BUS-03 la forma de cards/summary y con BUS-04 snapshots/generación/idempotencia. Documentar firma real integrada y no continuar con contratos que ningún módulo produce.
- [ ] Ejecutar pruebas focales, npm test/build/check:release, e2e/MCP1280/390 de alta->progreso->meets/pending->review->cierre concurrente. Revisión independiente futura, actualizar tarea/checklist/ESTADO/ledger y distinguir código, integración y activación.
