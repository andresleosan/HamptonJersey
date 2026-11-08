# EST-13 / EST-04 / EST-05 / EST-06, seguimiento independiente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer dimensiones independientes y los contratos aprobados de resumen, sin confundir gestión con aprobación.

**Architecture:** Proyección SQL sobre candidatos, decisiones y disponibilidad normalizada; adaptadores de consulta y presentación sin transporte. Sin tabla duplicada de resumen ni TTL propio.

**Tech Stack:** JavaScript ESM, Workers/Pages, D1/SQLite, React/Vite, node:test y Playwright existentes.

**Spec:** [Diseño](../specs/2026-11-08-l1-followup-states-design.md).

## Global Constraints

- Solo planificación sin reservas ni producto en esta entrega. Antes de construir: verificar GitHub/alcance, dependencias integradas, reserva build y migración de número libre. Ninguna casilla futura acredita ejecución ni autoriza publicar/migrar.
- Admin/sameOrigin/no-store existentes; actor del servidor, SQL parametrizado, validación IDs/enums/versiones, DTO mínimo y texto React. Sin env/secretos, PII/mensajes en logs/eventos/storage ni envíos automáticos. GET no escribe.
- `search_state=active` y sin archivo para trabajo nuevo; cierre/reapertura humanos EST-09. No usar Stage para cerrar. Fuentes web/confirmed_at/precio/visita/Shortlisted no confirman disponibilidad ni aprobación. D06 continúa desactivado.
- CSS actual: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, bronze-dk#86542d, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. Tenor Sans/Georgia/serif H1 26px/H2 19px peso400; Montserrat/system-ui 14px/1.5 y auxiliar12px, cabecera12px/600. page max1240px padding24px 16px 120px; radios14/10/999px; celdas10px 12px, botón10px 20px/pequeño6px 14px, gaps8/12/16px; sombra0 1px 2px rgba(20,20,20,.04),0 12px 32px -18px rgba(20,20,20,.22).
- Propuestas DESIGN globales de radios16/12, escala4/8/12/16/24/32/48/64 y breakpoints480/760/980 no son CSS actual. Aquí solo se propone reflow760 y objetivos32px escritorio/44px móvil en controles tocados. Foco2px/offset2px, hover bronze-dk, disabled opacity.45, texto4.5:1/foco3:1, teclado/zoom200%,1280/390, reduced motion. UI/API inglés; ENERGY1/RHYTHM1/MOTION1. Sin nuevas fuentes/imágenes/librerías/animaciones.

## Review Focus

1. Múltiples publicaciones y confirmaciones: consolidar antes de contar, Task 2.
2. Aceptación del hogar A, criterios editados y contexto general: nunca aceptación de B, Task 2.
3. Caducidad o contradicción: reconfirmar según productor D02, Task 2.
4. Falta de datos opcionales y SQL fallido: ausencia frente a error, Tasks 1/2.
5. Consulta compartida y cierre de una búsqueda: preservar otras sin disparar espera/envíos, Task 3.

## Archivos y responsabilidades

Crear `server/match-followup.js` (builders de hechos, cards y seguimiento por propiedad), `server/market-enquiry-input.js`, `server/client-followup-input.js` (adaptadores requeridos, sin transporte), `tests/server/match-followup.test.mjs`, `tests/server/match-followup-contract.test.mjs` y `tests/match-followup.e2e.cjs`. No migración propia: BUS-12 posee candidates, BUS-15 decisions, EST-16 evidencia/política y AGE-03/AGE-11/VIS-17 sus datos. No tablas ficticias para productores ausentes. SAP-02 posee agregación, SAP-03 su endpoint/cards y BUS-18 su API/UI. EST-10 consume flags nuevos para etiquetas; no duplicar componente ni sustituir silenciosamente Queue técnico legacy.

## Task 1: Contratos de productores sin ciclo

**Interfaces:** Consume match_candidates, approvedCandidatesQuery({asOf}) y availabilityFactsQuery({asOf, policy}) por property_key/confirmation_id. Produce sharedEnquiryFactsQuery({asOf}) y clientFollowupFactsQuery({asOf}) con columnas/enums de spec; builders internos sin PII ni escrituras.

