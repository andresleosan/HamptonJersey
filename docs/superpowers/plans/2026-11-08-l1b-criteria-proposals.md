# AUT-19 · Propuestas de criterios y confirmación versionada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta entrega solo redacta documentos; no ejecutar ahora.

**Goal:** AUT-19 · Propuestas de criterios y confirmación versionada.

**Architecture:** Ampliación de los módulos existentes con contratos explícitos y guardas dentro de la transacción. Las dependencias propuestas requieren prueba real antes de integrarse.

**Tech Stack:** JavaScript ES modules, React19, Cloudflare Pages/Workers, D1/SQLite y pruebas Node/e2e existentes.

**Spec:** [diseño](../specs/2026-11-08-l1b-criteria-proposals-design.md).

## Global Constraints

Base `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1`; solo documentos ahora. Construir exige revisión de alcance/diseño, dependencias y reserva build. Publicación/migración se autorizan aparte. No modificar el catálogo por terminar el plan.

**UI comprobada en código, frente a la cabecera desfasada de DESIGN.md:** `admin/src/styles.css`: ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#6b665e`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, warn-bg `#fff6e5`, field-line `#8f8a82`. Tenor Sans/Georgia H1 26px/H2 19px, peso400; Montserrat/system-ui 14px/1.5, labels12px. Page1240px y padding24px16px120px; card24px/radio14px, field9px12px/radio10px, botones10px20px/radio999px. Reusar `.card/.field/.btn/.warn/.actionbar/.badge`, gaps12/16/24px, editor280px y apilado900px; piezas nuevas apilan760px. Botón hover bronze-dk, disabled opacity.45; foco2px bronze/offset2px y, si contraste medido lo exige, bronze-dk en el control tocado. Contraste texto≥4.5:1, foco/bordes≥3:1; estados con texto, labels nativos, aria-invalid/describedby y status/alert. Controles32px escritorio/44px móvil, teclado, 1280/390 y zoom200%, reduced motion. Copy/API inglés. ENERGY1/RHYTHM1/MOTION1; sin fuentes, imágenes, librerías o animaciones nuevas. React escapa texto; URLs por helpers existentes; sin PII/tokens en storage, URL, analytics o logs. No polling de ficha completa ni N+1; las solicitudes tardías no sobrescriben formularios.

## Review Focus

- Campos no mencionados y prioridad parcial: preservar parking/mascotas/unknown, Task1.
- Guard de0filas/fallo de evento: rollback de datos/tareas/recibo, Task2.
- Replay después de versión nueva o borrado: recibo seguro sin reescritura, Task2.
- Recálculo caído o lease vencida: tarea recuperable, éxito solo del ticket actual, Task3.
- Modelo apagado, cierre y expiración: ningún audio ni cambio silencioso, Tasks1/4.

## Task1: Patch explícito y propuestas privadas

**Files:** crear `server/criteria-proposals.js`, `server/routes/criteria-proposals.js`, `tests/server/criteria-proposals.test.mjs`; modificar `server/api.js`, `server/applicants.js` solo para reutilizar criteriaDiff del planSAP10. Migración siguiente `migrations/NNNN_criteria_proposals.sql`, número asignado al construir.

**Interfaces:** produce DTO/validateCriteriaPatch/create/revise/discard del spec; consume validateApplicant actual y criterios SAP10 integrado. Ningún proveedor de IA.

- [ ] Verificar dependencias reales y registrar revisión de alcance por tramo; cotejar SAP10/EST01/BUS12/NOT11 antes de claimbuild. No iniciar producto por existir el plan.
- [ ] Añadir casos `proposal_does_not_save`, `patch_keeps_unmentioned_musts`, `partial_priority_patch_keeps_unknown`, `clear_requires_explicit_null`, `forbidden_fields_are_rejected`, `proposal_wrong_applicant_is_404`, `proposal_expires_at_24h`, `proposal_edit_increments_revision`. Afirmar applicant/version/matches sin cambios y errores400/404/410 exactos.
- [ ] Ejecutar `node --test tests/server/criteria-proposals.test.mjs` → RED por módulo/tabla nueva.
- [ ] Implementar migración y funciones/rutas privadas del spec; límite16KiB/40campos, actor servidor, TTL24h, validación de merge, no audio/prompt en DB. Revisar GET no-store y sameOriginPOST.
- [ ] Ejecutar suite → PASS; comprobar migración local poblada y que no altera contactos/propuestas antiguas. Commit futuro `feat: prepare explicit criteria proposals for review`.

## Task2: Confirmar por el mismo comando de criterios

**Files:** crear `server/applicant-criteria.js`, `tests/server/criteria-confirmation.test.mjs`; modificar `server/routes/applicants.js`, `server/criteria-proposals.js`; integrar sentencias de NOT11 y events existentes sin nueva bandeja.

**Interfaces:** commitApplicantCriteria/confirmCriteriaProposal y ConfirmationReceiptV1 del spec. El PUT conserva su respuesta y validación SAP10.

