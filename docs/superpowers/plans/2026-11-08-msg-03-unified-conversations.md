# MSG-03 · Bandeja común sin duplicar mensajes ni identidades Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **P · Tramo condicionado**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Bandeja única limitada ahora a chat web y correo.

**Para ejecutar/completar:** Solo dos adapters de canales actuales, identidad discriminada, vínculo humano y retenciones propias. Meta excluida, WhatsApp posterior; no es bloqueo de primera versión. Decisiones: Q03, Q06, Q11. Verificaciones: V03, V05. Dependencias: MSG-02 integrado; AUT-17 operativo para email.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Bandeja común sin duplicar mensajes ni identidades.

**Architecture:** Ampliar servicios existentes con el contrato propietario definido en el diseño; mantener estado y evidencia por canal sin duplicar autoridades.

**Tech Stack:** JavaScript, D1, React y servicios existentes; documentación/evidencias para configuración, node:test para código.

**Spec:** [Diseño común](../specs/2026-11-08-list2-messaging-batch-design.md), [índice](2026-11-09-list2-build-ready-github.md).

**Dependencies:** AUT-17 por email; PRE-02/PRE-08 Meta; PRE-24 para WhatsApp, parciales.

## Global Constraints

- Solo planificación. Reconciliar código real y dependencias del spec antes de construir. Migraciones con siguiente ordinal libre entonces, ruta exacta registrada en alcance/ledger; no modificar aplicadas ni duplicar chat/correo/reloj/bandeja.
- Canal pendiente es pendiente, no operativo ni vacío. WhatsApp, Meta y proveedor IA conservan decisiones/permisos externos. No activar infraestructura, bots, modelos o envíos por este documento.
- C13 vigente: reply humano explícito del chat web sigue permitido durante pausa; automático y correo respetan AUT-11. Origen lo determina servidor. No convertir excepción en bypass de otro canal.
- Panel y superficies privadas: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion. Widget conserva identidad de su CSS actual.
- Inglés, labels/status/alert, loading/vacío/error/parcial/conflicto; staff/same-origin/no-store, chat bearer actual/Turnstile, safeHref/texto escapado. JSON131072bytes salvo límites específicos más restrictivos, lista50/poll30s visible; no PII/token de proveedor en storage/logs/Telegram. Excepción storage actual solo llave opaca del webchat, no contactos/drafts.
- Ponytail evita duplicados; impeccable product y antislop conservan flujo/copy; seguridad valida identidad/canales/versiones; rendimiento acota payloads/sondeo. Taste/redesign no aplican a estética nueva; sin assets/fuentes/dependencias nuevas. Documentación pura sin UI no necesita MCP o suite de producto.

## Review Focus

1. Proyección de conversaciones: casos de tarea1.
2. Vínculos y respuesta: casos de tarea2.
3. Bandeja existente: casos de tarea3.
4. Entrada no autorizada/origen/sesión/versión equivocada: rechazo sin efecto; pruebas de rutas correspondientes.
5. Caída/replay/respuesta tardía: no duplicar ni restaurar estado anterior; verificar en pruebas focales o evidencia operativa según superficie.

## Tarea 1 · Proyección de conversaciones

**Files:** server/conversations.js; esquema channel_conversations/channel_conversation_links; prueba `tests/server/conversations.test.mjs`.

**Interfaces:** listConversations(env,{channel,status,cursor,limit:50}); getConversation(env,ref,{cursor,limit:50}).

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar numeric_id_collision_safe, source_deleted_disappears, same_name_not_same_person, pagination_stable. Referencias discriminadas web/email/cuenta/thread; cuerpos en origen sin copia que eluda retención. Integrar web/email primero; canal no habilitado pendiente, no lista vacía ficticia.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/server/conversations.test.mjs`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 2 · Vínculos y respuesta

**Files:** server/conversations.js; server/routes/conversations.js; server/api.js; prueba `tests/server/conversation-routes.test.mjs`.

**Interfaces:** linkConversationContact(env,ref,{contact_id,version},actor); prepareConversationReply(env,ref,{last_message_id,text,version},actor).

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar human_contact_link_required, stale_link_409, contact_link_not_read_permission, wrong_channel_not_sent, suppression_preserved. Referir envío al adaptador propietario web/email/Meta; no trasladar autorización de un canal al otro ni registrar enviado por mailto.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/server/conversation-routes.test.mjs`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 3 · Bandeja existente

**Files:** admin/src/Messages.jsx; admin/src/ConversationDetail.jsx; prueba `tests/unified-messages-ui.test.js`.

**Interfaces:** Filtros de canal/estado, keyset50 y sondeo30s visible.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar source_delete_while_fetch, old_reply_draft_not_other_channel, expiry_clears_personal_view, unavailable_channel_pending. Un panel lista/detalle, no nueva bandeja paralela. Adjuntos sin autoejecución. Checks/MCP y regresiones web/email/borrado/retención.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/unified-messages-ui.test.js`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Cierre futuro

- [ ] Contrastar task JSON MSG-03 con evidencia real y registrar construido/integrado/activado por separado en ledger/tarea/checklist/ESTADO. AUT-17 es cierre operativo de implementación existente, no otra implementación desde cero.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validación documental, sin suite de producto artificial.
- [ ] Revisión independiente futura, corregir hallazgos y conservar bloqueos externos. Servicios externos/infra/envíos reales solo con autorizaciones de la sesión ejecutora; fixture/fake no acredita entrega real ni permisos.
