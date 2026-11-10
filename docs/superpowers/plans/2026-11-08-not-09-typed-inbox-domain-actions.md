# NOT-09 · Acciones de un clic en cada aviso: Approve, Reply, Call, Snooze y Done Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task cuando se encargue construir. Steps use checkbox (`- [ ]`) syntax. Esta sesión entrega solo planificación.

**Goal:** Ejecutar Approve, Reply, Call y Snooze mediante sus servicios de dominio, conservando Done acotado.

**Architecture:** Dispatcher estrecho y receipts propios; ninguna lógica de negocio duplicada dentro del Inbox.

**Tech Stack:** JavaScript/React/Workers/D1 y servicios actuales. Sin dependencias nuevas por defecto; pruebas node:test y D1 local donde hay transacciones. Google solo VIS-12; audio local futuro solo VIS-15.

**Spec:** [Diseño](../specs/2026-11-08-inbox-actions-completion-design.md), [índice](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** BUS-15, AGE-08/06/04, SPR-03, AUT-19; NOT-01/08/11; VIS-17/08 para citas; MSG-03/AUT-17 para envío.

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

1. button_visible_then_revoked_denies; stale_source_409; same_op_diff_body_409; wrong_target_denied; server_actor_only
2. unknown_must_clarification_only; reply_open_no_send; tel_click_no_contact_fact; before_after_confirm; done_not_close_search; source_deleted_no_restore
3. approval_contact_summary; no_send_on_open; keep_draft_on_409; after_action_target_correct; focused_action_after_refresh
4. Borrado/revocación mientras corre una operación impide commit o callback tardío y no restaura datos.
5. Operación o participante incorrecto/versiones obsoletas no heredan permisos, tareas o aceptaciones de otro caso.

## Tarea 1 · Descriptor y guardas al ejecutar

**Files:** Create server/inbox-actions.js y server/routes/inbox-actions.js; Modify server/api.js; Test tests/server/inbox-actions.test.mjs.

**Interfaces:** getTaskActions(env,{task_id,revision},actor); executeTaskAction(env,{task_id,revision,source_revision,action,payload,operation_id},actor).

- [ ] Escribir o ajustar pruebas focales con estas aserciones: button_visible_then_revoked_denies; stale_source_409; same_op_diff_body_409; wrong_target_denied; server_actor_only. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/inbox-actions.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Allowlist por acción, target resuelto servidor y receipt hash sin contenido. No permitir path/SQL/status arbitrario; no framework idempotente global.
- [ ] Ejecutar `node --test tests/server/inbox-actions.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 2 · Conectar acciones con dueños

**Files:** Modify server/inbox-actions.js y adaptadores de los servicios dueños; Test tests/server/inbox-action-domains.test.mjs.

**Interfaces:** Approve->BUS-15; Reply->borrador MSG/AGE; Call->AGE-06 evidencia; Criteria->AUT-19; Viewing->VIS-17; Capture->SPR-03.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: unknown_must_clarification_only; reply_open_no_send; tel_click_no_contact_fact; before_after_confirm; done_not_close_search; source_deleted_no_restore. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/inbox-action-domains.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Mutación del dueño produce tarea en batch componible o recibo/reconciliación explícita, sin afirmar atomicidad de batches separados. Reconsultar operación incierta antes de reintento.
- [ ] Ejecutar `node --test tests/server/inbox-action-domains.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 3 · Snooze sin perder obligaciones

**Files:** Modify server/notification-tasks.js y migración snoozed_until; Modify server/jobs.js; Test tests/server/inbox-snooze.test.mjs.

**Interfaces:** Acción snooze {until_local,zone:Europe/Jersey}, futuro<=30d, no modifica due_at/assigned_to; update material despospone.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: gap_fold_reject; due_preserved; material_reply_unsnooze; resolved_while_sleep_no_reopen; snoozed_accessible; two_staff_one_revision. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/inbox-snooze.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Persistir revisión/historia metadata y usar reloj existente para volver a Active. Vencimiento no reabre episodio resuelto ni pausa búsqueda.
- [ ] Ejecutar `node --test tests/server/inbox-snooze.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 4 · Interacciones y confirmaciones específicas

**Files:** Modify admin/src/Inbox.jsx, admin/src/InboxTask.jsx; Create tests/inbox-domain-actions-ui.test.js.

**Interfaces:** Botones según acciones de servidor y confirmación exacta, Reply borrador, Call selector de todos los teléfonos, Snoozed accesible.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: approval_contact_summary; no_send_on_open; keep_draft_on_409; after_action_target_correct; focused_action_after_refresh. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/inbox-domain-actions-ui.test.js` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Teclado/foco, feedback del resultado y estado unknown visible. No reemplazar las revisiones humanas de presentación/criterios por un Done.
- [ ] Ejecutar `node --test tests/inbox-domain-actions-ui.test.js` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Cierre futuro

- [ ] Revisar cobertura del diseño/contratos, migración poblada con FK activas si la hay y Review Focus completo. Si falta productor o dependencia real, registrar el tramo pendiente sin completar por mocks.
- [ ] Para cambios de código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. Si cambia UI: e2e del proyecto y Playwright1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. No repetir producto para documentos puros.
- [ ] Registrar construido/integrado/verificado/activado por separado en ledger de la tarea, checklist y ESTADO cuando se construya. Revisión independiente futura; publicación/migración/activación solo bajo autorizaciones de esa sesión. Ninguna casilla está ejecutada ahora.
