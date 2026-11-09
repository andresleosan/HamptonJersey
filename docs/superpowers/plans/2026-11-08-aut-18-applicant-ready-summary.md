# AUT-18 · Ready for the team y contador en resumen Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Ready humano versionado y contador compatible.

**Para ejecutar/completar:** Marca/contador construibles; cierre operativo con siguiente resumen08:00 recibido. Done no cierra búsqueda. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03, V06, V13. Dependencias: AUT-14; revisiones reales de criterios/propuestas y eventos existentes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Ready for the team y contador en resumen.

**Architecture:** Ampliar servicios existentes con el contrato propietario definido en el diseño; mantener estado y evidencia por canal sin duplicar autoridades.

**Tech Stack:** JavaScript, D1, React y servicios existentes; documentación/evidencias para configuración, node:test para código.

**Spec:** [Diseño común](../specs/2026-11-08-list2-messaging-batch-design.md), [índice](2026-11-09-list2-build-ready-github.md).

**Dependencies:** AUT-14 operativo para aceptación final; revisión humana y versiones de propuestas.

## Global Constraints

- Solo planificación. Reconciliar código real y dependencias del spec antes de construir. Migraciones con siguiente ordinal libre entonces, ruta exacta registrada en alcance/ledger; no modificar aplicadas ni duplicar chat/correo/reloj/bandeja.
- Canal pendiente es pendiente, no operativo ni vacío. WhatsApp, Meta y proveedor IA conservan decisiones/permisos externos. No activar infraestructura, bots, modelos o envíos por este documento.
- C13 vigente: reply humano explícito del chat web sigue permitido durante pausa; automático y correo respetan AUT-11. Origen lo determina servidor. No convertir excepción en bypass de otro canal.
- Panel y superficies privadas: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion. Widget conserva identidad de su CSS actual.
- Inglés, labels/status/alert, loading/vacío/error/parcial/conflicto; staff/same-origin/no-store, chat bearer actual/Turnstile, safeHref/texto escapado. JSON131072bytes salvo límites específicos más restrictivos, lista50/poll30s visible; no PII/token de proveedor en storage/logs/Telegram. Excepción storage actual solo llave opaca del webchat, no contactos/drafts.
- Ponytail evita duplicados; impeccable product y antislop conservan flujo/copy; seguridad valida identidad/canales/versiones; rendimiento acota payloads/sondeo. Taste/redesign no aplican a estética nueva; sin assets/fuentes/dependencias nuevas. Documentación pura sin UI no necesita MCP o suite de producto.

## Review Focus

1. Marca versionada: casos de tarea1.
2. Contador compatible: casos de tarea2.
3. Panel y resumen: casos de tarea3.
4. Entrada no autorizada/origen/sesión/versión equivocada: rechazo sin efecto; pruebas de rutas correspondientes.
5. Caída/replay/respuesta tardía: no duplicar ni restaurar estado anterior; verificar en pruebas focales o evidencia operativa según superficie.

## Tarea 1 · Marca versionada

**Files:** server/applicant-ready.js; server/routes/applicants.js; migración aditiva ready metadata; prueba `tests/server/applicant-ready.test.mjs`.

**Interfaces:** setApplicantReady(env,id,{ready,applicant_version,proposal_revision},actor).

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar mark_requires_reviewed_proposals, done_clears, stage_change_clears, requirement_or_proposal_change_invalidates, stale_post_cannot_remark. Evento/cambio atómicos, fecha/actor y versión; no aprobación por score ni cerrar búsqueda al marcar Done.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/server/applicant-ready.test.mjs`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 2 · Contador compatible

**Files:** server/routes/hermes.js; admin/src/ApplicantDetail.jsx; avisador como consumidor separado; prueba `tests/server/applicant-ready-status.test.mjs`.

**Interfaces:** status.applicants_ready vigente; frase fija N applicants with proposals ready for the team.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar status_no_personal_data, invalid_ready_not_counted, absent_optional_counter_old_client, undo_race_consistent. Productor/consumidor con prueba conjunta; enlace al panel fijo y runtimeIDs privados. No incorporar nombres o texto libre por comodidad. Añadir marking_not_self_invalidating y done_not_completed; revisiones criterios/propuestas independientes de la escritura Ready, contador actual.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/server/applicant-ready-status.test.mjs`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 3 · Panel y resumen

**Files:** admin/src/ApplicantDetail.jsx; tests/aut18-e2e.cjs; docs/roadmap/work/AUT-18/acceptance.md; prueba `tests/applicant-ready-ui.test.js`.

**Interfaces:** Ready for the team/Done y feedback con versión vigente.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar keyboard_focus, old_response_not_ready_after_done y changed_proposals_need_review. Checks/MCP y prueba offline de frase; cierre requiere siguiente resumen08:00 real tras marca con autorización, otra cuenta solo ve contador. Sin envío real en esta planificación.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/applicant-ready-ui.test.js`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Cierre futuro

- [ ] Contrastar task JSON AUT-18 con evidencia real y registrar construido/integrado/activado por separado en ledger/tarea/checklist/ESTADO. AUT-17 es cierre operativo de implementación existente, no otra implementación desde cero.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validación documental, sin suite de producto artificial.
- [ ] Revisión independiente futura, corregir hallazgos y conservar bloqueos externos. Servicios externos/infra/envíos reales solo con autorizaciones de la sesión ejecutora; fixture/fake no acredita entrega real ni permisos.
