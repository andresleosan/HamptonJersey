# Lista 1 editorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Solo planificar ahora, sin ejecución de producto ni agentes nuevos.

**Goal:** Completar Ready for review y Let agreed/Let sin mezclar estado editorial, disponibilidad y contrato de alquiler.

**Architecture:** Marcadores de revisión sobre listings y proyección editorial; estados comerciales de alquiler mediante ruta manual con evidencia/CAS. Reutilizar eventos y ventas actuales con migración preservadora de datos.

**Tech Stack:** ESM/JSDoc, D1/Pages, React, node:test existentes.

**Spec:** `docs/superpowers/specs/2026-11-08-l1-editorial-design.md`.

## Global Constraints

- EST-17 parcial sin deps declaradas; no inventar dependencia de catálogo para Ready/manual. Futuro inventario/comercial EST-15/16 y tenancy automática quedan integraciones separadas por verificar.
- Ready for review es editorial, nunca availability. Let/Let agreed son hechos manuales con evidencia, sin crear contratos, ventas, cobros ni resolver search_state.
- Permisos actuales admins, sin aprobador especial; publicación directa actual sigue; Drive review solo se aprueba en queue. Archive conserva bloqueos de oferta/sale.
- Mantener lossless offers/sales/availability legacy; lease no se traduce a Let. ADM-04 To confirm sigue +1mesrent/+3mesresto, separado D02 disponibilidad compartida48 h/7 días.
- EST-18 publicado: añadir solo campos/productores, cero reconstrucción o nueva vista; idempotencia de nueva ruta comercial específica, no genérica al panel.
- CSSpanel vigente ink#141414/paper#fff/mist#f2efe9/line#e2ddd4/stone#6b665e/bronze#8a6a3b/ok#1f6b3a/err#a32020; Montserrat14/1.5, Tenor Sans H1 26/400; card14/padding24, input10/#fbfaf8, botón999/10px20px, small6px14px11px, gaps8–16, tabla10px12px, corte760, foco2px/offset2, disabled.45. Web#151515/#f4f3f0/#a56b3d, pill999; no adoptar paleta única propuesta DESIGN.
- Copy inglés, labels/error asociados/role statusalert, teclado/1280/390/zoom 200%/reduced-motion, fotos miniaturas 4:3, no librerías/fuentes nuevas, no toast/emoji/HTML sin escapar/PII en localStorage.

## Review Focus

1. Otra persona edita una ficha ready antes de publicar: CAS409, sin publicar una versión antigua (Task 1).
2. Ready intenta saltar aprobación Drive o archive con oferta abierta: bloqueos siguen vigentes (Task 1).
3. Cambiar operation o enviar let* mediante PUT/import evita evidencia: todos los writers lo rechazan o envían a revisión real (Task 2).
4. Reconstruir CHECK availability elimina trigger/FK/columna o altera un sale histórico: migración preserva todo y foreign_key_check limpio (Task 2).
5. Timeout/retry comercial y ready sin foto en móvil: recibo único, mensajes honestos y foco/overflow correctos (Tasks 2–3).

## File map

Modificar `server/listing.js`, `server/routes/listings.js`, `server/listing-events.js`, `server/routes/queue.js`, `server/listing-import.js`, `server/match-store.js`, `admin/src/format.js`, `admin/src/Listings.jsx`, `admin/src/listing-filters.js`, `admin/src/ListingEditor.jsx`, `admin/src/styles.css`, `site/index.html` (mapeo de clases de pill), pruebas existentes de listing/events/queue/sales según afecte. Crear `server/listing-editorial.js` (transiciones), `admin/src/ListingReview.jsx` (acciones revisión), `admin/src/RentalMarketing.jsx` (formulario acreditado), `tests/server/listing-editorial.test.mjs`, `tests/server/rental-marketing.test.mjs`, `tests/listing-editorial.e2e.cjs`. Migración lógica futura `l1_listing_editorial`: prefijo secuencial libre se asigna al construir contra main, no crear un003x especulativo. Guarda review fields, CHECK ampliado y triggers actualizados, evidencia relacionada específica de marketing.

