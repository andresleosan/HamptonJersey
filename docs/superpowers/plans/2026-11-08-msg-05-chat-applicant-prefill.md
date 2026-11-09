# MSG-05 · Create applicant con datos actuales y Save humano Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Prefill desde chat y guardado humano idempotente específico.

**Para ejecutar/completar:** Contacto/campos actuales y Save humano/versiones, sin IA obligatoria ni enlace/token en localStorage; borrar chat no recrea cliente por respuesta tardía. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03. Dependencias: MSG-02/revisión semántica; campos IA opcionales solo tras MSG-04.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Create applicant con datos actuales y Save humano.

**Architecture:** Ampliar servicios existentes con el contrato propietario definido en el diseño; mantener estado y evidencia por canal sin duplicar autoridades.

**Tech Stack:** JavaScript, D1, React y servicios existentes; documentación/evidencias para configuración, node:test para código.

**Spec:** [Diseño común](../specs/2026-11-08-list2-messaging-batch-design.md), [índice](2026-11-09-list2-build-ready-github.md).

**Dependencies:** MSG-02 integrado; campos IA solo tras MSG-04 autorizado.

## Global Constraints

- Solo planificación. Reconciliar código real y dependencias del spec antes de construir. Migraciones con siguiente ordinal libre entonces, ruta exacta registrada en alcance/ledger; no modificar aplicadas ni duplicar chat/correo/reloj/bandeja.
- Canal pendiente es pendiente, no operativo ni vacío. WhatsApp, Meta y proveedor IA conservan decisiones/permisos externos. No activar infraestructura, bots, modelos o envíos por este documento.
- C13 vigente: reply humano explícito del chat web sigue permitido durante pausa; automático y correo respetan AUT-11. Origen lo determina servidor. No convertir excepción en bypass de otro canal.
- Panel y superficies privadas: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion. Widget conserva identidad de su CSS actual.
- Inglés, labels/status/alert, loading/vacío/error/parcial/conflicto; staff/same-origin/no-store, chat bearer actual/Turnstile, safeHref/texto escapado. JSON131072bytes salvo límites específicos más restrictivos, lista50/poll30s visible; no PII/token de proveedor en storage/logs/Telegram. Excepción storage actual solo llave opaca del webchat, no contactos/drafts.
- Ponytail evita duplicados; impeccable product y antislop conservan flujo/copy; seguridad valida identidad/canales/versiones; rendimiento acota payloads/sondeo. Taste/redesign no aplican a estética nueva; sin assets/fuentes/dependencias nuevas. Documentación pura sin UI no necesita MCP o suite de producto.

## Review Focus

1. Borrador privado: casos de tarea1.
2. Save y vínculo: casos de tarea2.
3. Formulario existente: casos de tarea3.
4. Entrada no autorizada/origen/sesión/versión equivocada: rechazo sin efecto; pruebas de rutas correspondientes.
5. Caída/replay/respuesta tardía: no duplicar ni restaurar estado anterior; verificar en pruebas focales o evidencia operativa según superficie.

## Tarea 1 · Borrador privado

**Files:** server/routes/chats.js; server/chat-applicant.js; prueba `tests/server/chat-applicant-draft.test.mjs`.

**Interfaces:** GET /api/admin/chats/:id/applicant-draft -> {chat_id,chat_version,contact,fields,provenance}.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar staff_only, deleted_chat_no_draft, stale_chat_rejected, name_does_not_merge_contact. URL solo ID técnico, contacto/campos en respuesta privada no-store; sugerencia de duplicado requiere humano. No copiar transcripción entera en requisitos.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/server/chat-applicant-draft.test.mjs`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 2 · Save y vínculo

**Files:** server/routes/applicants.js; server/chat-applicant.js; prueba `tests/server/chat-applicant-save.test.mjs`.

**Interfaces:** saveApplicantFromChat(env,{chat_id,chat_version,form,operation_key},actor).

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar two_staff_same_intent_one_search, save_required, deleted_before_save_no_recreate, validation_keeps_form, source_expiry_not_delete_saved_applicant. Guardar solicitud con validación normal y procedencia mínima. Guardia negocio de intención, no framework idempotencia HTTP global. Dos intenciones distintas no se colapsan por mismo contacto. Añadir distinct_client_keys_same_server_intent_one_conversion y concurrent_delete_atomic_rollback; intención servidor compartida, contacto/solicitud/vínculo y guardia origen en misma transacción.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/server/chat-applicant-save.test.mjs`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 3 · Formulario existente

**Files:** admin/src/App.jsx para ruta/query; admin/src/Messages.jsx; admin/src/Applicants.jsx; admin/src/ApplicantDetail.jsx según formulario New applicant real; prueba `tests/chat-applicant-ui.test.js`.

**Interfaces:** #/applicants/new?chat=id, carga autorizada y Save explícito.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar cancel_no_create, no_personal_query_or_storage, truncation_visible_from_chat, stale_fetch_no_restore. Limpiar draft al navegar; desconocidos/criterios extraídos son propuestas, no MUST confirmado. Checks/e2e/MCP del chat al alta, sin reabrir búsqueda resuelta por precargar.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/chat-applicant-ui.test.js`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Cierre futuro

- [ ] Contrastar task JSON MSG-05 con evidencia real y registrar construido/integrado/activado por separado en ledger/tarea/checklist/ESTADO. AUT-17 es cierre operativo de implementación existente, no otra implementación desde cero.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validación documental, sin suite de producto artificial.
- [ ] Revisión independiente futura, corregir hallazgos y conservar bloqueos externos. Servicios externos/infra/envíos reales solo con autorizaciones de la sesión ejecutora; fixture/fake no acredita entrega real ni permisos.
