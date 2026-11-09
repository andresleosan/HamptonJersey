# BUS-08 · Daily market sweep Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Run diario01:00Europe/Jersey, una vez por fecha local.

**Para ejecutar/completar:** Motor y controlversionado; disponibilidad humana prioritaria y errores no producen bajas. Activación con cobertura/permiso y exclusiones integradas. Decisiones: Q07. Verificaciones: V01, V03, V13. Dependencias: BUS-06/09/10; EST-16; AUT-07 existente; EST-15 antes de activar automático.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Planificar no activa el reloj ni las fuentes.

**Goal:** Recorrer el mercado una vez por día a partir de01:00 Jersey, con intentos observables y cambios reanudables, sin falsas bajas.

**Architecture:** Extender runs/tareas/leases BUS-06 con programación diaria y barrido completo por canal. El reloj AUT-07 existente invoca el servicio; outbox transaccional entrega cambios a BUS-04 después.

**Tech Stack:** JavaScript, D1, Intl Europe/Jersey, Worker de jobs y panel existentes; sin cron adicional ni infraestructura nueva.

**Spec:** [Diseño común, contrato8](../specs/2026-11-08-list2-market-batch-design.md); [BUS-09](2026-11-09-list2-build-ready-github.md), [BUS-10](2026-11-08-bus-10-property-identity.md), [BUS-06](2026-11-09-list2-build-ready-github.md).

## Global Constraints

- Para integrar: BUS-06/09/10, EST-16 y AUT-07; para activar: exclusión por alcance y prioridad humana EST-15 verificadas. Pruebas/desarrollo con fuentes sintéticas pueden avanzar antes de activación.
- Decisión Luis:01:00 Europe/Jersey diaria. Primer tick elegible de diez minutos, una ejecución diaria por fecha local, manifiesto congelado. Un cambio de manifiesto no permite segundo diario del mismo día.
- Default enabled=false; activar es una acción humana posterior a integración verificada. No modificar jobs/wrangler.toml ni instalar cron/puertos/servicios.
- Hasta10 registros/página131072 bytes, cinco páginas/tick,20s entre páginas, fetch10s/1MiB, un fetch simultáneo, max(60s,política) entre peticiones. Leases/versiones y pausa invalidan escrituras tardías.
- No localizado/fallo HTTP no confirma baja; last_page_success distinto de last_full_sweep_success. No aplicar por defecto Stale7/30 días ni descargar todas las fotos.
- Panel: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d no-texto, bronze-dk#86542d texto/hover, ok#2f6b4f, err#a32020, warn#fff6e5, field-line#8f8a82; Tenor26/19, Montserrat14/1.5, label12, card24/r14, botón10px20px/r999/44px, camposr10, celdas10px12px, breakpoint760, foco2/offset2, zoom200/copy inglés. Skills comunes y API staff/no-store/same-origin del spec.

## Review Focus

1.01:00 inexistente o repetida por DST: tarea1, una pasada en ambos casos.
2. Cambio de manifiesto o tick retrasado duplica diario: tarea1, no sucede.
3. Recorrido parcial parece que desapareció una propiedad: tarea2, no marcar ausencia.
4. Confirmación humana de baja es anulada por anuncio viejo: tarea3, nunca reactivar.
5. Caída entre guardar observación y avisar pierde cambios o duplica alertas: tarea3, outbox atómico.

## Tarea 1 · Elegibilidad diaria y exclusión mutua

Archivos: crear `server/market-daily.js`, `tests/server/market-daily.test.mjs`; migración nominal `migrations/0038_market_daily.sql`, recalcular siguiente ordinal libre. Reutilizar app_settings y runs reales de BUS-06, añadiendo tipo daily/manual/initial sin romper unicidad del inicial abierto.

Interfaces: `dailyRunDue(settings,now,lastRun) -> {due,local_date,due_at}`; `startDailyInventory(env,ts) -> {run_id,status,local_date}`. Unicidad en DB por fecha local para tipo daily, no por hash del manifiesto.

- [ ] Escribir `spring_gap_first_valid_instant`, `autumn_fold_once`, `late_tick_uses_processing_time`, `manifest_change_no_second_daily`, `previous_run_still_open`, `missed_days_no_burst`.
- [ ] Fixtures DST explícitos: primavera2026-03-29 primer instante válido posterior a01:00=>01:00Z; otoño2026-10-25 primera01:00=>00:00Z, siguiente01:00Z no genera segundo run. Añadir verano01:00local=>00:00Z e invierno=>01:00Z.
- [ ] Resolver día/hora con Europe/Jersey, no offset fijo ni last+86400000. Transacción protege dos ticks simultáneos; el manifiesto aceptado queda fijado al crear run.
- [ ] Si ejecución anterior sigue, reanudarla y mostrar atraso sin marcar hoy cubierto. Días perdidos quedan omitidos con razón; ejecución manual explícita no elude lease de canal ni aparece como segundo diario.
- [ ] Ejecutar `node --test tests/server/market-daily.test.mjs`; esperar un run por fecha en todas las intercalaciones. Commit de programación.

## Tarea 2 · Barridos completos y reanudación por canal