### Task 1: Circuito Ready for review y eventos editoriales

**Files:** crear `server/listing-editorial.js`, `tests/server/listing-editorial.test.mjs`; modificar `server/routes/listings.js`, `server/listing-events.js`, `server/routes/queue.js`, `admin/src/format.js`; parte editorial de migración lógica `l1_listing_editorial`.

**Interfaces:** `editorialState(listing):'draft'|'ready_for_review'|'published'|'archived'` shared en server/listing-editorial.js o reexportado por format; `transitionEditorialListing(env,{id,command:EditorialCommand,actor}):Promise<EditorialReceipt>`; consumir listingBatch/listingEventStatements/listingClock vigentes y loadListing. EditorialCommand/Receipt exactos en spec. Nueva POST `/api/admin/listings/:id/review` actions submit_review|return_draft; publish/unpublish/archive/restore existentes incorporan updated_at CAS sin cambiar su significado.

- [ ] RED `ready_is_hidden_and_keeps_commercial_state`, `ready_can_return_to_draft`, `publish_ready_clears_markers`, `editing_ready_preserves_review_with_new_version`, `stale_publish_409`, `drive_review_cannot_be_bypassed`, `archive_busy_still_blocks`, `restore_does_not_reopen_review_or_availability`, `failed_event_rolls_back`.
- [ ] Ejecutar `node --test tests/server/listing-editorial.test.mjs`; esperar FAIL por campos/exports nuevos.
- [ ] Añadir review_requested_at/by y constraint de par/estado, snapshots trigger EST-18 y actions review_requested/review_returned. Implementar transiciones CAS actual+evento con actor servidor; publicar limpia markers, misma validación queue y published_at actual; unpublish/archive/restore limpian. No actualizar confirmed_at por submit/return ni tocar matchable/availability.
- [ ] GREEN repetir tests y suite listing-events relevante; comparar revisión de evento y no-op/retry. Auth401/origin403/missing404/invalid400/stale409; dos empleados no publican versión vieja. Mantener panel sin idempotencia genérica nueva.
- [ ] Revisar diff y commit futuro de Task 1; sin ejecutar git add/commit en este encargo documental.

### Task 2: Marketing de alquiler con evidencia y preservación legacy

**Files:** modificar `server/listing-editorial.js`, `server/listing.js`, `server/routes/listings.js`, `server/listing-events.js`, `server/listing-import.js`, `server/routes/queue.js`, `server/match-store.js`; crear `tests/server/rental-marketing.test.mjs`; parte availability/evidencia de migración `l1_listing_editorial`.

**Interfaces:** `recordRentalMarketingState(env,{id,command:RentalMarketingCommand,actor}):Promise<RentalMarketingReceipt>`; `validateRentalMarketingTransition(listing,command):{patch}|{errors}`; usar updateListingEvent y operationId=request_id interno de esta ruta. Extender helper interno con `additionalStatements:D1PreparedStatement[]=[]` en su argumento; posicionar los statements tras el update/evento y antes de recibo/cleanup, guardados por contexto de esta ejecución/revision>previous_revision, sin ejecutarlos en replay. Callers actuales pasan default vacío y HTTP jamás recibe SQL. POST `/api/admin/listings/:id/rental-marketing` protegido; command exacto en spec. Evidencias registradas por FK validada y event_id, no strings arbitrarios en related de listing-events. Propiedad de evidencia se comprueba antes y dentro de la transacción.

