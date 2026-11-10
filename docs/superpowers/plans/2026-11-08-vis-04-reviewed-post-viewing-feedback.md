# VIS-04 · Decidir tras la visita: Proceed, Need more information o Not interested Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task cuando se encargue construir. Steps use checkbox (`- [ ]`) syntax. Esta sesión entrega solo planificación.

**Goal:** Recoger feedback del cliente y mostrarlo junto al resultado del empleado sin sobrescribirlo.

**Architecture:** Respuesta por visita/propuesta y canal privado AGE-12; petición1h tras fin solo con Completed acreditado.

**Tech Stack:** JavaScript/React/Workers/D1 y servicios actuales. Sin dependencias nuevas por defecto; pruebas node:test y D1 local donde hay transacciones. Google solo VIS-12; audio local futuro solo VIS-15.

**Spec:** [Diseño](../specs/2026-11-08-viewings-coordination-design.md), [índice](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** VIS-17/08, AGE-12, AUT-17/AUT-11 para email, NOT-11; EST-14 consume resultado.

**Readiness:** conditional. Feedback/manual y formulario definidos; petición por email completa solo con transporte y grant reales verificados. Diseño definido no significa dependencia integrada, permiso build o activación.

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

1. client_and_staff_both_preserved; reason_required_decline; other_note_required; note_500; wrong_episode_denied; late_cancel_no_restore
2. past_time_alone_no_mail; complete_after_due_next_tick; no_show_no_mail; legacy_no_mass_mail; after_7d_no_dispatch; unknown_no_retry
3. prefetch_no_feedback; revoked_session; human_disagreement_visible; labels_keyboard; other_client_denied; no_owner_report
4. Borrado/revocación mientras corre una operación impide commit o callback tardío y no restaura datos.
5. Operación o participante incorrecto/versiones obsoletas no heredan permisos, tareas o aceptaciones de otro caso.

## Tarea 1 · Feedback con fuente y motivos

**Files:** Create server/viewing-feedback.js y migración viewing_feedback; Modify server/routes/inbox.js; Test tests/server/viewing-feedback.test.mjs.

**Interfaces:** submitViewingFeedback(env,{viewing_id,proposal_revision,outcome,reason,note},clientScope)->{feedback_id,revision}; outcomes proceed/more_info/not_interested.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: client_and_staff_both_preserved; reason_required_decline; other_note_required; note_500; wrong_episode_denied; late_cancel_no_restore. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-feedback.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Una respuesta por revisión con historial; staff conserva su resultado. Resultado no cambia casa global, criterios u oferta automáticamente.
- [ ] Ejecutar `node --test tests/server/viewing-feedback.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 2 · Solicitud elegible de feedback

**Files:** Modify server/viewing-messages.js, server/jobs.js; Create tests/server/viewing-feedback-clock.test.mjs.

**Interfaces:** Purpose feedback_1h reutiliza AUT-17; elegible tras fin+1h y Completed, hasta7días, sin baseline masiva.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: past_time_alone_no_mail; complete_after_due_next_tick; no_show_no_mail; legacy_no_mass_mail; after_7d_no_dispatch; unknown_no_retry. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-feedback-clock.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Añadir recibo único por revisión/purpose, limpiar datos al borrar; no ordenar email por simple avance del reloj ni mandar a propietario.
- [ ] Ejecutar `node --test tests/server/viewing-feedback-clock.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 3 · Formulario y Timeline de visita

**Files:** Create site/viewing-feedback.js o componente de portal AGE-12; Modify admin/src/Viewings.jsx, admin/src/ApplicantDetail.jsx; Test tests/server/viewing-feedback-routes.test.mjs.

**Interfaces:** Formulario privado usa POST/sesión/ref y etiqueta outcome staff vs feedback client; Timeline local lee resultado seguro.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: prefetch_no_feedback; revoked_session; human_disagreement_visible; labels_keyboard; other_client_denied; no_owner_report. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-feedback-routes.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Confirmar envío de feedback y conservar respuesta ante error. No formulario completo de aplicación, no token en URL/query ni instrucciones privadas en cliente.
- [ ] Ejecutar `node --test tests/server/viewing-feedback-routes.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Cierre futuro

- [ ] Revisar cobertura del diseño/contratos, migración poblada con FK activas si la hay y Review Focus completo. Si falta productor o dependencia real, registrar el tramo pendiente sin completar por mocks.
- [ ] Para cambios de código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. Si cambia UI: e2e del proyecto y Playwright1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. No repetir producto para documentos puros.
- [ ] Registrar construido/integrado/verificado/activado por separado en ledger de la tarea, checklist y ESTADO cuando se construya. Revisión independiente futura; publicación/migración/activación solo bajo autorizaciones de esa sesión. Ninguna casilla está ejecutada ahora.

**Acceso de feedback:** consumir grant de visita de VIS-17/tarea5, incluso para reserva general sin presentación. Añadir tarea3 general_booking_feedback_without_fake_applicant, presentation_audience_not_inferred y other_viewing_denied. Identidad/destinatario acreditados, no knowing viewing_id. Feedback no autoriza leer catálogo de matches.
