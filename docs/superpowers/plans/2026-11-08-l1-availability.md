# Lista 1 availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Este encargo solo redacta el plan; no ejecutarlo ahora ni delegar nuevos agentes.

**Goal:** Separar observación y confirmación, aplicar bajas con alcance antes de automatizar y preparar papelera/purga conforme a D10 aprobada.

**Architecture:** Estado comercial y evidencia sobre inventario BUS-10 con CAS y eventos atómicos. La exclusión es inmediata; avisos y borrado R2 usan manifiestos durables idempotentes.

**Tech Stack:** ESM JavaScript/JSDoc, Workers/Pages, D1, R2, React existente, node:test.

**Spec:** `docs/superpowers/specs/2026-11-08-l1-availability-design.md` (leer completa).

## Global Constraints

- Planificación sobre main `93f8f25`; no producto, migraciones aplicadas, pruebas de producto, servicios, installs ni publicación en este encargo.
- EST-16 depende BUS-10 pendiente; EST-15 además EST-18 publicado y NOT-11 parcial pendiente; EST-19 además SPR-03 pendiente, AUT-07 publicado y diseño PRE-12. Dependencias integradas se verifican al construir.
- D02 aprobada por Luis 8-nov:48 h alquiler/7 días compra configurables y contradicción material exige reconfirmación antes de uso. D10 aprobada: seis meses solo originales/derivados/paquetes de presentación sin uso activo, preservando identidad mínima/referencias/evidencia necesaria/historial de clientes/consultas/visitas. Ningún borrado real ahora.
- No TTL para levantar una baja humana, ni scraping fallido como prueba negativa; no reutilizar confirmed_at legacy como confirmación comercial.
- No nueva vista de historial, eliminación personal, cierre automático de búsqueda ni inventario paralelo. EST-07 es alias histórico de EST-15.
- APIs protegidas por currentAdmin/SameOrigin. Actor de sesión; evidencia y relaciones comprobadas servidor.
- CSS vigente: panel ink #141414, mist #f2efe9, line #e2ddd4, stone #6b665e, bronze #8a6a3b, ok #1f6b3a, err #a32020, fondo campo #fbfaf8; Montserrat 14px/1.5, Tenor Sans H1 26px/400; card radio14/padding24, campo radio10, botón radio999 `10px 20px`, gaps8–16, tabla `10px 12px`, página `24px 16px 120px`, corte760; foco2px offset2, disabled.45. Los tokens unificados/tonos nuevos de DESIGN siguen siendo propuestas.
- Accesibilidad AA texto 4.5:1/foco 3:1, labels/errores asociados, teclado, zoom 200%, 1280/390 y reduced-motion; sin librería/fuente nueva, miniaturas con aspecto fijo, páginas ≤50.

## Review Focus

1. Respuesta antigua que llega tras confirmación humana: conservar evidencia sin sobreescribir cabeza (Task 1).
2. Baja de una publicación con otro anunciante útil: no excluir operación completa ni producir aviso global (Task 2).
3. Dos empleados y replay con versión antigua: un efecto/evento; ID reutilizado con otro payload 409 (Task 2).
4. R2 borró pero D1 falló y se crea referencia concurrente: reconciliar sin borrar objetos recién usados (Task 3).
5. Agosto31, febrero bisiesto y solo algunos archivos borrados: meses calendario y estado partial honesto (Task 3).

## Files and integration order

Nuevos: `server/market-availability.js` (validación/proyección/confirmación y adaptador BUS-10), `server/availability-effects.js` (outbox), `server/market-trash.js` (retención), `server/routes/market-availability.js` (HTTP), `admin/src/MarketAvailability.jsx` (componente), `tests/server/market-availability.test.mjs`, `tests/server/market-trash.test.mjs`, `tests/market-availability.e2e.cjs`. Modificar: `server/api.js`, `server/match-store.js`, `server/jobs.js`, `admin/src/styles.css`, futuro detalle BUS-10 mediante su punto de montaje; `server/events.js` solo si requiere reutilización segura. No modificar `listing-events` para aceptar IDs que no son listing.