- [ ] Añadir casos `confirmation_requires_acknowledgement`, `confirmation_changes_only_reviewed_fields`, `concurrent_proposals_one_wins`, `replay_same_key_returns_same_receipt`, `same_key_new_hash_is_409`, `delete_does_not_replay_personal_receipt`, `manual_put_keeps_operation_contract`, `stale_or_closed_search_writes_nothing`, `event_or_task_failure_rolls_back_all`, `new_diff_requires_new_confirmation`. Afirmar un evento, un recibo, un cambio y una admisión; fallo DB produce0 de todos.
- [ ] Ejecutar `node --test tests/server/criteria-confirmation.test.mjs tests/server/applicants.test.mjs` → RED específico.
- [ ] Extraer batch de criterios desde update existente, preservando LOCK versión monotónica/fechas/contacttouch/errores; componer guardas de applicant+proposal+receipt en misma transacción. No duplicar validateApplicant/criteriaDiff, ni usar saveVersioned sin guard de asociación/propuesta.
- [ ] Integrar evento mínimo y tarea con statements reales NOT11. Si cambia firma upstream, adaptar aquí y en spec antes de seguir; no cambiar la garantía a «best effort».
- [ ] Ejecutar suites → PASS y regresión PUT manual/concurrente. Commit futuro `feat: confirm criteria proposals with atomic receipts`.

## Task3: Admisión durable al recálculo existente

**Files:** crear `server/criteria-recompute.js`, `tests/server/criteria-recompute.test.mjs`; modificar `server/match-store.js`, `server/jobs.js` y productor EST01/SAP01 integrado, sin duplicar tablas de progreso.

**Interfaces:** criteriaRecomputeRequestStatements/runCriteriaRecomputeRequests del spec; ticket EST01 con request_id/claim_token/ticket_seq y guard de lease vigente en writes/finish, evaluación BUS12 real y criteriaRecomputeSuccessStatement del spec en su mismo batch final.

- [ ] Añadir `commit_survives_process_death_before_recompute`, `two_ticks_claim_once`, `expired_claim_cannot_publish`, `crash_after_matching_commit_before_worker_ack`, `new_search_version_supersedes_request`, `failed_check_keeps_last_success`, `retry_uses_same_request_without_duplicate_notices`, `deleted_applicant_cascades_requests`. Afirmar UNIQUE(applicant,version), uno o ningún éxito vigente y sin reescritura de criterios.
- [ ] Ejecutar `node --test tests/server/criteria-recompute.test.mjs` → RED.
- [ ] Implementar cola de admisión con claimCAS120s/renovación60s/limit10/3intentos. Consumir evaluador existente y guard extendido de ticket; persistir ticket_seq al iniciar y request.succeeded dentro del batch de resultados antes de full-check-success final. Una caída tras commit antes de ack no crea nuevo ticket al reintentar. No afterSave paralelo. Añadir pasada al reloj ya existente, sin otro cron/servicio; progreso sigue EST01.
- [ ] Implementar recuperación/retry autenticado de la misma request fallida; cierre/versión nueva superseded; logs con códigos fijos sin criterios. Ejecutar suites de matching y search-progress afectadas → PASS.
- [ ] Registrar prueba de crash, lease, CAS/evento y queryplan con índices. Commit futuro `feat: recover versioned criteria match checks`.

## Task4: Revisión antes/después en la ficha

**Files:** crear `admin/src/CriteriaProposal.jsx`, `tests/criteria-proposals.e2e.cjs`; modificar `admin/src/ApplicantDetail.jsx`, `admin/src/styles.css` solo clases necesarias.

**Interfaces:** consume rutas privadas y recibo, muestra progreso EST01 en vez de inventar éxito. No captura voz hasta gate separado.

- [ ] Añadir casos UI CP01–CP10: antes/después por campo, aviso de conservación de campos no citados, checkbox de confirmación asociado a revision, corregir/descartar,409 recarga conservando borrador,401, caducidad, fallo de recálculo y doble click. No marcar confirmado con una selección previa a editar.
- [ ] Implementar panelinline dentro de Criteria, foco al encabezado/dato inválido y status de guardado separado del de recálculo. Sin modal obligatorio, toasts o polling que sobrescriba formulario.
- [ ] Ejecutar `E2E_SCRIPT=tests/criteria-proposals.e2e.cjs npm run test:e2e` → PASS en fixture con productores reales; los mocks solo prueban consumidor y se registran como tales.
- [ ] Revisar1280/390 y zoom200%, teclas/tablabels/foco/conflicto/consola/red. No botón que prometa dictado activo ni usar SpeechRecognition del navegador.

## Autorrevisión

CP01/02/09→Tasks1/4; CP03/04/05/10→2; CP06/07→3; CP08→1/4. Firmas y versiones cotejadas; fuente manual y extracción no saltan la misma confirmación. El puerto voz no está implementado ni definido como proveedor real: AUT19 íntegro condicionado.

## Entrega futura

- [ ] Ejecutar las suites focales, `npm test`, `npm run build`, `npm run check:release` y e2e relevante en fixture local, sin tocar producción. Registrar PASS/FAIL real.
- [ ] Para cambios UI, Playwright MCP local1280/390: camino correcto, vacíos, error, permisos, conflicto, teclado/foco/zoom200%, consola/red; corregir hallazgos y repetir solo pruebas afectadas. Para unidad sin UI, registrar no aplica.
- [ ] Revisión independiente; actualizar estado por tramo con evidencia, ledger y relevo privado. Preparar commit con rutas explícitas y SHA revisable, sin publicar ni migrar por inferencia.

Skills y alcance aprobable se detallan en el spec. Las casillas abiertas son trabajo futuro: no constituyen pruebas ejecutadas.
