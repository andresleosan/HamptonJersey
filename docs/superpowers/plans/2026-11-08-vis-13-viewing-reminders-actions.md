# VIS-13 · Recordatorios a las 24 h y 2 h con Confirm, Reschedule y Cancel Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task cuando se encargue construir. Steps use checkbox (`- [ ]`) syntax. Esta sesión entrega solo planificación.

**Goal:** Preparar recordatorios24h/2h y acciones del cliente sin duplicados ni cancelación automática.

**Architecture:** Purposes del transporte AUT-17 y revisión de propuesta; reloj10min existente, no cron nuevo.

**Tech Stack:** JavaScript/React/Workers/D1 y servicios actuales. Sin dependencias nuevas por defecto; pruebas node:test y D1 local donde hay transacciones. Google solo VIS-12; audio local futuro solo VIS-15.

**Spec:** [Diseño](../specs/2026-11-08-viewings-coordination-design.md), [índice](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** VIS-17/08, AGE-12, AUT-11, AUT-17 activado para entrega real, NOT-11; VIS-12 evita invitación duplicada.

**Readiness:** conditional. Construcción de elegibilidad/acciones definida; cierre de entrega requiere AUT-17 activo y recepción real autorizada. Diseño definido no significa dependencia integrada, permiso build o activación.

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

1. 24h_real_duration_dst; 2h_not_confirmed_task; late_both_only_2h; inside_2h_once; started_no_reminder; rescheduled_old_superseded
2. get_prefetch_no_mutation; wrong_participant_denied; old_proposal_409; revoked_grant_denied; group_cancel_only_place; no_auto_cancel_without_response
3. paused_no_send; accepted_not_repeated; unknown_manual_review; no_keys_or_household; email_disabled_manual_task; received_real_gate
4. Borrado/revocación mientras corre una operación impide commit o callback tardío y no restaura datos.
5. Operación o participante incorrecto/versiones obsoletas no heredan permisos, tareas o aceptaciones de otro caso.

## Tarea 1 · Elegibilidad y outbox por revisión

**Files:** Create server/viewing-messages.js y migración de receipts por viewing/purpose/revisión; Modify server/jobs.js; Test tests/server/viewing-reminder-clock.test.mjs.

**Interfaces:** viewingMessageTick(env,now,{limit:50}); prepareViewingMessage(env,{viewing_id,proposal_revision,purpose},actor).

- [ ] Escribir o ajustar pruebas focales con estas aserciones: 24h_real_duration_dst; 2h_not_confirmed_task; late_both_only_2h; inside_2h_once; started_no_reminder; rescheduled_old_superseded. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-reminder-clock.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Calcular UTC frente a inicio; marcar24h superseded si solo2h vigente. Unicidad y claim antes dispatch; no repetir resultado incierto.
- [ ] Ejecutar `node --test tests/server/viewing-reminder-clock.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 2 · Respuesta segura del cliente

**Files:** Create server/routes/viewing-client-actions.js; Modify integración AGE-12/servidor; Test tests/server/viewing-client-actions.test.mjs.

**Interfaces:** POST con sesión AGE-12 y propuesta actual: confirm acepta cliente, reschedule solicita propuesta, cancel cancela solo su visita/plaza.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: get_prefetch_no_mutation; wrong_participant_denied; old_proposal_409; revoked_grant_denied; group_cancel_only_place; no_auto_cancel_without_response. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-client-actions.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Reutilizar grant hasta revocación; acciones específicas no autoridad staff. Mantener propuesta y políticas en servidor, sin tokens en query o storage.
- [ ] Ejecutar `node --test tests/server/viewing-client-actions.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 3 · Plantillas, monitor y recepción

**Files:** Modify server/viewing-messages.js, admin/src/Viewings.jsx; Create tests/server/viewing-reminder-delivery.test.mjs.

**Interfaces:** Purposes reminder_24h/reminder_2h en AUT-17, recibo accepted/unknown/failed y hito Reminded solo con evidencia apropiada.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: paused_no_send; accepted_not_repeated; unknown_manual_review; no_keys_or_household; email_disabled_manual_task; received_real_gate. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-reminder-delivery.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Preparar copia inglés revisada y muestra. Activación exige correo operativo y destinatario controlado; no WhatsApp/Meta, no mover search_state.
- [ ] Ejecutar `node --test tests/server/viewing-reminder-delivery.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Cierre futuro

- [ ] Revisar cobertura del diseño/contratos, migración poblada con FK activas si la hay y Review Focus completo. Si falta productor o dependencia real, registrar el tramo pendiente sin completar por mocks.
- [ ] Para cambios de código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. Si cambia UI: e2e del proyecto y Playwright1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. No repetir producto para documentos puros.
- [ ] Registrar construido/integrado/verificado/activado por separado en ledger de la tarea, checklist y ESTADO cuando se construya. Revisión independiente futura; publicación/migración/activación solo bajo autorizaciones de esa sesión. Ninguna casilla está ejecutada ahora.

**Acceso de reserva sin presentación:** consumir createViewingGrant/resolveViewingScope de la tarea5 VIS-17, con audience viewing. Reutiliza mecánica AGE-12 sin presentation_id/applicant_id ficticios; no permitir leer matches con cookie de visita. Tarea2 incluye general_booking_no_presentation_supported, cross_audience_denied y delivery_dormant_guard. Permiso del cliente siempre ligado a visita/participante/propuesta vigente.