Archivos: modificar `server/market-inventory-runner.js`, `server/market-store.js`, `server/market-source-adapters.js`; crear `tests/server/market-daily-runner.test.mjs`. Añadir a migración no aplicada `market_source_sweeps` y `market_sweep_seen` solo si las tablas existentes no ofrecen el mismo contrato.

Interfaz: `dailyInventoryTick(env,ts,{fetchImpl=fetch}={}) -> {processed,pending,failed}`; finalización de canal requiere cursor exhausted, páginas confirmadas y misma política/manifiesto/versión. Seen keys por run/publicación, no un Set de todo el mercado en memoria.

- [ ] Escribir `partial_sweep_not_missing`, `403_preserves_last_success`, `broken_parser_not_empty`, `pause_blocks_late_commit`, `resume_does_not_repeat_page`, `manual_source_not_success`.
- [ ] Reutilizar los límites/leases BUS-06 y lectores autorizados BUS-09. Respetar429/Retry-After; red/5xx máximo3 intentos en ticks posteriores,401/403/login pasa a pendiente sin bucle.
- [ ] Registrar cada intento, último éxito de página y último barrido completo distintos. Solo canal recorrido hasta el final permite marcar publicaciones no localizadas; no se tocan otras fuentes/operaciones.
- [ ] Mantener el inventario anterior ante error, política revocada, pausa o fuente manual; no transformar la ausencia de un lector en problema de acceso. Retomar desde cursor confirmado, no empezar todo de nuevo.
- [ ] Ejecutar `node --test tests/server/market-daily-runner.test.mjs tests/server/market-inventory-runner.test.mjs`; comprobar recuentos e historial en parcial/fallo/reanudación. Commit del barrido.

## Tarea 3 · Cambios efectivos y outbox transaccional

Archivos: crear `server/market-changes.js`, `tests/server/market-changes.test.mjs`; modificar market-store/extraction con hooks del mismo escritor. Tablas market_changes y market_change_deliveries del spec8 en migración libre.

Interfaces: `recordMarketChangeStatements(env,{before,after,origin}) -> PreparedStatement[]` se añade a la misma transacción de observación/proyección; `claimMarketChanges(env,consumer,{after,limit:50,ts}) -> {items,next_cursor,lease}`; `ackMarketChanges(env,consumer,lease,ids)` por versión.

- [ ] Probar `same_normalized_price_no_change`, `same_change_three_sources_single_semantic_transition`, `failed_source_no_commercial_change`, `old_web_cannot_revoke_human_unavailability`, `rollback_has_no_orphan_change` y `baseline_no_notification_flood`.
- [ ] Distinguir observación de publicación y disponibilidad comercial conforme EST-16; precio efectivo conserva publicación/moneda/clase/revisión y conflicto, sin escoger el mínimo de fuentes.
- [ ] Guardar nueva transición semántica junto con proyección; inicialización genera baseline sin tormenta de cambios. Campos/contactos/formato que no afectan criterios no se declaran bajada.
- [ ] Registrar entrega pendiente BUS-04 sin enviar avisos directamente; confirmar consumo solo después de trabajos de recálculo durables. Un fallo conserva la entrega para reintento.
- [ ] Ejecutar `node --test tests/server/market-changes.test.mjs`; verificar cero pérdida tras caída simulada antes/después del commit y rechazo de lease obsoleto. Commit del outbox.

## Tarea 4 · Reloj y controles de activación

Archivos: modificar `server/jobs.js`, `server/routes/market-inventory.js`, `admin/src/MarketInventory.jsx` y tests correspondientes; crear `tests/server/market-daily-activation.test.mjs`, `tests/market-daily-ui.test.js`.

Interfaz: `canEnableDailyInventory(env) -> {allowed,missing}` consume capacidades reales/contratos integrados de disponibilidad y exclusión, no booleans de entrada ni un checklist cliente; POST `/api/admin/market-inventory/daily` con `{enabled,version}`, horario01:00Jersey fijado por decisión vigente.

- [ ] Probar disabled por defecto, ausencia de EST-15/16 rechaza activación, origen/sesión/versión y falta de un conector que bloquea solo su fuente.
- [ ] Añadir dailyInventoryTick al reloj existente manteniendo retención/correo y sin basarse en el scheduledTime antiguo. Probar errores aislados: un fetch externo fallido no impide registrar el estado del resto de trabajos; respetar límites del Worker real, sin Promise.all ilimitado.
- [ ] UI `Daily market sweep`, `01:00 Jersey time`, `Last full sweep`, `Sources pending`, Start/Pause/Resume y errores; no presentar todas las fuentes correctas si solo funcionó la propia. Mostrar atraso y pendientes manuales.
- [ ] Ejecutar npm test/build/check:release y e2e/MCP1280/390 con reloj sintético; pruebas de fixtures no activan el diario real. Medir tiempo/consultas/paginación y verificar que no se descargaron galerías.
- [ ] Revisión independiente futura, actualizar BUS-08/checklist/ESTADO/ledger; distinguir construcción, dependencias, integración y activación real. Solo encender después con acción autorizada y evidencias de prioridad humana/exclusión; no por finalizar este plan.
