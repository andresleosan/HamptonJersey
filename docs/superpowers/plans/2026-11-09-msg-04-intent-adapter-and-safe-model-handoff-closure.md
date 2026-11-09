# MSG-04 · Intent adapter and safe model handoff Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Sólo planificación aquí; otra sesión construye.

**Goal:** Concretar Sombra/assist del chat web a través de Hermes central.

**Architecture:** Complemento del plan anterior: ambos se leen juntos. El original define la funcionalidad completa; este cierre fija contratos compartidos, etapas y casos que no pueden suponerse. Reutilizar el servicio dueño sin otro motor.

**Tech Stack:** JavaScript ESM, D1/R2 y React existentes; módulos de repo para runtime sólo cuando se indique, sin instalar servicios en este encargo.

**Spec:** [Diseño de cierre](../specs/2026-11-09-list2-model-message-contracts-design.md); [plan anterior](2026-11-08-msg-04-web-chat-shadow-assist.md); [tanda](2026-11-09-list2-build-ready-github.md).

**Estado del plan:** specified. Diseño de código no equivale a activación real ni a terminar el original entero.

**Integrar antes:** MSG-02:CAS, AUT-05, AUT-13, PRE-32, PRE-34

**Decisiones pendientes:** Ninguna nueva elección de producto de esta tanda.

## Global Constraints

- Sólo documentos. No código, cuenta, inferencia, envíos, scraping, migración o publicación desde esta sesión. Base4858fdbf7a537990ac63559be8a6ead39884c563; al construir revisar main/contratos/ordinal libre despuésde0036. Protocolo antiguo de reservas retirado; la regla posterior de progreso compartido requiere activity cuando esté disponible. Esta copia devuelve activity_unavailable: planificación local permitida, sin afirmar visibilidad en vivo. Un escritor por copia y turnos para construcción compartida.
- Maestro vigente: Hermes/Pro central y propósitos verificados; C3 nunca Hermes/Pro/Telegram. Meta/WhatsApp/Places-Properties/modeloslocales fuera de esta fase. Ninguna API pagada alternativa automática. Acuerdos los gestiona Hermes con instrucciones existentes; no pedirlos ni buscarlos aquí. L2C01 yL2C02 están resueltas: respuestas de la app y reenvíos seleccionados desde Gmail; derivación humana con un aviso por incidencia si la IA no puede actuar. La dirección concreta se configura por canal privado, no en Git.
- 01:00Jersey para mercado; fotos/permisos/identidad y disponibilidad separados; mascotas MUST cuando existen, parking flexible nuevo sin rebajar MUST confirmado. Presentación exige revisión extra y enlace hasta revocación; no heredar ese enlace para otros datos. Código, dependencia integrada, cobertura y activación son estados distintos.
- Seguridad: staff/same-origin/no-store, CAS/revisión, operation_id, actor/origen por servidor, enums y pertenencia. Sin PII/prompts en logs/storage/Telegram/jobs90días. Contenido conserva retención de origen. Límites JSON128KiB/listas50, polling30s sólo visible, sin URL/fetch/SQL arbitrarios del modelo.
- Panel: ink#141414,paper#ffffff,mist#f2efe9,line#e2ddd4,stone#6b665e,bronze#8a6a3b,ok#1f6b3a,err#a32020,warn#fff6e5. TenorSans26/19px,Montserrat14px/1.5,label12px,1240/gutter16,card24/r14,inputr10,button10x20/r999,celdas10x12,reflujo760,foco2offset2,contraste4.5/3,zoom200/reducedmotion.44pxmóvil propuesta local. Inglés/labels/status/alert y carga/vacío/parcial/error/conflicto. Widget conserva CSS de chat; documentación sin UI no requiere prueba visual.
- Ponytail reutiliza reloj/correo/NOT11; impeccable/antislop mantiene feedback y controles concretos. Seguridad valida fronteras/PII; rendimiento usa SQL/cursor/stream sin librerías nuevas. Taste/redesign no aplican a continuidad de estas pantallas. Ninguna prueba de un fake acredita canal o proveedor real.

## Review Focus

1. Versión, caso o canal equivocados: rechazar sin efectos ni datos de otro sujeto.
2. Respuesta tardía, borrado o revocación: no restaurar datos o permisos antiguos.
3. Duplicado y resultado incierto: no repetir efectos ni llamadas al modelo.
4. Ausencia de datos o evidencia: unknown/pending, nunca éxito, permiso o mercado vacío.
5. Activación real: pruebas locales y diseño no demuestran cuenta, cobertura, recepción o latencia.

## Task 1: Intentos estrictos y plazo total

**Files:**
- Create: `server/hamptonbot.js`.
- Create: `server/hamptonbot-intent.js`.
- Create: `server/hamptonbot-replies.js`.

**Interfaces:** classifyChatForModel(text); parseHamptonIntent(value); runHamptonBot(env,{chat_id,message_id,chat_revision},modelClient)->{status,draft_id}.

**Test:** `tests/server/msg-04-closure-1.test.mjs`.

