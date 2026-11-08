# BUS-12 / REG-04, evaluación canónica y comercial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extender evaluación al inventario común con desconocidos explícitos y presupuestos comerciales comparables.

**Architecture:** Adaptador de inventario, evaluador puro y candidatos canónicos propios. Mantener evaluate/legacy y no construir upstream BUS-10 ni ranking BUS-14.

**Tech Stack:** JavaScript ESM, Cloudflare Workers/Pages, D1/SQLite, React/Vite, node:test y Playwright existentes; sin dependencias nuevas.

**Spec:** [Diseño](../specs/2026-11-08-l1-match-review-evaluation-design.md).

## Global Constraints

- Solo planificación sin reservas ni producto en esta entrega. Antes de construir: verificar GitHub/alcance, dependencias integradas, reserva build y migración de número libre. Ninguna casilla futura acredita ejecución ni autoriza publicar/migrar.
- Admin/sameOrigin/no-store existentes; actor del servidor, SQL parametrizado, validación IDs/enums/versiones, DTO mínimo y texto React. Sin env/secretos, PII/mensajes en logs/eventos/storage ni envíos automáticos. GET no escribe.
- `search_state=active` y sin archivo para trabajo nuevo; cierre/reapertura humanos EST-09. No usar Stage para cerrar. Fuentes web/confirmed_at/precio/visita/Shortlisted no confirman disponibilidad ni aprobación. D06 continúa desactivado.
- CSS actual: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, bronze-dk#86542d, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. Tenor Sans/Georgia/serif H1 26px/H2 19px peso400; Montserrat/system-ui 14px/1.5 y auxiliar12px, cabecera12px/600. page max1240px padding24px 16px 120px; radios14/10/999px; celdas10px 12px, botón10px 20px/pequeño6px 14px, gaps8/12/16px; sombra0 1px 2px rgba(20,20,20,.04),0 12px 32px -18px rgba(20,20,20,.22).
- Propuestas DESIGN globales de radios16/12, escala4/8/12/16/24/32/48/64 y breakpoints480/760/980 no son CSS actual. Aquí solo se propone reflow760 y objetivos32px escritorio/44px móvil en controles tocados. Foco2px/offset2px, hover bronze-dk, disabled opacity.45, texto4.5:1/foco3:1, teclado/zoom200%,1280/390, reduced motion. UI/API inglés; ENERGY1/RHYTHM1/MOTION1. Sin nuevas fuentes/imágenes/librerías/animaciones.

## Review Focus

1. Renta anual, redondeo y moneda/periodo ausentes: comparación exacta y unknown, Task 2.
2. Varias fuentes/unidades/operaciones y barridos interrumpidos: identidad y retiro seguros, Tasks 1/4.
3. Cambio concurrente de criterios o cierre: CAS sin escrituras parciales, Task 4.
4. Uso/edad/duración/gastos con semántica incompleta: no certeza o legalidad inventada, Tasks 2/3.
5. Legado revisado y ranking35/25: sin promoción ni cambio accidental, Tasks 3/5.

## Archivos y límites

Crear `site/commercial-requirements.js` (parser puro de prioridades comerciales), `server/market-match-input.js` (adaptador requerido), `server/commercial-matching.js` (normalización/evaluación), `server/market-matching.js` (despacho), `server/match-candidates.js` (persistencia). Modificar `server/applicants.js`, `server/routes/applicants.js`, `admin/src/ApplicantFields.jsx`, `site/apply.js` y `admin/src/MatchCard.jsx` solo para prioridad comercial/DTO/comparación vigente; mantener `server/matching.js` y `server/requirements.js` como autoridad residencial. Migración nueva `migrations/NNNN_market_match_candidates.sql`, asignada al construir. Tests nuevos `tests/server/market-match-input.test.mjs`, `tests/server/commercial-matching.test.mjs`, `tests/server/market-match-candidates.test.mjs`, `tests/commercial-matching.e2e.cjs`; ampliar `tests/server/registration-categories.test.mjs` y `tests/server/requirements-matching.test.mjs`. No modificar BUS-10, fuentes/servicios, ranker ni reglas legales.

## Task 1: Contrato de inventario comprobable

**Interfaces:** Consume BUS-10/REG-11 real, sin nombres upstream supuestos. Produce `marketMatchInputQuery({applicantId,asOf,cursor,limit}):{sql,args}` y MarketMatchInputV1 exacto en spec; propiedad/operación canónica, hechos versionados y fuente separada.