Migraciones futuras con nombres lógicos `l1_market_availability` y `l1_market_trash`: asignar prefijo secuencial libre al construir contra main y entregas de BUS-10/NOT-11, antes de crear archivos; no reservar ahora un 003x que puede colisionar. Es la única ruta que no puede fijarse numéricamente en planificación simultánea. La primera crea observaciones/confirmaciones/heads/operations/effects y amplía CHECK events con property conservando tipos/IDs/índices/notifications actuales; coordinar esa ampliación con otros productores EST-18; lifecycle usa entity_type applicant vigente. La segunda crea trash/objetos, leases y referencias de contenido según SPR-03/D10. SQL y campos exactos se describen en la spec; no crear tablas espejo de upstream.

### Task 1: EST-16 y frontera de inventario

**Files:** crear `server/market-availability.js`, `tests/server/market-availability.test.mjs`; migración lógica `l1_market_availability`; modificar `server/events.js` si la inserción reusable lo exige.

**Interfaces:** consumir inventario BUS-10 integrado mediante `loadInventoryScope(env,scope):Promise<ScopeRef>` y `scopeAffectedMatchesQuery(scope):{sql,binds}` (adaptadores propuestos, no funciones existentes). Producir `recordMarketObservation(env,input,actor):Promise<{observation_id:string,replayed:boolean,event_id:number}>`, `availabilityForScope(env,scope,at,policy):Promise<AvailabilityFact>`, `confirmMarketAvailability(env,command,actor):Promise<AvailabilityReceipt>` con tipos exactos de spec. Política `{rent_valid_ms:number,buy_valid_ms:number}` configurable, valores iniciales aprobados `172800000` y `604800000`ms, anclados a confirmed_at comercial sin renovar por lectura. Operación sin política decidida produce revisión/inelegible. Producir además `availabilityFactsQuery({asOf,policy}):{sql,args}` con filas por `(property_key,confirmation_id)` y columnas exactas de spec; EST-13 calcula compatibilidad cliente/versiones, nunca hereda aceptación de otro hogar.

- [ ] RED escribir casos `absent_and_failed_are_observations_not_unavailable`, `late_scrape_keeps_later_human_confirmation`, `contradiction_requires_review`, `legacy_confirmed_at_is_not_imported_as_evidence`, `scope_relationships_are_validated`, `rent_48h_buy_7d_expiry_and_config`, `material_contradiction_requires_reconfirmation`, `search_context_versions_are_not_shared_between_households`, `stale_available_confirmation_is_not_returned`, `specific_context_cannot_override_global_human_unavailability`. Afirmar state disponible tras not_found/fallo, observed_at nuevo y confirmed_at anterior independiente; no confirmation nueva creada por scrape; scopes cruzados400.
- [ ] Ejecutar `node --test tests/server/market-availability.test.mjs`; esperar FAIL por export/tablas ausentes, no por infraestructura.
- [ ] Crear migración integrada y funciones: observaciones inmutables con recepción/hecho separados, confirmaciones y heads CAS; incluir policy explícita y condiciones de contradicción material D02 aprobada: invalidar evidence_valid, exigir reconfirmar antes de nuevos envíos; no levantar exclusión humana por TTL. Fechas futuras400; evidencia sin permiso404/403; IDs no válidos400. Usar binds, no SQL generado desde claves de usuario.
- [ ] GREEN repetir comando; afirmar PASS y rollback: si falla evento, no se escribe confirmación/cabeza; conservar eventos antiguos e IDs tras migración. Verificar importación repetida mismo hash=recibo anterior, distinto hash409, dos fuentes distintas conservadas.
- [ ] Revisar diff y guardar commit futuro de alcance Task 1 cuando esté autorizado construir; no ejecutar git add/commit durante planificación.

### Task 2: EST-15 manual, exclusión inmediata y propagación

**Files:** crear `server/availability-effects.js`, `server/routes/market-availability.js`, `admin/src/MarketAvailability.jsx`, `tests/market-availability.e2e.cjs`; modificar `server/market-availability.js`, `server/match-store.js`, `server/api.js`, `admin/src/styles.css`, detalle BUS-10 integrado y `tests/server/market-availability.test.mjs`.

