# EST-17 · Estados de la ficha propia de Draft a Sold / Let, con Withdrawn y To confirm Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task cuando se encargue construir. Steps use checkbox (`- [ ]`) syntax. Esta sesión entrega solo planificación.

**Goal:** Completar Ready for review, Let agreed y Let conservando publicación separada de disponibilidad.

**Architecture:** Servicio único de estados propios, reutiliza eventos de EST-18 y escritores Sales/Rentals.

**Tech Stack:** JavaScript/React/Workers/D1 y servicios actuales. Sin dependencias nuevas por defecto; pruebas node:test y D1 local donde hay transacciones. Google solo VIS-12; audio local futuro solo VIS-15.

**Spec:** [Diseño](../specs/2026-11-08-property-workspace-design.md), [índice](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** EST-18; EST-16/15 para hechos y propagación; Sales/Rentals existentes; PUB-02/12 conservan gates de publicar.

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

1. legacy_published_preserved; archived_not_let; lease_not_let; ready_not_published; unknown_not_available
2. let_agreed_requires_evidence; let_requires_contract_or_human_ref; old_fallen_sale_not_override_human; wrong_operation_denied; all_writers_emit_once
3. stale_state_preserves_draft; missing_reference_error; no_social_action; user_status_labels
4. Borrado/revocación mientras corre una operación impide commit o callback tardío y no restaura datos.
5. Operación o participante incorrecto/versiones obsoletas no heredan permisos, tareas o aceptaciones de otro caso.

## Tarea 1 · Dimensiones y migración compatible

**Files:** Create server/listing-state.js y migración editorial_review_state/valores let_agreed/let; Modify server/listing.js; Test tests/server/listing-state.test.mjs.

**Interfaces:** setOwnListingState(env,{listing_id,expected_at,action,reason?,evidence_ref?},actor)->{listing,event_id}; editorial y comercial separados.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: legacy_published_preserved; archived_not_let; lease_not_let; ready_not_published; unknown_not_available. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/listing-state.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Migración poblada con IDs/FK/media intactos. ready_for_review no cambia published ni archived_at; no publicar por aprobación editorial sola.
- [ ] Ejecutar `node --test tests/server/listing-state.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 2 · Acciones y escritores compartidos

**Files:** Modify server/routes/listings.js, server/routes/sales.js, server/routes/rent.js, server/listing-events.js; Test tests/server/listing-state-writers.test.mjs.

**Interfaces:** Sales/Rentals aportan referencia/hito real; batch contextual captura estado/evento/outbox con CAS.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: let_agreed_requires_evidence; let_requires_contract_or_human_ref; old_fallen_sale_not_override_human; wrong_operation_denied; all_writers_emit_once. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/listing-state-writers.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] No estado let por reloj/visita ni vuelta a to_let sin evidencia. No reescribir enum a ciegas ni introducir trigger duplicado a EST-18.
- [ ] Ejecutar `node --test tests/server/listing-state-writers.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 3 · Propagar alcance comercial sin confusión

**Files:** Modify adaptadores EST-16/15 y server/listing-state.js; Test tests/server/own-state-availability.test.mjs.

**Interfaces:** Hecho comercial explícito con scope propio; archive editorial por sí solo no indisponibilidad de todo inmueble.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: withdraw_editorial_not_global; let_only_rent_scope; new_action_revalidates_effective_fact; reactivation_no_old_viewing_restore. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/server/own-state-availability.test.mjs` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Conectar productores reales cuando estén integrados; si otro módulo no está, registrar cobertura pendiente y no cerrar propagación.
- [ ] Ejecutar `node --test tests/server/own-state-availability.test.mjs` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Tarea 4 · Acciones de revisión en editor

**Files:** Modify admin/src/ListingEditor.jsx, admin/src/Listings.jsx, admin/src/format.js; Test tests/own-listing-states-ui.test.js.

**Interfaces:** Ready for review con revisión pendiente y comercial Let agreed/Let con evidencia/motivo; published separado.

- [ ] Escribir o ajustar pruebas focales con estas aserciones: stale_state_preserves_draft; missing_reference_error; no_social_action; user_status_labels. Usar referencias/fixtures sintéticos; comprobar también aislamiento de scope y borrado/revocación durante la acción en el dueño que la ejecuta.
- [ ] Ejecutar `node --test tests/own-listing-states-ui.test.js` y comprobar el fallo por comportamiento ausente antes del cambio, o registrar que ya está cubierto cuando es continuidad; no fabricar un fallo en una tarea ya construida.
- [ ] Mantener reglas Drive queue y publish actuales; validación y foco tras409. No informe al propietario por estado.
- [ ] Ejecutar `node --test tests/own-listing-states-ui.test.js` hasta PASS y regresiones reales de escritores/servicios afectados. Un fixture de transporte no acredita entrega, consentimiento, cuenta conectada o servicio activado.
- [ ] Revisar diff/evidencia y guardar una unidad acotada con archivos concretos y mensaje inglés cuando la sesión constructora lo permita. No añadir todo Git, secretos o relevo privado.

## Cierre futuro

- [ ] Revisar cobertura del diseño/contratos, migración poblada con FK activas si la hay y Review Focus completo. Si falta productor o dependencia real, registrar el tramo pendiente sin completar por mocks.
- [ ] Para cambios de código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. Si cambia UI: e2e del proyecto y Playwright1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. No repetir producto para documentos puros.
- [ ] Registrar construido/integrado/verificado/activado por separado en ledger de la tarea, checklist y ESTADO cuando se construya. Revisión independiente futura; publicación/migración/activación solo bajo autorizaciones de esa sesión. Ninguna casilla está ejecutada ahora.