- [ ] Escribir casos de comportamiento con estas aserciones:
  - `invalid_intent_or_extra_fields_rejected`.
  - `c3_or_credentials_no_model_call`.
  - `masked_personal_text_stays_c1_c2`.
  - `one_message_one_dispatch`.
  - `total_budget9s_no_minute_poll_assumption`.
- [ ] Ejecutar `node --test tests/server/msg-04-closure-1.test.mjs` y verificar fallo por comportamiento ausente, no por el entorno.
- [ ] Implementar la interfaz del servicio dueño: Usar las intenciones y criterios del diseño con el adapter hampton_intent_v1, distinto de ambiguity y listing_text. Las plantillas usan datos vigentes, nunca precios u horarios inventados. Ofrecer hasta tres huecos reales y formularios con su validación existente.
- [ ] Ejecutar `node --test tests/server/msg-04-closure-1.test.mjs` y regresiones del módulo; todos los casos deben pasar con fixtures locales sintéticos.
- [ ] Revisar diff y registrar commit de archivos concretos tras validación; nunca añadir secretos, datos reales o relevo privado.

## Task 2: Sombra, handoff y activación medida

**Files:**
- Modify: `admin/src/Automations.jsx`.
- Modify: `admin/src/Messages.jsx`.
- Modify: `site/chat.js`.
- Create: `server/hamptonbot.js`.

**Interfaces:** shadow/assist versionado; CASsharedMSG02para insertar autorespuesta y Use/Edit/Discard humanos.

**Test:** `tests/server/msg-04-closure-2.test.mjs`.

- [ ] Escribir casos de comportamiento con estas aserciones:
  - `human_reply_discards_late_auto`.
  - `delete_or_new_message_invalidates_draft`.
  - `shadow_never_visible_to_visitor`.
  - `unknown_dispatch_no_retry`.
  - `assist_requires_real_evaluation_and_luis_approval`.
- [ ] Ejecutar `node --test tests/server/msg-04-closure-2.test.mjs` y verificar fallo por comportamiento ausente, no por el entorno.
- [ ] Implementar la interfaz del servicio dueño: Derivar al equipo mediante Messages/Waiting cuando la IA no pueda actuar; un aviso por incidencia, sin targetchat ficticio. Assist sólo tras batería real30+10, umbrales27/30y10/10, semana o30chats revisados, latencia y sí de Luis. Un cliente falso no acredita esas puertas.
- [ ] Ejecutar `node --test tests/server/msg-04-closure-2.test.mjs` y regresiones del módulo; todos los casos deben pasar con fixtures locales sintéticos.
- [ ] Revisar diff y registrar commit de archivos concretos tras validación; nunca añadir secretos, datos reales o relevo privado.

## Precisión obligatoria de la tarea2

Además de los archivos indicados, añadir una migración aditiva para `chat_model_escalations` y el consumidor en `server/routes/chats.js`. `projectChatEscalation(env,{chat_id,source_message_id,chat_revision,reason_code,continuation_policy})->EscalationDescriptor` sólo usa el chat nativo, sin target Inbox. Añadir pruebas `unlinked_chat_handoff_stays_in_messages`, `no_fake_contact_for_handoff`, `one_escalation_per_episode`, `human_reply_resolves_escalation_atomically` y `deleted_chat_cannot_restore_escalation` al test de la tarea2. La decisión L2C02 afecta la acción siguiente; las guardas y el lugar donde se muestra están definidos.


Pruebas adicionales obligatorias de la tarea2: `model_unavailable_hands_to_human`, `same_incident_notifies_once`, `uncertain_dispatch_not_retried`.

## Decisiones confirmadas ·9-nov-2026

L2C01: Messages recibe respuestas de correos de la app y reenvíos seleccionados del Gmail elegido. No se conecta todo el buzón ni se importa su historial por esta elección. La dirección concreta queda sólo en el relevo privado y en la futura configuración autorizada. L2C02: si la vía no está verificada, la IA está caída o alcanza su límite, continuar mediante el equipo con un aviso único por incidencia. No esperar una respuesta fabricada ni contratar otra API. Unknown después de dispatch se concilia antes de cualquier nueva operación.

## Cierre de construcción futuro

**Aceptación completa:** Sombra y derivación humana especificadas. Assist requiere vía real, latencia, batería, tratamiento y sí de Luis antes de activarse; no respuestas fabricadas al bloquearse.

- [ ] Reconciliar este complemento, plan anterior y main real. Entregar la funcionalidad pendiente completa; no limitarse a añadir un test o una interfaz vacía. Las verificaciones externas permanecen identificadas hasta acreditarse.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e y MCP1280/390, teclado/foco/zoom200%, éxito/validación/vacío/error/conflicto, consola/red. Sólo documentación: revisar estructura/enlaces/evidencias, sin tests de producto.
- [ ] Registrar evidencia de tarea/ledger y actualizar estado sólo con lo construido, integrado y activado realmente. Borrador no es envío; inferencia propuesta no es decisión humana; recepción técnica no es respuesta útil.
- [ ] Revisión independiente antes de publicación; autorizar SHA y migraciones aplicables. Esta entrega no autoriza construir, instalar o publicar nada.
