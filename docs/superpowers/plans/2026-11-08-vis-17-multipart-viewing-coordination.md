# VIS-17 · Visitas multiparte con franjas compatibles y confirmaciones separadas Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task cuando se encargue construir. Steps use checkbox (`- [ ]`) syntax. Esta sesión entrega solo planificación.

**Goal:** Coordinar una cita con propiedad, búsqueda y aceptaciones separadas sin cerrar la búsqueda.

**Architecture:** Extender viewing_requests con contexto/propuestas/aceptaciones y mantener identidad y anticolisiones existentes.

**Tech Stack:** JavaScript/React/Workers/D1 y servicios actuales. Sin dependencias nuevas por defecto; pruebas node:test y D1 local donde hay transacciones. Google solo VIS-12; audio local futuro solo VIS-15.

**Spec:** [Diseño](../specs/2026-11-08-viewings-coordination-design.md), [índice](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** REG-17, AGE-12, AGE-06, EST-13 integrados; BUS-10/EST-16/15, VIS-09/10 y NOT-11; calendario VIS-12 opcional por conexión.

**Readiness:** defined. Integrar dependencias, verificar criterios del plan y registrar activación por separado. Diseño definido no significa dependencia integrada, permiso build o activación.

## Global Constraints

- Solo planificación. Construir en sesión autorizada con main verificado, evidencia y reserva build; no reservar por redactar. No cuenta, envío, inferencia, migración, servicio o publicación activados aquí. Reconciliar nombres propuestos con dependencias integradas y elegir ordinal libre al construir.
- Decisiones vigentes: mascotas imprescindibles si las hay, parking flexible salvo MUST explícito; disponibilidad general hasta nueva información con fecha visible, revisión21d y repetición7d tras cierre, presentación con revisión extra, enlace hasta revocación, purga6meses solo fotos/derivados. Búsqueda sigue activa hasta resolución humana. Google primero/Outlook después; visitas30min/margen15/extra15 entre parroquias/máximo8 por día y negociador. Informes a propietarios fuera.
- Meta publicación/mensajes, WhatsApp, Places/Properties y servidores/modelos locales no forman parte del lanzamiento vigente. VIS-15 es diseño de fase posterior. Hermes central no da permiso automático para C2/C3; acuerdos los gestiona Hermes según instrucciones previas. No IA para resumen diario ni fallback a proveedor no autorizado.
- Reutilizar viewing_requests, slots/guardias actuales, EST-18, NOT-01/11 y AUT-17/reloj10min; sin segunda agenda, Inbox, inventario o motor de matching. Cambios comparten recursos: integrar por servicio dueño y no25 escritores simultáneos. Legacy conserva IDs, datos y permisos, sin inventar aceptaciones, fechas o hechos.
- DESIGN.md Colors/paleta vigente y Typography/Layout/Components: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d foco/decoración, bronze-dk#86542d texto pequeño/fondo, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. Tenor26/19px peso400, Montserrat14px/1.5 y label12; wrap1240, página24px16px120px, card24/r14, inputr10, botón10px20px/r999 y gaps8/12/16/24. Reflujo760, Inbox820/lista240–340. Web15px/1.65, inputs16, campos13px14px/r12, botones13px28px.
- Texto inglés; status/alert con texto, tabs ARIA/flechas/Home/End, foco2px/offset2, contraste4.5texto/3control, teclado/zoom200/reduced-motion;44px móvil propuesto y32 escritorio. Sin fuentes/librerías/estética nuevas, thumbnails con tamaño/aspect-ratio, lazy fuera del primer viewport. Listas50/historial50; Inbox200 heredado; JSON128KiB y poll30s solo visible. Audio tiene límite binario25MiB futuro, no JSON fingido.
- Sesión staff/actor servidor/same-origin y clientScope separado AGE-12; SQLparametrizado/enums cerrados, React texto/esc/textContent/safeHref, no HTML libre. PII/notas/códigos/tokens fuera de URL/storage/logs/Telegram. Privado no-store; GET/prefetch sin mutaciones de cliente. Eventos metadata/ref, no cuerpo de notas/audio. Retención personal PRE-12, no conservación eterna por tener historial.
- Avanzar y writing-plans fijan evidencia/interfaces; ponytail reutiliza dominios; seguridad servidor/frontend aplica permisos/validación; impeccable/antislop mantienen flujo/copy sin adornos; web-performance acota queries/stream. Taste/redesign no requieren restyle. Pruebas del dueño, D1 real para concurrencia, no tests espejo de documentación.

## Review Focus

1. legacy_ids_and_holds_preserved; external_property_no_fake_listing; mixed_operation_denied; ambiguous_legacy_link_pending; unknown_hours_not_free
2. last_two_acceptances_one_confirm; client_cannot_accept_for_agency; stale_proposal_409; property_unavailable_before_commit; same_response_no_double_event; unknown_party_pending
3. selected_viewing_deeplink; missing_confirmations_visible; manual_evidence_required; no_commission_gate; client_grant_wrong_episode_denied; keyboard_conflict
4. Borrado/revocación mientras corre una operación impide commit o callback tardío y no restaura datos.
5. Operación o participante incorrecto/versiones obsoletas no heredan permisos, tareas o aceptaciones de otro caso.

## Tarea 1 · Contexto y propuestas conservando IDs

**Files:** Create server/viewing-coordination.js y migración viewing_context/viewing_proposals/viewing_acceptances; Test tests/server/viewing-context.test.mjs.

**Interfaces:** proposeViewing(env,{viewing_id,expected_revision,context,slot,required_participants},actor)->{viewing_id,revision,coordination_state,missing_participants,calendar_state}.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: legacy_ids_and_holds_preserved; external_property_no_fake_listing; mixed_operation_denied; ambiguous_legacy_link_pending; unknown_hours_not_free. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-context.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Contexto uno a uno, vínculo explícito de búsqueda/episodio/consulta, participantes tipados y fecha UTC+Jersey. No asignar por email cuando varias búsquedas son posibles.
- [ ] Ejecutar `node --test tests/server/viewing-context.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 2 · Aceptaciones y commit atómico

**Files:** Modify server/viewing-coordination.js, server/viewing-store.js; Create tests/server/viewing-acceptances.test.mjs.

**Interfaces:** acceptViewingProposal(env,{proposal_id,proposal_revision,participant_key,response,evidence_ref},actor); commitViewingProposal(env,{proposal_id,proposal_revision},actor).

- [ ] Escribir o ajustar pruebas focales con estas aserciones: last_two_acceptances_one_confirm; client_cannot_accept_for_agency; stale_proposal_409; property_unavailable_before_commit; same_response_no_double_event; unknown_party_pending. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-acceptances.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Registrar aceptación por participante/versión. Confirmar únicamente con todas las exigibles y política actual. Guardar cambio/evento/tarea en batch componible; mantener reserva provisional del recurso interno seleccionado.
- [ ] Ejecutar `node --test tests/server/viewing-acceptances.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 3 · Reprogramación y cancelación por alcance

**Files:** Modify server/viewing-coordination.js, server/property-unavailability.js; Create tests/server/viewing-reschedule.test.mjs.

**Interfaces:** cancelCoordinatedViewing(env,{viewing_id,expected_revision,reason,evidence_ref},actor); reemplazo de propuesta activa conserva vieja cita hasta commit.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: old_slot_until_new_accepted; cancel_races_accept; last_stale_response_no_restore; other_operation_survives; only_one_replacement; search_still_active. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-reschedule.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Invalidar aceptaciones por nueva revisión; mover recursos de forma atómica, actualizar tareas/outbox y tombstones. No cancelar toda la propiedad por declinar un cliente.
- [ ] Ejecutar `node --test tests/server/viewing-reschedule.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 4 · Rutas y panel de coordinación

**Files:** Create server/routes/viewing-coordination.js, admin/src/ViewingCoordination.jsx; Modify server/api.js, admin/src/Viewings.jsx, admin/src/ApplicantDetail.jsx; Test tests/server/viewing-coordination-routes.test.mjs.

**Interfaces:** POST /admin/viewings/:id/proposals, /admin/viewings/:id/proposals/:pid/responses y /commit usan firmas anteriores; clientScope por AGE-12 limita participante propio.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: selected_viewing_deeplink; missing_confirmations_visible; manual_evidence_required; no_commission_gate; client_grant_wrong_episode_denied; keyboard_conflict. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-coordination-routes.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Incorporar horarios/contactos/instrucciones privados y acciones reales. Reservas propias por teléfono registran evidencia de partes, sin confirmar terceros implícitamente.
- [ ] Ejecutar `node --test tests/server/viewing-coordination-routes.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 5 · Acceso limitado a visita sin presentación previa

**Files:** Create server/private-access.js y server/viewing-access.js; Modify server/presentation-access.js para extraer helper compatible AGE-12 y migración de grants/sesiones discriminados; Test tests/server/viewing-access.test.mjs.

**Interfaces:** createViewingGrant(env,{viewing_id,participant_key,proposal_revision,parent_presentation_grant_id?},actor); resolveViewingScope(env,session)->{viewing_id,participant_key,proposal_revision}. Audience viewing distinta de presentation, sin IDs de presentación o búsqueda ficticios.

- [ ] Escribir pruebas audience_viewing_cannot_read_matches, presentation_cookie_not_viewing_authority, legacy_without_applicant_supported, known_id_not_identity, wrong_participant_denied, revoked_parent_denies_child, old_revision_cannot_accept, same_link_redeem_until_revoked y dormant_until_actual_delivery.
- [ ] Ejecutar `node --test tests/server/viewing-access.test.mjs` y comprobar fallo por contrato nuevo ausente; conservar las regresiones existentes AGE-12.
- [ ] Reutilizar mecanismo de tokens256bits/huella/canjePOST/cookieHttpOnlySecureSameSite/no-store/sesiónmáximo7días. Crear grant limitado tras verificación de destinatario/evidencia; activarlo tras envío o entrega manual acreditados. Grant sin presentación no permite ver opciones de inmueble no presentadas ni matches.
- [ ] Ejecutar `node --test tests/server/viewing-access.test.mjs` hasta PASS y regresiones de presentación, revocación, borrado y propuestas concurrentes.
- [ ] Revisar diff y guardar unidad acotada con archivos concretos. La extracción compartida se integra con dueño AGE-12 antes de construir consumidores VIS-04/13; ningún cambio de código se realiza en esta planificación.

## Cierre futuro

- [ ] Revisar cobertura del diseño/contratos, migración poblada con FK activas si la hay y Review Focus completo. Si falta productor o dependencia real, registrar el tramo pendiente sin completar por mocks.
- [ ] Para cambios de código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. Si cambia UI: e2e del proyecto y Playwright1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. No repetir producto para documentos puros.
- [ ] Registrar construido/integrado/verificado/activado por separado en ledger de la tarea, checklist y ESTADO cuando se construya. Revisión independiente futura; publicación/migración/activación solo bajo autorizaciones de esa sesión. Ninguna casilla está ejecutada ahora.