**Interfaces:** `availabilityProjectionStatements(env,{confirmation_id,scope,expected_version}):D1PreparedStatement[]`; `runAvailabilityEffects(env,{at,limit:50}):Promise<{done:number,pending:number,failed:number}>`; consumidor NOT-11 debe aceptar/upsert gestión por clave `(confirmation_id,effect_kind,target_id)` y devolver recibo durable. Este productor no crea otro sistema de tareas. API propuesta GET `/api/admin/market-availability?property_id=…&operation_id=…`; POST `/api/admin/market-availability/confirm` recibe AvailabilityCommand, responde AvailabilityReceipt; no endpoints públicos. GET solo metadatos paginados. `MarketAvailability({fact,observations,onConfirm,reload})` recibe las funciones del host BUS-10 y no crea router duplicado.

- [ ] RED añadir `operation_unavailability_leaves_other_operation_eligible`, `publication_unavailability_preserves_alternative_advertiser`, `shortlisted_blocked_but_retained`, `manual_unavailability_works_without_sweep`, `archive_does_not_confirm_unavailability`, `two_admins_one_version_one_receipt`, `replay_hash_conflict_409`, `visit_warning_does_not_cancel_or_resolve_search`. Afirmar exclusión de inserción concurrente, event/cabeza/outbox una vez, otra operación intacta y búsqueda active.
- [ ] Ejecutar `node --test tests/server/market-availability.test.mjs`; esperar FAIL en proyección/efectos nuevos.
- [ ] Implementar batch CAS de confirmación+exclusión+evento+outbox y comprobación de elegibilidad dentro de cada INSERT/UPDATE de match. La lectura de matching también filtra bajas. Mantener filas históricas y Shortlisted; ninguna confirmación depende del próximo cron. Añadir outbox leased que actualiza tareas existentes NOT-11 y estados por gestión, sin cancelar visitas ni ofertas. Si NOT-11 no integrado, no declarar completa esta tarea ni activar automatización; se puede verificar el núcleo manual por separado.
- [ ] Implementar HTTP + componente con alcance, motivo/evidencia obligatorios, previsualización de afectados, “Reload” tras409, borrador conservado y “Availability saved. Follow-up pending.” cuando hay outbox. Auth401/origen403, missing404, invalid400, conflict409, temporal503; actor JSON ignorado/rechazado. Sin texto libre en events ni evidencia secreta en errores/logs. Validar safeHref y React escaping.
- [ ] GREEN repetir tests y ejecutar recorrido futuro `node tests/market-availability.e2e.cjs` con harness e2e existente, solo datos locales: confirmar operación, verificar filtros de otros clientes, Shortlisted, visitas y retry. Añadir assertions teclado/foco/error/expired-session, desktop 1280/mobile 390/zoom 200%; no afirmar e2e ejecutado ahora.
- [ ] Revisar con diff trazable y commit futuro del núcleo manual/efectos; documentación de integración debe dejar EST-15 parcial si avisos reales faltan. No activar barrido para compensarlo.

### Task 3: EST-19 papelera y purga conforme a política D10

**Files:** crear `server/market-trash.js`, `tests/server/market-trash.test.mjs`; modificar `server/jobs.js`, `server/market-availability.js`, `server/routes/market-availability.js`, `admin/src/MarketAvailability.jsx`, `tests/market-availability.e2e.cjs`; migración lógica `l1_market_trash` y contratos de archivos SPR-03 integrados.

**Interfaces:** `enterMarketTrashStatements(env,{confirmation_id,scope,at}):D1PreparedStatement[]`; `purgeDueAt(enteredAt:string):string`; `marketTrashPass(env,{at,episodeLimit:50,objectLimit:100}):Promise<{purged:number,partial:number,blocked:number}>`. Consumir manifiesto SPR-03 con `{object_id,storage_key,category,media_revision,active_reference_count,required_as_evidence}` y exclusión de nuevo uso `deleting`. `marketTrashPass` usa env de R2 ya existente, no claves de storage procedentes del cliente. Recibos por objeto `(episode_id,object_id)`.

