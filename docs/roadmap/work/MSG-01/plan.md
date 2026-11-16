# MSG-01 + PRE-08 · Plan de una página (16-nov-2026)

**Qué:** los mensajes que la gente manda a la página de Facebook de Hampton (Messenger) llegan a Messages del panel y una persona los contesta desde allí. Todo se construye apagado. Instagram, WhatsApp (PRE-24), publicar en redes (PUB-03) y los borradores de Hermes (esperan a PRE-32) quedan fuera.

## Decisiones y su fuente

| Decisión | Fuente |
| --- | --- |
| Solo Messenger; los nombres de canal admiten `instagram` más adelante (CHECK de la tabla ya lo acepta, nada lo escribe). | Luis 16-nov (CONTINUIDAD, plan maestro al final) |
| Una persona contesta; Hermes nunca envía. La caja de respuesta es un texto libre que un borrador podrá rellenar después de PRE-32 (sin campo de borrador ahora: nada especulativo). | Luis 16-nov; spec 2026-11-08 §3 |
| `server/meta-webhooks.js`: GET de verificación (`hub.mode=subscribe`, `hub.verify_token` comparado en tiempo constante con `META_VERIFY_TOKEN`, eco de `hub.challenge` solo si coincide) y POST firmado: `X-Hub-Signature-256 = sha256=` HMAC-SHA256(bytes exactos del cuerpo, `META_APP_SECRET`) con `crypto.subtle.verify`, antes de parsear o guardar nada. Límite 1 MiB; cabecera ausente, repetida o mal formada → 401. | spec §3; docs de Meta (abajo) |
| Ruta pública `/api/meta/webhook`, montada antes del control same-origin (Meta no manda Origin, como la puerta de Hermes) y solo con `META_MESSAGES_READY="1"`. Falta un secreto con el interruptor encendido → 503, nunca acepta datos sin firma. | encargo; patrón de `server/api.js` |
| Idempotencia por el id de mensaje de Meta (`mid`, UNIQUE): una repetición no escribe dos veces. Sin tabla de recibos del sobre: el `mid` basta para mensajes de texto (opción más simple; la tabla `channel_event_receipts` del spec queda para cuando haya otros tipos de evento). | spec §3 + regla 5 de la skill |
| Se contesta 200 solo después de guardar todo en un único batch; si D1 falla, 500 y Meta reintenta (36 h según su documentación). | spec §3; docs de Meta |
| Solo la página `META_PAGE_ID`; otras páginas, ecos, lecturas, entregas y postbacks se ignoran. Adjuntos: no se descargan; se guarda «Attachment received» como texto. | spec §3 (allowlist); encargo |
| Migración aditiva **0109** con `channel_conversations` y `channel_messages` (nombres del spec, §4 ConversationRef). Sin copia del payload. Contacto opcional (`contact_id`, `contact_version` como MSG-03). | encargo; spec §4 |
| Retención: 30 días desde el último mensaje, igual que el chat web (`KEEP_DAYS` de `server/chat.js`), en el mismo pase diario de `server/retention.js`, solo con el interruptor encendido. Por eso `META_MESSAGES_READY` va también en `jobs/wrangler.toml`. | MSG-02 C11 |
| Panel: Messages muestra «Website chat | Facebook» solo con el interruptor encendido; lista Waiting/Answered/Handled/All, detalle, Mark handled, Delete, vínculo a contacto con el componente de MSG-03 (si MSG-03 está encendido). | encargo; Messages.jsx existente |
| Enviar va detrás de `META_SEND_READY="1"` (interruptor solo de Luis). Apagado: no se envía nada y la pantalla lo dice. Encendido: Send API `POST graph.facebook.com/v27.0/<PAGE_ID>/messages`, `messaging_type: RESPONSE`, `recipient.id` = PSID, token de página `META_PAGE_TOKEN`, y solo dentro de las 24 h desde el último mensaje de la persona (hora de Meta). Fuera: se rechaza con un mensaje claro; sin etiquetas de mensaje. | encargo; docs de Meta |
| **Pause all outbound (AUT-11) también detiene las respuestas a Facebook.** C13 exime solo la respuesta dentro del chat web (que no sale de Hampton); el spec pide no convertir esa excepción en un atajo para un canal Meta, y Facebook sí sale a un tercero, como el correo. Opción más segura y reversible. | spec §2 (línea C13) |
| Envío: se guarda la respuesta como `sending`, se llama a Meta (10 s máximo) y queda `sent` (con su `mid`), `failed` (Meta la rechazó) o `unknown` (sin respuesta: puede haber salido; la pantalla pide comprobar en Facebook antes de repetir). Nunca se reintenta solo. | spec §3 («incierto no se repite») |
| Texto de respuesta: hasta 2.000 caracteres (el mismo `TEAM_MAX` del chat web). | supuesto, abajo |

## Comprobado en la documentación oficial de Meta (16-nov-2026)

- *Webhooks, Getting started* (developers.facebook.com/docs/graph-api/webhooks/getting-started): `hub.mode` siempre `subscribe`, comparar `hub.verify_token`, responder con `hub.challenge`; firma en `X-Hub-Signature-256` con prefijo `sha256=` usando el App Secret; responder 200; reintentos durante 36 h; lotes de hasta 1000 cambios; hay que deduplicar.
- *Messenger Platform, Webhooks* (…/messenger-platform/webhooks): la firma se calcula sobre la versión con unicode escapado del payload (los bytes tal como llegan) en hex minúscula; 200 en 5 s o menos; campos `messages` y `messaging_postbacks`.
- *Send messages* (…/messenger-platform/send-messages): `POST https://graph.facebook.com/v27.0/{PAGE-ID}/messages`, token como `access_token`, `recipient.id` = PSID, `messaging_type: RESPONSE` para responder a un mensaje recibido dentro de la ventana estándar; respuesta con `recipient_id` y `message_id`.
- *Policy overview* (…/messenger-platform/policy/policy-overview): la ventana estándar dura 24 horas para la mayoría de acciones de la persona; fuera, etiquetas (Human Agent: 7 días) y otros productos.
- *Webhook events, messages* (…/reference/webhook-events/messages): `sender.id` (PSID), `recipient.id` (página), `timestamp`, `message.mid`, `message.text`, `message.attachments`.

## Supuesto, sin comprobar

- Que la ventana cuenta desde el **último mensaje** de la persona (la política dice «depende de la acción que la abre»); se usa la hora del mensaje según Meta, la más prudente.
- Que `timestamp` va en milisegundos (el ejemplo tiene 13 cifras; no lo dice).
- Que la firma HMAC es la habitual: la página dice «SHA256 signature… using the payload and your App Secret» sin nombrar HMAC.
- El límite de texto de Messenger (la documentación consultada no lo da).
- `is_echo` (los ecos van por el campo `message_echoes`, que no se suscribe; se ignoran igualmente).
- Nada se ha probado con la app real: depende de PRE-02.

## Encender (no en esta construcción)

1. Aplicar 0109. 2. PRE-02: app de Meta, permisos y suscripción de la página; secretos `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_PAGE_TOKEN`, `META_PAGE_ID` en Cloudflare (no en el repositorio). 3. Luis enciende `META_MESSAGES_READY` (ambos `wrangler.toml`) y, cuando quiera enviar, `META_SEND_READY`. 4. Aviso de privacidad (PRE-09) que mencione los mensajes de Facebook. 5. Borradores de Hermes tras PRE-32.
