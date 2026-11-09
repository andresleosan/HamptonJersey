# BUS-04 · Material changes and rematching Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Reevaluación de cambios y nuevo match por rebaja.

**Para ejecutar/completar:** Snapshot de precio al rechazar; legacy sin evidencia usa baseline y futura rebaja. Precio conflictivo entre fuentes a revisión, no escoger mínimo. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03, V04. Dependencias: BUS-08/12/EST-09 y episodios/proyección BUS-01/03.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Solo planificación en esta sesión.

**Goal:** Recalcular las búsquedas afectadas y crear un nuevo match para revisar cuando una bajada elegible corrige un rechazo por precio.

**Architecture:** Consumidor reanudable del outbox BUS-08 encola el motor BUS-01/BUS-12. Episodios y versiones conservan decisiones antiguas, mientras el candidato actual vuelve a Found sin aprobarse automáticamente.

**Tech Stack:** JavaScript, D1, reloj y eventos/notificaciones existentes, React/node:test; sin modelos ni envíos nuevos.

**Spec:** [Diseño común, contrato9 y episodios6](../specs/2026-11-08-list2-market-batch-design.md); [BUS-08](2026-11-08-bus-08-daily-market-sweep.md), [BUS-01](2026-11-08-bus-01-inventory-matching.md), [BUS-03](2026-11-08-bus-03-inventory-browser.md).

## Global Constraints

- BUS-08/BUS-12/EST-09 integrados, más contratos de episodios BUS-01 y presentación BUS-03. No cerrar búsquedas por visita/consulta/negociación.
- Decisión Luis: nuevo match automáticamente para decidir aprobarlo o no tras bajada que vuelva a encajar. No reducirlo a un aviso informativo ni autoaprobar/enviar.
- Solo reapertura excepcional de rechazo por price; mantener otros rechazos y shortlist. Comparar misma operación/clase/moneda y precio normalizado; fuente distinta no prueba bajada.
- Legacy sin precio histórico acreditado: baseline trazable al activar, bajada posterior o revisión de evidencia. No reconstruir snapshot por intuición ni llamar al precio actual el precio del rechazo.
- Un episodio activo por CandidateKey y una nueva generación por transición efectiva; rechazo anterior en historial y target legacy/market discriminado. Versionar aplicante/episodio/observación.
- Páginas50, cinco páginas y20s entre páginas/tick; transacciones durables antes de ack. API staff/same-origin/no-store, sin contactos en outbox/avisos externos.
- UI conserva tokens ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d/bronze-dk#86542d/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82; Tenor26/19 y Montserrat14/1.5, label12, card24/r14, botón10px20px/r999/44px, foco2/offset2, reflujo760/zoom200/copy inglés; DESIGN.md y skills comunes.

## Review Focus

1. Legacy sin precio al rechazar: tarea1, baseline visible sin precio histórico inventado.
2. £24000/año cambia a£2000/mes o cambia la web seleccionada: tarea1, ninguna rebaja falsa.
3. Dos workers reciben la misma rebaja en tres fuentes: tareas2–3, un match/aviso nuevo.
4. Humano cierra búsqueda o rechaza por otra causa mientras recalcula: tarea3, no sobrescribir.
5. Bajada ya corregida o fuente contradictoria: tarea3, no crear candidato con precio que dejó de ser efectivo.

## Tarea 1 · Baselines y clasificación material

Archivos: crear `server/market-rematch.js`, `tests/server/market-rematch.test.mjs`; migración nominal `migrations/0039_market_rematch.sql` si hacen falta baselines/relaciones no cubiertos por episodios BUS-01, recalcular ordinal. Reutilizar price_snapshot de cada decisión nueva.

Interfaces: `classifyMarketChange({before,after}) -> {material,fields,price_direction,comparable}`; `getRejectionPriceBaseline(env,{applicant_id,candidate_key}) -> {status,price,provenance}` con status `verified | observed_baseline | needs_review`.

- [ ] Escribir `annual_monthly_not_drop`, `premium_not_rent_drop`, `currency_unknown_not_comparable`, `source_switch_not_drop`, `price_conflict_needs_review`, `legacy_missing_snapshot_not_invented` y `structured_historical_snapshot_recovered`.
- [ ] Comparar enteros normalizados con operación/clase/moneda/periodicidad explícitos; conservar originales. Fechas, orden HTML, otro título o mismo dinero no son cambio material de criterios.
- [ ] Recuperar snapshot histórico únicamente si historial estructurado/fechado prueba precio al rechazar; conservar referencia de la reconstrucción. Si no, guardar baseline efectivo actual con su fecha y marcar casos históricos pendientes.
- [ ] Registrar baseline/observación por publicación y versión; no escoger mínimo entre webs y no tratar el cambio de fuente como reducción. Contradicción vigente impide auto-reapertura por precio.
- [ ] Ejecutar `node --test tests/server/market-rematch.test.mjs`; comprobar igualdad financiera, procedencia y distinción de estados. Commit de clasificación/baselines.