- [ ] Antes de RED, verificar política D10 aprobada 8-nov registrada en spec. Delimitar objetos originales/derivados/paquetes de presentación, pins y evidencia a conservar; no ampliar categorías ni retención de personas. Este plan no ejecuta ni habilita borrado.
- [ ] RED casos `six_calendar_months_not_180_days`, `month_end_is_capped_in_leap_year`, `active_or_required_evidence_object_is_blocked`, `publication_scope_does_not_purge_shared_property_media`, `r2_timeout_after_delete_reconciles`, `new_reference_cannot_link_deleting_object`, `unknown_usage_fails_closed`, `stale_fence_delete_cannot_touch_new_revision`, `reactivation_stops_pending_purge`, `partial_failure_does_not_claim_purged`, `old_reimport_keeps_identity_and_unavailability`. Afirmar `2026-08-31T12:00:00.000Z` → `2027-02-28T12:00:00.000Z`; `2027-08-31…` → `2028-02-29…`; conservar events, cliente/criterios/consulta/visita y alias de propiedad.
- [ ] Ejecutar `node --test tests/server/market-trash.test.mjs`; esperar FAIL por funciones/tablas nuevas.
- [ ] Implementar calendario UTC con fin de mes limitado, episodio idempotente y manifiesto. Guardar lease/fence_token, pins durables y bloquear nuevas referencias antes de R2; uso desconocido o evidencia no resuelta bloquean. Por objeto comprobar versión y uso actual; una revisión deleting nunca vuelve reusable ni reutiliza su storage_key, aunque venza lease. Recaptura/reutilización usa revisión+key nuevas; así delete remoto tardío no puede borrar contenido nuevo. Verificar fence antes del delete y recibo. Reconciliar timeout/ausente, reintentos 1/5/30 min y luego diario; partial/blocked visibles con error_code allowlist. Un fallo no escribe éxito ni reinicia entrada a papelera.
- [ ] Integrar al AUT-07 existente tras retentionPass sin modificar retenciones previas; capturar fallo para que otros pasos del reloj continúen y registrar solo contadores/error_code sin PII. No nuevo cron/servicio; máximo 50 episodios/100 objetos por tick; overdue se procesa al siguiente tick. GET de papelera permite cursor por `(purge_due_at,episode_id)` y estados reales.
- [ ] GREEN repetir comando y test de cron con dos ticks concurrentes/lease expirado; afirmar un recibo y ausencia de borrado de objetos referenciados. Recorrido e2e local futuro muestra parcial y referencia histórica legible; no descargar originales en lista.
- [ ] Revisar diff/retención y commit futuro; activar purga requiere autorización operativa de publicación/migración aparte del acuerdo de política.

### Task 4: Validación final e integración documental futura

**Files:** tests nombrados arriba; actualizar al construir `docs/roadmap/tasks/EST-16.json`, `EST-15.json`, `EST-19.json`, `EST-18.json` y `docs/roadmap/ESTADO.md` mediante dueño de catálogo, no por este subencargo.

- [ ] Ejecutar tests focales, `npm test`, `npm run build`, `npm run check:release`, e2e según cabecera del harness vigente. Si hay fallo separar regresión y bloqueo previo; ninguna instalación/reconfiguración para forzarlo.
- [ ] Verificar contrato BUS-10/SPR-03/NOT-11 integrado, migraciones sin cascades destructivos y CHECK events con todos sus productores. No marcar upstream completo por compatibilidad de DTOs propuestos.
- [ ] Inspeccionar Playwright local1280/390, zoom 200%, teclado, errores, cargas/vacíos, foco, red/consola; comprobar no purga de personas ni no-disponibilidad causada por archivo editorial.
- [ ] Actualizar ledger con resultados reales, autorización exacta y entregas pendientes. Revisión y publicación son pasos futuros; este plan no constituye permiso.

## Self-review de planificación

Cada criterio EST-16→Task 1, EST-15/alias07→Task 2, EST-19→Task 3, productores EST-18→Tasks 1–3 tiene una tarea y prueba. Cinco focos de revisión mapeados. DTOs y nombres consistentes con spec; números de migración se asignan al integrar para evitar colisiones. D02/D10 aprobadas expresamente 8-nov y alcance operativo separado; no se escribieron/ejecutaron tests, no se modificó producto. No hay reserva remota de planificación.