- [ ] Verificar REG-08 integrated/0031 activated para tramo REG-04, REG-11/EST-09 integrated, campos REG-04/05/06/07/08 y fuentes BUS-09 disponibles. Leer BUS-10 design; registrar contrato/adaptador exacto y lo que falta. Con BUS-10 sin integrar solo preparar contrato/fixtures de unidad, no declarar integración ni usar tabla ficticia en ruta activa.
- [ ] Añadir `market_input_is_one_property_operation` con3 publicaciones->1fila,2 unidades misma dirección->2, compra/alquiler->2claves; `market_input_preserves_conflicting_and_unknown_facts`; `market_input_error_never_becomes_empty_page`; `market_input_cursor_is_snapshot_bound` en tests/server/market-match-input.test.mjs. Afirmar source_id/publication_id/evidence_ref/version preservados y ninguna PII nueva.
- [ ] Ejecutar `node --test tests/server/market-match-input.test.mjs` -> RED por export inexistente; si falta productor no fingir RED de integración.
- [ ] Implementar adaptador sobre contrato real: binds, asOf único, limit1..100, orden property_key, cursor de snapshot; elegir representante solo por referencia explícita upstream, no por dirección. Duplicados/conflictos no resolubles se conservan inválidos para revisión.
- [ ] Repetir suite -> PASS una vez productor real integrado; registrar prueba de query plan/index de productor. Commit de construcción `feat: adapt canonical market inputs for matching`.

## Task 2: Renta y comparación comercial puras

**Interfaces:** Produce `normalizeCommercialMoney({amount,period,currency})` y `evaluateCommercial({search,inventory,asOf}):EvaluationV1` en server/commercial-matching.js. Consume campos comerciales/CommercialKey definidos en spec, sin fx ni reglas legales nuevas.

- [ ] Añadir `commercial_rent_annual_and_monthly_are_comparable`:24000/year==2000/month;24012/year>2000; display redondeado no cambia comparación. `commercial_money_missing_period_or_currency_is_pending`:period/currency ausentes->monthly null con reason exacto, EUR->unsupported_currency. `commercial_costs_are_independent`:rent no absorbe premium/purchase/expenses. `commercial_expenses_without_basis_are_unknown`; `commercial_duration_does_not_prove_suitability`; `commercial_unsupported_area_unit_is_unknown`; `commercial_priority_unknown_never_meets` con enums/status exactos.
- [ ] Ejecutar `node --test tests/server/commercial-matching.test.mjs` -> RED por export nuevo.
- [ ] Implementar normalización year/12 y month idéntico, valores finitos/positivos como validador existente, cero permitido solo premium/expenses. Comparar techos y rangos sin redondear, misma unidad de superficie, operación/kind exactos, zonas/exclusiones. Texto libre intended_use y fechas/duración sin hecho estructurado quedan unknown. No aplicar residential housing() al comercial ni declararlo legalmente apto.
- [ ] Ejecutar suite -> PASS; comprobar sin acceso DB/red, sin parsear anuncios en bucle. Commit `feat: evaluate commercial costs without assuming unknown facts`.

## Task 3: Prioridades comerciales y regresión residencial

**Interfaces:** Añade campo propio `commercial_requirement_priorities={version:1,values,unknown}` con claves/enums spec y lo incluye en valida/guardado/DTO; `evaluateMarketCandidate({search,inventory,asOf}):EvaluationV1` despacha al evaluador comercial o al evaluate residencial actual adaptado.

- [ ] Cotejar el campo técnico de prioridades con M03/M04 y REG-11 integrado antes de habilitar formulario, preservando semántica ya establecida de prioridad/certeza. Gastos sin base temporal siguen unknown, sin bloquear el resto de la entrega ni pedir nueva decisión para ese estado. No asumir prioridad must por cifra rellenada ni asignar base a expenses.
- [ ] Tests `commercial_priorities_round_trip_without_residential_leak`:edición/API/pública conservan v1 y unknown; inválidos400, tablaDBCHECK; alquiler/compra techos separados. `residential_evaluate_stays_reg08_authority`:parking2must vs1exact->alternative, unknown->pending, petsconditional->pending, stretch2200 respetado y viviendas legales sin cambio. `legacy_shortlist_is_not_canonical_approval`:histórico permanece, ninguna decisión nueva.
- [ ] Ejecutar `node --test tests/server/registration-categories.test.mjs tests/server/requirements-matching.test.mjs` -> RED específico antes del cambio.
- [ ] Implementar schema/campos con parse puro compartido en `site/commercial-requirements.js` (crear) y reutilizar RequirementSwitch de panel; flujo público respeta unknown. Integrar validación de server/applicants.js y columnas DTO/save de server/routes/applicants.js; versionado CAS existente. No tocar presupuestos residenciales ni score35/25/BUS-14.
- [ ] Implementar dispatcher y comparación en MatchCard para evaluación canónica solo al existir contrato integrado; sources/fechas en texto y links http(s) seguros. Ejecutar suites -> PASS. Commit `feat: preserve explicit commercial priorities in matching`.

## Task 4: Candidatos canónicos y recálculo seguro

