# BUS-15 / BUS-16 / EST-18, revisión humana Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar aprobación humana versionada de consulta inicial sin envío ni divulgación.

**Architecture:** BUS-15 persiste decisiones append-only sobre candidatos BUS-12 y expone permiso normalizado. EST-13 y AGE-03 lo consumen después; no hay dependencia circular.

**Tech Stack:** JavaScript ESM, Cloudflare Workers/Pages, D1/SQLite, React/Vite, node:test y Playwright existentes; sin dependencias nuevas.

**Spec:** [Diseño](../specs/2026-11-08-l1-match-review-manual-design.md).

## Global Constraints

- Solo planificación sin reservas ni producto en esta entrega. Antes de construir: verificar GitHub/alcance, dependencias integradas, reserva build y migración de número libre. Ninguna casilla futura acredita ejecución ni autoriza publicar/migrar.
- Admin/sameOrigin/no-store existentes; actor del servidor, SQL parametrizado, validación IDs/enums/versiones, DTO mínimo y texto React. Sin env/secretos, PII/mensajes en logs/eventos/storage ni envíos automáticos. GET no escribe.
- `search_state=active` y sin archivo para trabajo nuevo; cierre/reapertura humanos EST-09. No usar Stage para cerrar. Fuentes web/confirmed_at/precio/visita/Shortlisted no confirman disponibilidad ni aprobación. D06 continúa desactivado.
- CSS actual: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, bronze-dk#86542d, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. Tenor Sans/Georgia/serif H1 26px/H2 19px peso400; Montserrat/system-ui 14px/1.5 y auxiliar12px, cabecera12px/600. page max1240px padding24px 16px 120px; radios14/10/999px; celdas10px 12px, botón10px 20px/pequeño6px 14px, gaps8/12/16px; sombra0 1px 2px rgba(20,20,20,.04),0 12px 32px -18px rgba(20,20,20,.22).
- Propuestas DESIGN globales de radios16/12, escala4/8/12/16/24/32/48/64 y breakpoints480/760/980 no son CSS actual. Aquí solo se propone reflow760 y objetivos32px escritorio/44px móvil en controles tocados. Foco2px/offset2px, hover bronze-dk, disabled opacity.45, texto4.5:1/foco3:1, teclado/zoom200%,1280/390, reduced motion. UI/API inglés; ENERGY1/RHYTHM1/MOTION1. Sin nuevas fuentes/imágenes/librerías/animaciones.

## Review Focus

1. Shortlisted histórico o score 100: jamás permiso nuevo, Tasks 1/3.
2. Cierre/cambio material/revisión simultánea: CAS atómico y409, Task 2.
3. Rechazo del clienteA: no altera propiedad ni clienteB, Task 2.
4. Teclas en formularios, respuesta tardía y sesión expirada: no decisión accidental, Task 3.
5. Fallo de evento/reintento/revocar: historial íntegro sin PII ni permiso residual, Tasks 1/2.

## Mapa de archivos

Crear `server/match-decisions.js`, `migrations/NNNN_match_decisions.sql`, `tests/server/match-decisions.test.mjs`, `tests/match-review.e2e.cjs`; modificar `server/routes/matches.js`, `admin/src/Review.jsx`, `admin/src/MatchCard.jsx`, `admin/src/ApplicantDetail.jsx` y CSS acotado. `server/events.js` se reutiliza; `server/api.js` ya incluye matchesRoutes, no otro sistema auth. BUS-12 es dueño match_candidates; no recrear su migración. EST-18 events ya existe0029: no extender CHECK para decisiones entity_type applicant.

## Task 1: Decisión explícita y proyección de permiso

**Interfaces:** Consume match_candidates spec BUS-12/applicantsEST-09. Produce `reviewCandidate(env,{candidateId,action,expectedCandidateRevision,expectedSearchVersion,reason,actor,asOf})` y DecisionV1 exacta de spec; `approvedCandidatesQuery({asOf}):{sql,args}` devuelve candidate_id, decision_id, approval_current, search_version, material_version, decision_revision. Rechazo vigente persiste por relación hasta acción humana; aprobación caduca al cambiar versión material/búsqueda o revocarse.

- [ ] Verificar BUS-12 y EST-09 integrated y las columnas/queries reales; adaptar contrato y registrar diferencias antes de código. Verificar events0029 integrado. BUS-16 conserva historical, no feature Auto ni threshold.
- [ ] Añadir tests `approval_requires_explicit_human_decision`, `legacy_shortlist_and_max_score_do_not_approve`, `approval_needs_meets_current_valid_candidate`, `revoke_defer_or_material_change_removes_permission`, `rejection_remains_until_human_change`, `approval_query_one_head_per_candidate`. Afirmar unknown/alternative/excluded no autorizan, D06 no disponible, versiones/material exactas y ninguna fila email/draft/send.
- [ ] Ejecutar `node --test tests/server/match-decisions.test.mjs` -> RED por export/schema nuevos.
- [ ] Crear migración siguiente libre con tabla append-only/columnas/checks/índices exactos de spec; sin backfill positivo. Implementar validadores y proyección head: última acción humana, aprobación solo si approve y coincide versión, search active y candidato actual/meets. Rejected no se reactiva por score/cambio web; revoke/defer solo por humano habilita revisión, sin aprobar.
- [ ] Ejecutar suite -> PASS; commit `feat: model explicit versioned match decisions`.

## Task 2: Mutación atómica y eventos EST-18