- [ ] Verificar BUS-12/BUS-15/BUS-10/EST-09 integrated según catálogo. Registrar firmas reales/migraciones activadas y adaptar sin construir upstream. Leer productor EST-16 y política D02 aprobada:48h alquiler,7d compra, configurable; contradicción material exige reconfirmar. Transfer sin política propia sigue unknown. No duplicar TTL.
- [ ] Añadir tests de contrato: candidate_port_has_canonical_operation_key, decision_port_has_current_head_and_versions, availability_port_preserves_context_and_scope_versions, enquiry_port_separates_transport_and_commercial_response, client_port_waiting_requires_actual_delivery, missing_optional_port_is_explicitly_unsupported, integrated_port_sql_error_propagates. Afirmar requirements_version y occupants_version iguales a search_version en este incremento conservador.
- [ ] Ejecutar `node --test tests/server/match-followup-contract.test.mjs` -> RED por adaptadores nuevos. Si falta productor, registrar gate real de integración; fixtures de unidad no lo sustituyen.
- [ ] Implementar adaptadores según productores integrados. Ausencia opcional se declara al ensamblar builders y produce unknown/unavailable; nunca catch de tabla inexistente o error SQL. Preservar asOf UTC único, binds ordenados y separación de dimensiones.
- [ ] Repetir suite -> PASS para contratos disponibles; registrar pendientes por dimensión. Commit futuro `feat: define normalized match follow-up input ports`.

## Task 2: Export SAP-02 exacto

**Interfaces:** `matchSummaryFactsQuery({asOf:string}):{sql:string,args:unknown[]}` en server/match-followup.js. Una fila por applicant_id/property_key con candidate_current, approval_current, availability_current_for_search, facts_valid enteros0|1. SELECT sin semicolon final, sin ejecutar DB; política configurada del productor internamente, firma SAP-02 intacta.

- [ ] Crear tests summary_facts_keep_candidates_without_optional_rows, summary_facts_canonicalize_three_sources_two_enquiries, summary_facts_found_includes_approved, summary_facts_shortlist_publish_price_visit_never_approve, summary_facts_human_rejection_is_search_scoped, summary_facts_material_or_search_change_invalidates_approval, summary_facts_invalid_row_is_not_hidden, summary_facts_sql_error_is_not_empty_success, summary_facts_get_does_not_write. Afirmar12/3/2 con intersecciones, una fila por búsqueda/operación y 0<=available<=approved<=found.
- [ ] Añadir availability_search_context_requires_same_applicant_and_versions (A acepta, no B), availability_general_does_not_prove_household_conditions, availability_expiry_uses_producer_exact_boundary (48h/7d configurados; asOf==valid_until no vigente), availability_material_contradiction_requires_reconfirmation, new_human_confirmation_beats_older_scrape_per_producer, missing_confirmation_is_not_unavailable y transfer_without_policy_is_unknown. Usar productor real para vigencia, no copiar su algoritmo en el fixture.
- [ ] Ejecutar `node --test tests/server/match-followup.test.mjs` -> RED por query nueva.
- [ ] Implementar CTEs: partir de candidatas e históricas, reducir decisión a head, reducir evidencia por precedencia del productor y compatibilidad por búsqueda, LEFT JOIN opcionales. Contexto search exige id/versión y requirements/occupants_version exactos; contexto general no cubre condiciones particulares del hogar o uso. Aplicar rechazo solo por relación y aprobación solo vigente. No MAX de confirmaciones/aprobaciones históricas.
- [ ] Emitir facts_valid0 para claves/versiones imposibles y duplicados no reconciliables, preservando fila. Ausencia legítima de aprobación/evidencia ->0; contradicción ->sin disponibilidad y review; error SQL lanza. Archivado administrativo no equivale a retirada comercial. No PII/evidencia/cuerpo en salida SAP-02.
- [ ] Repetir suites -> PASS; EXPLAIN con índices reales y fixtures grandes locales, una query global sin N+1. Commit futuro `feat: project current canonical match facts for summaries`.

## Task 3: Detalle, consultas y etiqueta In process EST-04

**Interfaces:** followupCardsQuery({applicantId, asOf, cursor, limit, group?}) y propertyFollowupFactsQuery({propertyId, operation, asOf, cursor, limit}) ->{sql, args}, enums y columnas de spec. `followupWorkFactsQuery({asOf}):{sql,args}` produce sin paginar una fila por candidate_id/applicant_id/property_key con awaiting_agent0|1, awaiting_applicant0|1, facts_valid0|1. EST-10 agrega estos flags en workLabelsQuery para work_labels; no duplica cálculo ni cambia Queue técnico legacy.