## Tarea 2 · Entrega durable hacia búsquedas afectadas

Archivos: ampliar market-rematch.js; crear `tests/server/market-change-consumer.test.mjs`; modificar market-match-store.js y server/jobs.js.

Interfaces: `consumeMarketChanges(env,ts,{limit:50}) -> {queued,done,pending}`; consume claimMarketChanges/ackMarketChanges BUS-08 y enqueueInventoryMatch BUS-01.

- [ ] Probar `only_active_searches_affected`, `operation_scope_preserved`, `unknown_field_index_no_false_negative`, `crash_before_ack_retries_once`, `overlapping_ticks_single_delivery` y `viewing_does_not_stop_search`.
- [ ] Seleccionar búsquedas activas por operación y campos relevantes con índices seguros; nunca filtrar por la presencia de una visita/negociación. Si no es posible reducir con certeza, ampliar candidatos y dejar a BUS-12 evaluar.
- [ ] Guardar trabajo por cambio/aplicante/versiones con clave idempotente; ack solo tras enqueue durable. Caída después de enqueue y antes de ack no duplica el trabajo.
- [ ] Reloj consume páginas acotadas después de persistir cambios; no bucle global ni otra pasada por cada cliente. Una búsqueda editada invalida resultado antiguo y usa la versión actual.
- [ ] Ejecutar `node --test tests/server/market-change-consumer.test.mjs tests/server/market-match-store.test.mjs`; verificar que un fallo no pierde cambios pendientes. Commit del consumidor.

## Tarea 3 · Nuevo episodio por rebaja elegible

Archivos: ampliar market-rematch.js/market-match-store.js; crear `tests/server/market-price-reconsideration.test.mjs`; adaptar protección de rutas legacy y market si hace falta, sin borrar historial.

Interfaz: `reconsiderPriceRejection(env,{applicant_id,candidate_key,change_id},actor) -> {created,episode_id,reason}`. Reutiliza evaluador BUS-12 y persistencia BUS-01.

- [ ] Probar `price_rejection_becomes_new_found_episode`, `old_rejection_preserved`, `same_drop_three_sources_one_episode`, `other_reason_stays_rejected`, `still_over_budget_no_new_match`, `pending_essentials_not_meets`, `stale_price_correction_no_reopen`, `concurrent_close_blocks_reopen`.
- [ ] Exigir rechazo vigente por price, bajada efectiva comparable desde snapshot/baseline válido, nueva evidencia, presupuesto ahora meets y ausencia de exclusión actual. Requisitos desconocidos conservan pending; un imprescindible que falla no se convierte en coincidencia válida.
- [ ] Dentro de transacción, comprobar versión de búsqueda activa, decisión anterior, precio efectivo y generación; cerrar episodio previo como histórico y crear nuevo found con previous_episode_id/cambio/revisión/snapshot. Rechazo legacy permanece en su fila histórica.
- [ ] Si ya existe found/shortlisted activo, refrescar evidencia sin duplicar; si hay una decisión humana nueva mientras se procesa, conflicto/revisión en vez de sobrescritura. Una bajada posterior no duplica una propuesta ya actual.
- [ ] Registrar un evento nuevo de candidato y el mismo aviso abierto agregado por búsqueda. No auto-shortlist ni consulta/envío. Ejecutar `node --test tests/server/market-price-reconsideration.test.mjs tests/server/market-match-routes.test.mjs`; comprobar target/contador e integridad. Commit de reapertura excepcional.

## Tarea 4 · Presentación, revisión y regresiones

Archivos: modificar MatchCard.jsx/ApplicantDetail.jsx/Review.jsx según contrato BUS-03; crear `tests/market-price-reconsideration-ui.test.js`, `tests/bus04-e2e.cjs` con fixtures sintéticos. Reutilizar notificaciones existentes, sin CHECK de categoría inventada.

- [ ] Mostrar `New match after price reduction`, precio/evidencia anterior acreditados y actuales, fecha y vínculo a rechazo previo; si falta histórico, `Earlier price needs review`, sin cifra inventada.
- [ ] Probar recorrido rechazo por precio->observación más baja->nuevo Found->Shortlist/Reject/Undo humano, sin duplicado ni aprobación automática. Una baja comercial confirmada bloquea toda nueva propuesta de la operación afectada.
- [ ] Probar caída de fuente, alquiler anual/mensual equivalente, nueva web, mismo precio, dos pisos misma dirección, búsqueda cerrada y visita en curso. Precio conflicting no activa por sí solo la excepción.
- [ ] Ejecutar tests focales, npm test/build/check:release, test:e2e y MCP1280/390, error/parcial/conflicto/teclado/foco/zoom200/consola/red. Confirmar contadores de episodios actuales y un aviso nuevo por cambio elegible.
- [ ] Revisión independiente futura y actualización BUS-04/checklist/ESTADO/ledger con la excepción expresa de Luis a la regla histórica «rejected nunca se reproponen». No cambiar esa regla para otros motivos ni registrar funcionamiento real sin integración/activación comprobadas.