**Interfaces:** `upsertCandidateEvaluations(env,{applicantId,expectedSearchVersion,inventoryVersion,rows,actor,asOf}):Promise<{written,stale}>` en server/match-candidates.js produce tabla match_candidates/columnas exactas spec para BUS-15 y EST-13. Material_version solo criterios/hechos materiales, nunca actualizar por GET.

- [ ] Crear tests `candidate_upsert_deduplicates_property_operation`, `partial_or_failed_scan_does_not_retire_candidates`, `candidate_update_rechecks_active_search_and_inventory_versions`, `closed_search_race_rolls_back_candidates_and_events`, `human_legacy_decisions_survive_refresh`, `candidate_material_change_increments_revision`, `candidate_scan_idempotent_no_duplicate_events` en tests/server/market-match-candidates.test.mjs.
- [ ] Ejecutar `node --test tests/server/market-match-candidates.test.mjs` -> RED por tabla/export nuevos.
- [ ] Crear migración siguienteNNNN con UNIQUE(applicant_id, property_key), enums/checks, FKapplicant e índices spec, campo prioridad comercial y documentación de adaptadorFKBUS10. Backfill solo identidad trazable; sin inventar aprobaciones ni borrar matches. Lectura ambigua se marca evaluation_valid0 y revisión, no candidata confirmada.
- [ ] Implementar upsert atómico, CAS búsqueda activa/versión y snapshot inventario; usar guard con rollback total, sin actualización silenciosa parcial. Guardar requirements_status/requirements_rank/checks/evidenciaRefs, score comercial null. Persistir candidate_current neutral respecto al rechazo; EST-13 aplica decisión por búsqueda. Cierre exitoso de barrido completo marca noactuales sin borrar historia; fallo de página no cierra barrido.
- [ ] Conectar evento `match.evaluation_changed` entity_type applicant y data{version:1, candidate_id, property_key, revision, search_version, material_version, requirements_status}, misma transacción; no texto libre/PII y no listingEventStatements. No evento si nada material cambió.
- [ ] Ejecutar suite -> PASS; comprobar que fallo de evento revierte candidato y CAS. Commit `feat: persist canonical candidate evaluations atomically`.

## Task 5: Integración, UI y evidencia por código

**Interfaces:** Consume Tasks 1–4 y contrato ranking BUS-14 real si existe; produce evaluación canónica disponible para consumidores sin aprobar, enviar ni cerrar búsqueda.

- [ ] Añadir tests/commercial-matching.e2e.cjs: presupuesto independiente, renta anual, unknownperiodo/gastos, prioridad explícita, fuentes/fecha, dos operaciones, regresión residencial; fixtures productor real, sin mocks usados como prueba de integración. UI carga/vacío/error/409/401, requests tardías descartadas y sin double-submit.
- [ ] Ejecutar `E2E_SCRIPT=tests/commercial-matching.e2e.cjs npm run test:e2e` -> PASS; reservar host e2e sin concurrencia. Verificar1280/390, teclado/foco/zoom200%, copyinglés, contraste, reflow760, reduced motion. No assets nuevos.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release`, `npm run test:e2e` y suites focales REG-08/REG-11 afectadas una vez; todos PASS o registrar bloqueo real. Playwright MCP local recorre controles tocados y consola/red; no medir producto en planificación.
- [ ] Revisión independiente; corregir hallazgos materiales y repetir checks afectados. Actualizar BUS-12/REG-04, ESTADO y generados oficiales solo al construir, sin cerrar BUS-13/BUS-14/BUS-10 ni EST-18 global. Registro porB12/R04 de aceptación y dependencias faltantes.
- [ ] Commit con paths explícitos y evidencia, relevo privado y SHA preparado. No migrar/publicar hasta autorización correspondiente.

## Autorrevisión y estado actual

Aceptación B12-1/3/R04-2/3/4 -> Tasks 2/3;B12-2 ->1/4;R04-1 ->3;B12-4/5 ->4/5. Tipos/nombres cotejados con spec; comercial desconocido nunca se vuelve meets; puertos upstream propuestos quedan marcados. Solo documentos revisados hoy, sin tests/runtime ni producto ejecutados. Skills aplicadas y valores de diseño se detallan en spec; no existe decisión comercial adicional aprobada por este plan.

## Alcance final de categorías BUS13

Por decisión de Luis, Qualified/Registered se utiliza solo para Lettings residencial de Jersey. El dispatcher y adaptadores de BUS12/REG04 consumen el helper de alcance del diseño final BUS13; no crean checkhousing ni pending por categoría ausente en compra, comercial, internacional o transfer. Se preservan evaluación de presupuesto, operación, MUST y demás hechos. El inventario canónico aporta país/región ounknown sin inferencia por ID. Esto delimita comportamiento de producto, no afirma elegibilidad legal universal.
