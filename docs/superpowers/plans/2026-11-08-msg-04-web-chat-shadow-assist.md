# MSG-04 · IA web primero en sombra y después assist autorizado Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **P · Tramo condicionado**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Sombra/assist del chat web a través de Hermes central.

**Para ejecutar/completar:** Sustituir ruta prevista Cloudflare WorkersAI por preferencia actual de suscripción central; verificar integración/contenido admitidos antes de texto real. Sin adapter no hay IA operativa. Pruebas reales y sí deLuis antes de assist. Decisiones: Q01, Q02, Q09. Verificaciones: V03, V08, V09, V12, V13, V14. Dependencias: MSG-02/AUT-11, AUT-05/13, PRE-32/34 y contrato HamptonIntent específico.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** IA web primero en sombra y después assist autorizado.

**Architecture:** Ampliar servicios existentes con el contrato propietario definido en el diseño; mantener estado y evidencia por canal sin duplicar autoridades.

**Tech Stack:** JavaScript, D1, React y servicios existentes; documentación/evidencias para configuración, node:test para código.

**Spec:** [Diseño común](../specs/2026-11-08-list2-messaging-batch-design.md), [índice](2026-11-09-list2-build-ready-github.md).

**Dependencies:** MSG-02/AUT-11; PRE-34 y proveedor/clase de datos/cupos antes de texto real.

## Global Constraints

- Solo planificación. Reconciliar código real y dependencias del spec antes de construir. Migraciones con siguiente ordinal libre entonces, ruta exacta registrada en alcance/ledger; no modificar aplicadas ni duplicar chat/correo/reloj/bandeja.
- Canal pendiente es pendiente, no operativo ni vacío. WhatsApp, Meta y proveedor IA conservan decisiones/permisos externos. No activar infraestructura, bots, modelos o envíos por este documento.
- C13 vigente: reply humano explícito del chat web sigue permitido durante pausa; automático y correo respetan AUT-11. Origen lo determina servidor. No convertir excepción en bypass de otro canal.
- Panel y superficies privadas: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion. Widget conserva identidad de su CSS actual.
- Inglés, labels/status/alert, loading/vacío/error/parcial/conflicto; staff/same-origin/no-store, chat bearer actual/Turnstile, safeHref/texto escapado. JSON131072bytes salvo límites específicos más restrictivos, lista50/poll30s visible; no PII/token de proveedor en storage/logs/Telegram. Excepción storage actual solo llave opaca del webchat, no contactos/drafts.
- Ponytail evita duplicados; impeccable product y antislop conservan flujo/copy; seguridad valida identidad/canales/versiones; rendimiento acota payloads/sondeo. Taste/redesign no aplican a estética nueva; sin assets/fuentes/dependencias nuevas. Documentación pura sin UI no necesita MCP o suite de producto.

## Review Focus

1. Guardias y salida tipada: casos de tarea1.
2. Shadow con cupos: casos de tarea2.
3. Assist con evidencia y sí de Luis: casos de tarea3.
4. Entrada no autorizada/origen/sesión/versión equivocada: rechazo sin efecto; pruebas de rutas correspondientes.
5. Caída/replay/respuesta tardía: no duplicar ni restaurar estado anterior; verificar en pruebas focales o evidencia operativa según superficie.

## Tarea 1 · Guardias y salida tipada

**Files:** server/hamptonbot.js; server/hamptonbot-intent.js; server/hamptonbot-replies.js; prueba `tests/server/hamptonbot-guards.test.mjs`.

**Interfaces:** classifyChatForModel(text); parseHamptonIntent(value); HamptonIntent del spec6.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar C3_blocked_before_model, credentials_not_sent, ambiguous_personal_text_handoff, unknown_intent_rejected, invented_listing_id_rejected. Email/teléfono ocultos no garantizan anonimización total; datos fuera de clase van humano. Modelo interpreta, plantillas/datos publicados producen respuesta; no herramientas/SQL ni nueva reserva automática.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/server/hamptonbot-guards.test.mjs`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 2 · Shadow con cupos

**Files:** server/hamptonbot.js; app_settings.hamptonbot; esquema drafts/usage compatible; prueba `tests/server/hamptonbot-shadow.test.mjs`.

**Interfaces:** runHamptonBot(env,{chat_id,message_id,chat_revision},modelClient) -> {status,draft_id}.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar shadow_not_visitor_visible, one_call_per_message, timeout10s_to_human, quota_reserved_atomically, uncertain_call_not_repeated, human_reply_invalidates_late_bot, deleted_chat_discards_result. JSON<=32768bytes, cupo default0, sin fallback proveedor. Adaptador real solo proveedor elegido; nombre histórico no se presume vigente. Añadir human_auto_compare_and_swap y client_cannot_claim_human_origin; inserción automática condicional atómica con revisión MSG-02/pregunta/pausa/handoff.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/server/hamptonbot-shadow.test.mjs`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 3 · Assist con evidencia y sí de Luis

**Files:** admin/src/Automations.jsx; admin/src/Messages.jsx; site/chat.js; tests/hamptonbot-evaluation.json; prueba `tests/hamptonbot-ui.test.js`.

**Interfaces:** Modo shadow/assist versionado, Use/Edit/Discard humanos y formularios existentes prellenados.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar pause_blocks_auto_not_human_C13, no_approval_bypass, no_criteria_saved_without_confirmation, up_to_three_real_slots.30casos>=27/30 y10/10adversarios reales, semana o30chats revisados sin inventos yshadowp95<15s. Assist tras sí expreso, automática<10s/humana<2henhorario durante semana y registro/reserva reales con autorización. Fake no cierra batería ni activa. Checks/MCP, modelo/costes/condiciones verificados antes de activación.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/hamptonbot-ui.test.js`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Cierre futuro

**Entrega técnica obligatoria del alcance central:** consumir `runCentralModelTask(env,{task_id,purpose,source_ref,source_version,policy_version,deadline_at},modelClient)` del contrato de la [matriz](2026-11-09-list2-build-ready-github.md), propósito `web_chat_intent`. AUT-13 entrega dispatcher/transporte; MSG-04 conserva esquema HamptonIntent, plantillas y drafts. Pruebas nuevas en `tests/server/hamptonbot-central.test.mjs`: `central_poll_not_sla_evidence`, `total_deadline_9s`, `busy_never_late_auto_reply`, `chat_delete_cancels_central_and_drafts`, `late_result_never_restores`, `no_private_content_in_jobs90d`. Añadir esos casos a la tarea propietaria antes de implementar integración viva. `chat_assist_drafts` pertenece al ciclo/borrado del chat, no jobs90d; archivo de servicio propuesto `server/hamptonbot-central.js`. Sin transporte real permitido y medido dentro del presupuesto, el automático conserva pending: no sustituir por sondeo minuto ni bajar criterio de aceptación. El código de contrato/fakes no demuestra latencia o permiso real.

- [ ] Contrastar task JSON MSG-04 con evidencia real y registrar construido/integrado/activado por separado en ledger/tarea/checklist/ESTADO. AUT-17 es cierre operativo de implementación existente, no otra implementación desde cero.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validación documental, sin suite de producto artificial.
- [ ] Revisión independiente futura, corregir hallazgos y conservar bloqueos externos. Servicios externos/infra/envíos reales solo con autorizaciones de la sesión ejecutora; fixture/fake no acredita entrega real ni permisos.