**Interfaces:** POST `/admin/match-candidates/:id/decision` con request/response/error de spec. Produce CAS candidato+DecisionV1+events en un batch; actor/asOf del servidor. GET review devuelve card/search/cursor sin write.

- [ ] Tests `decision_race_has_one_winner_and_no_orphan_event`, `closed_or_changed_search_returns_409_without_writes`, `reject_is_scoped_to_applicant_and_operation`, `decision_event_is_atomic_and_contains_ids_only`, `event_failure_rolls_back_decision_and_revision`, `same_version_retry_conflicts_without_second_event`, `decision_auth_and_same_origin`, `review_get_does_not_touch_activity`. Afirmar401/403,400 enums/motivos,404 inexistente y409 CAS; mismo evento no duplicado tras retry obsoleto.
- [ ] Ejecutar `node --test tests/server/match-decisions.test.mjs tests/server/matches.test.mjs` -> RED de integración nueva.
- [ ] Implementar reviewCandidate con guard atómico revision+search_version+active+materialVersion y rollback completo. Permiso approve solo meets+valid, motivo enum obligatorio rechazo, actor de sesión. Insertar evento `match.decision_recorded` applicant con IDs/versiones/action exactos de spec, sin notificación/email; usar logEvent con guard real o INSERT parametrizado en mismo batch, sin dependencia frágil en last_insert_rowid ajeno.
- [ ] Registrar nuevas rutas en export matchesRoutes antes de patrones genéricos conflictivos; conservar PUT legacy y su409, sin traducir shortlist. Rechazo no actualiza listings.availability, confirmed_at, otros candidates ni search_state. GET cola usa orden búsqueda antigua+ranker integrado y no duplica legacy/canónico.
- [ ] Ejecutar suites -> PASS; confirmar transacción de 2 empleados y cierre concurrente en DB local. Commit `feat: record manual match review with atomic audit events`.

## Task 3: Comparación y acción con teclado segura

**Interfaces:** Consume GET canónico/DecisionV1, muestra BUS-12 checks+sourceRefs. Produce acciones POST exactas y estado visible; no crea objetos outbound. Reutiliza MatchCard/Review en modo legacy separado.

- [ ] Añadir tests/match-review.e2e.cjs: `review_displays_sources_dates_and_reviewed_version`; `approve_button_records_only_initial_enquiry_permission`; `must_unknown_approve_disabled`; `reject_reason_required`; `shortcut_ignored_in_form_or_dialog`; `late_response_does_not_replace_next_match`; `logout_prevents_data_repopulation`; `stale_409_requires_reload`; `legacy_undo_does_not_approve`. Comprobar DB real y ausencia de correos/PII, sin interceptar feliz camino como prueba dominio.
- [ ] Ejecutar `E2E_SCRIPT=tests/match-review.e2e.cjs npm run test:e2e` -> RED específico, host sin otro e2e.
- [ ] Modificar Review/MatchCard/ApplicantDetail comparación Requirement/Search/Property/Evidence, copy y botones exactos spec, estado pending/meets/alternative/excluded por texto, fuentes con fecha y http(s)validado. Acción A solo si botón visible habilitado y target seguro; R motivo1–5, Skip solo navegación, Escape cancela sin decidir. No botones Auto, lote ni Ask to confirm details. Mostrar aprobación y legacy shortlist por separado.
- [ ] Añadir generación/cancelación por card/filtros/desmontaje/401, busy y focus restaurado, errores400/409 con reload explícito y retry GET; no repost automático. Copiar valores CSS GlobalConstraints, objetivos32/44px, reflow760, live único por error. Loading/vacío conservan navegación y no afirman aprobación.
- [ ] Ejecutar e2e focal -> PASS; comprobar1280/390, teclado, foco, zoom200%, contraste, reduced motion y sin ningún envío. Commit `feat: expose explicit initial enquiry review actions`.

## Task 4: Contratos consumidores y validación

**Interfaces:** EST-13 consume approvedCandidatesQuery y AGE-03 debe releer aprobación en su propia transacción. No implementar transporte consumidor ni condición cliente interesado.

- [ ] Añadir test de contrato `approved_candidates_consumer_reads_current_permission` con aprobar/cambiar/revocar, búsqueda resuelta y dos clientes misma propiedad; query de permiso no devuelve PII y GET no actualiza nada. Vincular rechazo histórico sin promover Shortlisted.
- [ ] Ejecutar `node --test tests/server/match-decisions.test.mjs tests/server/matches.test.mjs tests/server/search-lifecycle.test.mjs tests/server/listing-events.test.mjs` -> PASS. Events listing actual permanece sin cambios; purga ficticia archivos no borra eventos de decisión.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release`, `npm run test:e2e` y e2e focal; Playwright MCP local1280/390/zoom200% con todos estados y consola/red. Registrar limitaciones reales sin PASS inventado.
- [ ] Revisión independiente, corregir y verificar afectados. Actualizar BUS-15 real y referencias BUS-16 replanteado/EST-18 solo productor, no cerrar todo EST-18 ni EST-13. Commit concreto y relevo; migración/publicación solo tras autorización.

## Autorrevisión actual

B15-1/2, B16-1 -> Task 1/3;B15-3/4, E18-1/2 -> Task 2/4;B15-5 ->3. Contratos BUS-12 y EST-13 cotejados sin ciclo; eventos applicant evitan migración CHECK duplicada. Solo spec/plan/ledger hoy; no pruebas de producto, servicios, commit ni migración ejecutados. Skills y decisiones pendientes constan en spec.
