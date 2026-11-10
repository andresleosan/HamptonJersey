# VIS-12 · La cita en el Google o Outlook Calendar del negociador e invitación al aplicante Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task cuando se encargue construir. Steps use checkbox (`- [ ]`) syntax. Esta sesión entrega solo planificación.

**Goal:** Conectar primero Google Calendar con ocupaciones y eventos de visita verificables.

**Architecture:** Adaptador Google servidor y outbox por visita/revisión; el estado de sincronización externo se separa de aceptaciones locales.

**Tech Stack:** JavaScript/React/Workers/D1 y servicios actuales. Sin dependencias nuevas por defecto; pruebas node:test y D1 local donde hay transacciones. Google solo VIS-12; audio local futuro solo VIS-15.

**Spec:** [Diseño](../specs/2026-11-08-viewings-coordination-design.md), [índice](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** VIS-17/09/10, AUT-11 para avisos según propósito; cuentas/calendarios autorizados, OAuth y tratamiento verificados antes de activar; Outlook después.

**Readiness:** conditional. Adaptador Google definido; cierre real exige cuenta autorizada, permisos, verificación del tratamiento y sincronización/invitación comprobadas. Diseño definido no significa dependencia integrada, permiso build o activación.

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

1. state_once_session_bound; redirect_fixed; wrong_negotiator_denied; refresh_token_not_returned; revoke_stops_dispatch; scopes_recorded
2. freebusy_timeout_pending; busy_slot_denied; no_title_persisted; dst_utc_offsets; >100_incomplete_not_free; new_google_conflict_task
3. oauth_denied_fallback; external_change_new_proposal; no_private_notes_in_event; invited_client_only; disconnect_pending
4. Borrado/revocación mientras corre una operación impide commit o callback tardío y no restaura datos.
5. Operación o participante incorrecto/versiones obsoletas no heredan permisos, tareas o aceptaciones de otro caso.

## Tarea 1 · Conexión Google y autorización acotada

**Files:** Create server/calendar-google.js, server/routes/calendar-connections.js y migración calendar_connections; Test tests/server/calendar-connections.test.mjs.

**Interfaces:** getBusy(connection,{from,to,signal})->{intervals,checked_at,state}; conexión ligada a negotiator_id/owner y calendarios seleccionados.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: state_once_session_bound; redirect_fixed; wrong_negotiator_denied; refresh_token_not_returned; revoke_stops_dispatch; scopes_recorded. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/calendar-connections.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] OAuth servidor y secretos cifrados con clave administrada fuera D1; scopes mínimos concretos y habilitación documental. No instalar proveedor ni acceder a cuentas ahora.
- [ ] Ejecutar `node --test tests/server/calendar-connections.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 2 · Ocupación y confirmación con incertidumbre

**Files:** Modify server/viewing-policy.js, server/viewing-coordination.js; Create tests/server/calendar-busy.test.mjs.

**Interfaces:** getBusy ventanas<=14d, snapshot<=30s al confirmar, timeout10s; intervalos solamente, máximo100 antes de incomplete.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: freebusy_timeout_pending; busy_slot_denied; no_title_persisted; dst_utc_offsets; >100_incomplete_not_free; new_google_conflict_task. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/calendar-busy.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Fallos dejan pendiente de comprobación y tarea; no prometer lock distribuido D1/Google. Flujo manual sin conexión se etiqueta sin verificación externa.
- [ ] Ejecutar `node --test tests/server/calendar-busy.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 3 · Eventos, invitación única y reconciliación

**Files:** Create server/viewing-calendar.js y migración calendar_outbox/calendar_event_links; Modify server/jobs.js; Test tests/server/viewing-calendar.test.mjs.

**Interfaces:** upsertViewingEvent(connection,{external_id,viewing_id,proposal_revision,event,etag,operation_key}); cancelViewingEvent(connection,{external_id,etag,operation_key}).

- [ ] Escribir o ajustar pruebas focales con estas aserciones: lost_insert_response_lookup_same_id; 412_review; cancelled_no_recreate; stale_callback_denied; open_group_no_other_guests; one_invitation_channel. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-calendar.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] ID determinista válido, mapping durable antes dispatch, updates etag y revisión. Cancelación/reprogramación al mismo evento; invitación propia por cliente, sin otro envío ICS duplicado.
- [ ] Ejecutar `node --test tests/server/viewing-calendar.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 4 · Ajustes, estado externo y prueba de cuenta

**Files:** Modify admin/src/Availability.jsx, admin/src/Viewings.jsx; Create tests/calendar-viewings-ui.test.js; Create docs/roadmap/work/VIS-12/activation.md.

**Interfaces:** Panel muestra connected/disconnected y pending/synced/unknown/conflict por visita; prueba real posterior no sustituible por fixture.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: oauth_denied_fallback; external_change_new_proposal; no_private_notes_in_event; invited_client_only; disconnect_pending. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/calendar-viewings-ui.test.js` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Completar recorrido controlado con autorización real de cuenta: crear, mover, cancelar y desconectar. Sin Outlook en cierre actual, sin modificación de horarios desde Google sin revisión.
- [ ] Ejecutar `node --test tests/calendar-viewings-ui.test.js` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Cierre futuro

- [ ] Revisar cobertura del diseño/contratos, migración poblada con FK activas si la hay y Review Focus completo. Si falta productor o dependencia real, registrar el tramo pendiente sin completar por mocks.
- [ ] Para cambios de código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. Si cambia UI: e2e del proyecto y Playwright1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. No repetir producto para documentos puros.
- [ ] Registrar construido/integrado/verificado/activado por separado en ledger de la tarea, checklist y ESTADO cuando se construya. Revisión independiente futura; publicación/migración/activación solo bajo autorizaciones de esa sesión. Ninguna casilla está ejecutada ahora.

**Precisión de ocupación propia:** freeBusy puede fusionar el evento de esta visita con otra ocupación. Nunca restar su intervalo. Si el candidato solapa su evento conocido, devolver self_overlap_needs_review y exigir evidencia humana de esa propuesta/revisión de que no hay conflicto ajeno. Una ventana nueva disjunta usa freeBusy normalmente; reconfirmación sin cambio es no-op. Añadir self_event_merged_foreign_busy_never_subtracted y wrong_revision_evidence_denied a tarea2. Se evita ampliar permisos a leer toda la agenda.