- [ ] RED `rent_let_agreed_then_let_has_evidence_and_actor`, `direct_let_requires_real_completed_evidence`, `sale_rejects_rental_route`, `generic_put_and_import_cannot_forge_let_confirmation`, `operation_change_cannot_leave_incompatible_let`, `old_lease_and_under_offer_remain_lossless`, `request_replay_returns_same_event`, `request_payload_conflict_409`, `marketing_evidence_failure_rolls_back_listing_and_event`, `replay_does_not_duplicate_evidence_links`, `sales_cycle_unchanged`, `new_states_are_not_match_candidates`, `no_tenancy_or_search_resolution_side_effect`.
- [ ] Ejecutar `node --test tests/server/rental-marketing.test.mjs`; esperar FAIL por ruta/nuevos enums.
- [ ] Reconstruir CHECK listings con let_agreed/let preservando todas las columnas/valores/índices/triggers/FKs vigentes, comparar counts/IDs y ejecutar foreign_key_check en migración local. Mantener los triggers añadidos Task 1. Ninguna traducción automática de datos comerciales históricos.
- [ ] Implementar ruta manual con fecha/motivo/evidencia y CAS, fuentes/action actuales de listing-events, recibos internos idempotentes y vínculo evidencia-evento tipado. Revalidar operation=rent y estado dentro de batch. Generic PUT hacia/desde let* devuelve error orientando a acción; create/import/queue no pueden producir confirmación sin evidencia. No inventar tabla de tenancy ni llaves relacionadas no admitidas por helper.
- [ ] Mantener mapping existente de sales pending/countered/accepted/rejected/withdrawn e in_progress/completed/fallen_through y transiciones for_sale/under_offer/sold; `currentSales` es concepto, no nuevo export. Actualizar pública STATUS y panel AVAILABILITY para let*; filtrar propuestas como under_offer/sold sin borrar historial ni declarar baja en inventario aún no integrado.
- [ ] GREEN repetir pruebas nuevas y tests vigentes de sales/listing-events/queue; invalid evidence400/403/404 y rollback en fallo de evento o evidencia. Preservar search_state y rentals/tenancies exactamente.
- [ ] Revisar diff y commit futuro; documentar integración inventory availability no incluida, sin afirmar propagación global.

### Task 3: Filtros, formularios y aceptación visible

**Files:** crear `admin/src/ListingReview.jsx`, `admin/src/RentalMarketing.jsx`, `tests/listing-editorial.e2e.cjs`; modificar `admin/src/Listings.jsx`, `admin/src/listing-filters.js`, `admin/src/ListingEditor.jsx`, `admin/src/format.js`, `admin/src/styles.css`, `site/index.html` solo clasespill.

**Interfaces:** `ListingReview({listing,onTransition,onReload})`, `RentalMarketing({listing,onSubmit,onReload})`; callbacks usan comandos/recibos Tasks 1–2 y updated_at cargado; no set local de estado antes de recibo. stateOf delegado a editorialState; filtros Ready muestran contador y queryestado sin incluir published.

- [ ] RED e2e futuro draft→ready no visible en web; ready→published visible si foto pública; ready sin foto mensaje honesto actual. Filtro ready, retorno draft, editar y otra persona publica409; let_agreed/let aparecen iguales panel/web y no crean tenancy/cierre búsqueda. Sesión expirada y error conservan formulario.
- [ ] Ejecutar `node tests/listing-editorial.e2e.cjs` según harness vigente; esperar FAIL del flujo nuevo.
- [ ] Implementar segmentos y acciones, formularios evidencia/fecha/motivo, estados disabled/loading/error/empty con copy de la spec, accesibilidad y CSS de restricciones. Badges editoriales separados de availability. Web let reutiliza sold pill y let_agreed offer pill; no adaptar las fotos/fuentes o navegación fuera del flujo.
- [ ] GREEN tests focales y e2e; Playwright local1280/390, zoom 200%, teclado, foco primer error/cancelación, barras sin tapar controles, consola/red y sin fotos originales en lista. Confirmar No listings are ready for review y filtros sin coincidencias distinguidos.
- [ ] Ejecutar futuro `npm test`, `npm run build`, `npm run check:release` y e2e general según repositorio. Registrar fallos/bloqueos reales, revisión independiente y commit futuro con catálogo/ESTADO por dueño global. No subir sin autorización específica.

## Self-review

EST-17 Ready Task 1+3; Let/Let agreed Task 2+3; EST-18 Tasks 1–2. Cinco focos tienen pruebas futuras. Todos writers enumerados y perímetro de evidencia explícito; CSS vigente separado de propuestas DESIGN. No actividad de producto ejecutada, ni política legal/financiera nueva; los permisos y las tablas legacy se preservan.