- [ ] Tests followup_dimensions_are_independent, agent_answer_does_not_start_client_waiting, actual_sent_presentation_starts_only_its_search_waiting, public_interest_is_not_private_client_response, resolved_search_keeps_other_enquiry_links, one_search_two_operations_remain_separate, external_property_has_nullable_listing_and_thumbnail, external_cards_preserve_checks_from_candidate_evaluation_without_legacy_match (incluye unknown/fails y evidence_ref del candidato, sin score como sustituto), cards_cursor_is_group_applicant_and_snapshot_bound, cards_global_total_not_page_size, cards_watermark_change_between_pages_returns_409_without_rows (datos o configuración cambian), cards_same_watermark_preserves_as_of_and_position, cursor_tampering_or_other_scope_is_400, cursor_expiry_after_300000ms_is_409, property_followup_one_row_per_search_operation y completed_maps_to_viewed_but_no_show_does_not (completed acreditado ->Viewed, no_show ->No show y no sumaViewed).
- [ ] Añadir est04_in_process_requires_real_agent_or_client_wait: pending de consulta real ->awaiting_agent1; presentación real sent sin respuesta ->awaiting_applicant1; cualquiera ->in_process1, nunca Shortlisted solo. est04_unknown_producer_is_not_false_work_state: productor ausente/inválido ->facts_valid0 y downstream no afirma etiqueta. est04_resolved_search_has_no_active_work_label: cierre humano elimina etiqueta activa sin borrar consulta de B. est04_legacy_queue_preserved_but_labelled_technical: API conserva Queue legacy y UI EST-10 prioriza proyección válida o muestra ausencia de evidencia, no etiqueta falsa.
- [ ] Ejecutar suites focales -> RED por exports detalle/work nuevos.
- [ ] Implementar builders sobre base consolidada Task 2, sin transiciones automáticas. source_refs incluyen source_id, listing_id nullable, url nullable, observed_at nullable; display_summary real y thumbnailnull cuando falta; devolver explícitamente checks:[{key,priority,result,evidence_ref,reason}] de EvaluationV1 junto a evaluation_status, también en propertyFollowupFactsQuery. Representante solo por vínculo BUS-10 explícito, externos no fuerzan HE-*. Limit25 por defecto1..100, orden BUS-14 integrado, commercial score null, desempate property_key.
- [ ] Calcular total_rows anteslimit y keyset/next_cursor solo con página posterior. Cursor sellado FollowupCursorV1 con as_of/events_watermark y caducidad300000ms, validación de propósito/integridad/ámbito; primera y siguientes páginas leen watermark+totales+filas en mismo DB.batch readonly. Si COALESCE(MAX(events.id),0) difiere,409CURSOR_STALE sin filas; sin snapshot histórico D1. Preflight exige evento atómico de cada cambio persistido usado por la proyección. Cursor ligado a applicant/group/posición; propiedad orden operación, activa/histórica, applicant_id. Grupos found/approved/availability_confirmed anidados; rejected y legacy_shortlisted son histórico sin permiso. Waiting agente solo consulta pendiente acreditada vinculada y activa; waiting cliente solo presentación realmente enviada y sin respuesta posterior. In_process exige búsqueda activa y alguno de esos hechos válidos.
- [ ] Repetir suites -> PASS. Verificar rechazo histórico no se borra y cierre no cancela consulta común útil para otros. Commit futuro `feat: expose independent match follow-up and work states`.

## Task 4: Contratos consumidores y entrega

**Interfaces:** SAP-02 usa export Task 2 exacto; SAP-03 cardsQuery; BUS-18 propertyQuery; EST-10 followupWorkFactsQuery. No implementar sus UIs ni transporte/presentación/visitas aquí.

- [ ] Probar CTE embebida con consumidor SAP-02 real cuando exista:12/3/2, cero, invalidez, histórica y varias búsquedas; mismo asOf/snapshot, sin duplicar flags. Validar adaptación EST-10: etiqueta In process solo con facts_valid1; Queue legacy queda técnico/histórico de compatibilidad.
- [ ] Si existe UI integrada, crear tests/match-followup.e2e.cjs con acciones reales aprobar/revocar, confirmar, caducar, contradecir, agent answered, sent privado y resolver solo A. Dimensiones cambian separadas, ningún correo ni cierre implícito. Sin UI, registrar e2e integrado pendiente, no DTO interceptado como evidencia de dominio.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release` y suites de productores afectadas. E2E general/focal y Playwright MCP1280/390/zoom200% cuando haya consumidor UI; sin UI propia registrar no aplica al builder, no captura inventada.
- [ ] Revisión independiente, resolver hallazgos y repetir checks afectados. Registrar E13/E04/E05/E06; EST-05/06 conservan aliases históricos, EST-13/04 solo cierran con evidencia real. Actualizar catálogo/ESTADO/generados y relevo al construir, sin publicar/migrar por efecto de este plan.

## Autorrevisión actual

E13-1/E05-1/E06-1/E04 ->Task 3;E13-2/3/4 ->Task 2;E13-5 ->Task 3/4. API SAP-02 exacta y puertos cotejados; D02 resuelta por Luis, TTL del productor; D06 off. Hoy solo documentos, sin pruebas/runtime ni implementación.
