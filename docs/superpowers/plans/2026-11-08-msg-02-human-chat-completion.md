# MSG-02 · Cierre del chat humano existente Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Cerrar chat web humano existente y revisión semántica.

**Para ejecutar/completar:** Pruebas/retención/previews/WAF y activación del canal humano; no espera IA, Meta ni OAuth por empleado. Decisiones: Q06, Q09. Verificaciones: V03, V06, V09, V13. Dependencias: Código chat/migración0022; ANA-09 y subconjunto PRE-34 para activar; avisadorAUT-14 si se consume.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Cierre del chat humano existente.

**Architecture:** Ampliar servicios existentes con el contrato propietario definido en el diseño; mantener estado y evidencia por canal sin duplicar autoridades.

**Tech Stack:** JavaScript, D1, React y servicios existentes; documentación/evidencias para configuración, node:test para código.

**Spec:** [Diseño común](../specs/2026-11-08-list2-messaging-batch-design.md), [índice](2026-11-09-list2-build-ready-github.md).

**Dependencies:** Subconjunto PRE-34/ANA-09 para activar; avisador VPS con alcance propio.

## Global Constraints

- Solo planificación. Reconciliar código real y dependencias del spec antes de construir. Migraciones con siguiente ordinal libre entonces, ruta exacta registrada en alcance/ledger; no modificar aplicadas ni duplicar chat/correo/reloj/bandeja.
- Canal pendiente es pendiente, no operativo ni vacío. WhatsApp, Meta y proveedor IA conservan decisiones/permisos externos. No activar infraestructura, bots, modelos o envíos por este documento.
- C13 vigente: reply humano explícito del chat web sigue permitido durante pausa; automático y correo respetan AUT-11. Origen lo determina servidor. No convertir excepción en bypass de otro canal.
- Panel y superficies privadas: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion. Widget conserva identidad de su CSS actual.
- Inglés, labels/status/alert, loading/vacío/error/parcial/conflicto; staff/same-origin/no-store, chat bearer actual/Turnstile, safeHref/texto escapado. JSON131072bytes salvo límites específicos más restrictivos, lista50/poll30s visible; no PII/token de proveedor en storage/logs/Telegram. Excepción storage actual solo llave opaca del webchat, no contactos/drafts.
- Ponytail evita duplicados; impeccable product y antislop conservan flujo/copy; seguridad valida identidad/canales/versiones; rendimiento acota payloads/sondeo. Taste/redesign no aplican a estética nueva; sin assets/fuentes/dependencias nuevas. Documentación pura sin UI no necesita MCP o suite de producto.

## Review Focus

1. Conciliar código y pendientes: casos de tarea1.
2. Aviso humano por contador: casos de tarea2.
3. Recorrido y activación separada: casos de tarea3.
4. Entrada no autorizada/origen/sesión/versión equivocada: rechazo sin efecto; pruebas de rutas correspondientes.
5. Caída/replay/respuesta tardía: no duplicar ni restaurar estado anterior; verificar en pruebas focales o evidencia operativa según superficie.

## Tarea 1 · Conciliar código y pendientes

**Files:** server/chat.js; server/routes/chat.js; server/routes/chats.js; site/chat.js; docs/roadmap/work/MSG-02/gap-check.md; prueba `tests/server/chat.test.mjs`.

**Interfaces:** Chat bearer actual, KEY_DAYS7/KEEP_DAYS30/VISITOR_MAX1000/TEAM_MAX2000/MAX_VISITOR40/GAP_MS3000.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar switch_off_404, previews_blocked, expired_key_generic, deleted_chat_not_restored, retention_backlog_visible. No reconstruir0022 ni cambiar a llave24h. Revisar PRIV-01 de retención/aviso y conservar pendiente si no demostrado.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/server/chat.test.mjs`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 2 · Aviso humano por contador

**Files:** server/routes/hermes.js; contrato avisador del VPS; tests/server/chats-admin.test.mjs; prueba `tests/server/chats-admin.test.mjs`.

**Interfaces:** news().chats_waiting opcional, frase fija/DM sin contenido.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar no_person_data_in_news, manual_reply_allowed_during_pause, auto_reply_blocked_during_pause. C13 vigente solo humano web; no bypass genérico de correo/Meta. Preparar patch avisador/compose/guardar-llaves/verificar en su entorno autorizado sin leer claves, prueba offline y DM chat<=1/10min. Añadir chat_semantic_revision_monotonic y polling_not_semantic_change; versión común para MSG-04/05, reply/Handled/handoff la actualizan.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node --test tests/server/chats-admin.test.mjs`, esperar todos los casos aprobados; añadir regresiones de las rutas existentes afectadas.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 3 · Recorrido y activación separada

**Files:** tests/msg02-e2e.cjs; admin/src/Messages.jsx; docs/roadmap/work/MSG-02/activation.md; prueba `tests/msg02-e2e.cjs`.

**Interfaces:** Visitante->Messages<=30s->respuesta firmada->borrado.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Probar móvil390/escritorio1280/recarga/End chat/Delete/expiración, sin email de empleado en firma. Checks/MCP con datos sintéticos. Verificar WAF/previews y permiso concreto antes de encender/publicar; entrega real de aviso con evidencia posterior, sin fingir activación por test fake.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Ejecutar `node tests/msg02-e2e.cjs` en el entorno local reproducible ya preparado según AVANZAR.md/test:e2e; nunca contra producción; registrar fixture/servidor usados y éxito de cada caso.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Cierre futuro

- [ ] Contrastar task JSON MSG-02 con evidencia real y registrar construido/integrado/activado por separado en ledger/tarea/checklist/ESTADO. AUT-17 es cierre operativo de implementación existente, no otra implementación desde cero.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validación documental, sin suite de producto artificial.
- [ ] Revisión independiente futura, corregir hallazgos y conservar bloqueos externos. Servicios externos/infra/envíos reales solo con autorizaciones de la sesión ejecutora; fixture/fake no acredita entrega real ni permisos.
