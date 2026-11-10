# VIS-09 · Duración de la visita, margen entre casas y máximo de visitas por día Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task cuando se encargue construir. Steps use checkbox (`- [ ]`) syntax. Esta sesión entrega solo planificación.

**Goal:** Aplicar duración30, margen15, extra15 entre parroquias y máximo8 citas diarias por negociador.

**Architecture:** Una política compartida por cálculo de slots y escrituras; conservar cuadrícula30 y las reservas actuales.

**Tech Stack:** JavaScript/React/Workers/D1 y servicios actuales. Sin dependencias nuevas por defecto; pruebas node:test y D1 local donde hay transacciones. Google solo VIS-12; audio local futuro solo VIS-15.

**Spec:** [Diseño](../specs/2026-11-08-viewings-coordination-design.md), [índice](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** VIS-07/11/18 existentes; REG-17; VIS-17 consume la política, no bloquea el núcleo.

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

1. defaults_30_15_15_8; same_parish_gap_15; other_parish_gap_30; unknown_parish_gap_30; ninth_refused; invalid_zero_or_fraction; prior_bookings_preserved
2. two_eighth_bookings_one_wins; move_excludes_self; previous_and_next_parish; policy_changes_before_insert; rollback_event_notice; day_boundary_Jersey
3. defaults_visible; save_stale_keeps_draft; old_conflicts_not_cancelled; keyboard_numeric_fields; reloaded_slots_after_409
4. Borrado/revocación mientras corre una operación impide commit o callback tardío y no restaura datos.
5. Operación o participante incorrecto/versiones obsoletas no heredan permisos, tareas o aceptaciones de otro caso.

## Tarea 1 · Política configurable y migración conservadora

**Files:** Create server/viewing-policy.js y migración aditiva de configuración; Modify server/viewings.js, server/routes/negotiators.js; Test tests/server/viewing-policy.test.mjs.

**Interfaces:** resolveViewingPolicy(negotiator,property)->{duration_minutes,buffer_minutes,parish_extra_minutes,max_daily,revision}; canReserveViewing(snapshot,candidate,{excludeViewingId})->{allowed,reasons}.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: defaults_30_15_15_8; same_parish_gap_15; other_parish_gap_30; unknown_parish_gap_30; ninth_refused; invalid_zero_or_fraction; prior_bookings_preserved. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-policy.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Añadir configuración versionada; leer vecinos anterior/posterior y conteo por día Jersey. Duración10–180 múltiplo5, márgenes0–120, máximo1–40. Mantener30 de cuadrícula y no sumar dos márgenes base.
- [ ] Ejecutar `node --test tests/server/viewing-policy.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 2 · Reservar y reprogramar con guardia real

**Files:** Modify server/viewing-store.js, server/routes/public.js, server/routes/inbox.js; Create tests/server/viewing-policy-race.test.mjs.

**Interfaces:** bookStatement y clash consumen política efectiva; INSERT/UPDATE valida solape, máximo, recursos y policy_revision atómicamente.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: two_eighth_bookings_one_wins; move_excludes_self; previous_and_next_parish; policy_changes_before_insert; rollback_event_notice; day_boundary_Jersey. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/viewing-policy-race.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Extender escritores actuales, incluidos reprogramación y futuras reservas VIS-17. Preservar ordering de changes()/last_insert_rowid() y respuestas409, sin solo validación en JavaScript.
- [ ] Ejecutar `node --test tests/server/viewing-policy-race.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 3 · Ajustes y conflictos visibles

**Files:** Modify admin/src/Availability.jsx, admin/src/SlotPicker.jsx, admin/src/Viewings.jsx; Create tests/viewing-policy-ui.test.js.

**Interfaces:** Editor de política muestra valores aprobados, revisión y conflictos con citas existentes; guarda mediante sesión staff.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: defaults_visible; save_stale_keeps_draft; old_conflicts_not_cancelled; keyboard_numeric_fields; reloaded_slots_after_409. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/viewing-policy-ui.test.js` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] No cancelar citas al editar ajustes. Describir razón del hueco no permitido y recargar opciones sin perder borrador. Verificar reflujo/teclado/foco.
- [ ] Ejecutar `node --test tests/viewing-policy-ui.test.js` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Cierre futuro

- [ ] Revisar cobertura del diseño/contratos, migración poblada con FK activas si la hay y Review Focus completo. Si falta productor o dependencia real, registrar el tramo pendiente sin completar por mocks.
- [ ] Para cambios de código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. Si cambia UI: e2e del proyecto y Playwright1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. No repetir producto para documentos puros.
- [ ] Registrar construido/integrado/verificado/activado por separado en ledger de la tarea, checklist y ESTADO cuando se construya. Revisión independiente futura; publicación/migración/activación solo bajo autorizaciones de esa sesión. Ninguna casilla está ejecutada ahora.
