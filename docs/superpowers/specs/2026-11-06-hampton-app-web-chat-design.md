# Chat de la web con respuesta humana (MSG-02, fase 1 de Hampton Bot)

Integración local del 6-nov-2026: chats usa `0022_chats.sql`, después de `0021_published_at.sql` de PUB-22. Sin migraciones aplicadas ni publicación; el permiso anterior era para otro SHA.

Fecha: 6-nov-2026. Decisiones de Luis en el brainstorming del 6-nov: «1 1 1 1» y «1 1». Base: [documento de ideas de Hampton Bot](../../roadmap/2026-11-06-ideas-hampton-bot.md), §4, §5, §7 y fase 1.

## Por qué
Hoy el público no puede escribir a Hampton desde la web: solo registra su búsqueda o pide una visita, y el equipo contesta fuera de la app. Luis pidió «responder los mensajes escritos directamente en la página web» (texto original, punto de mensajes). Es la base de Hampton Bot: primero un chat que contesta una persona desde el panel, sin IA y sin depender de Meta ni del correo. La IA (fases 2 y 3, MSG-04) se monta después sobre estas mismas tablas.

## Decisiones

| # | Decisión |
|---|---|
| C1 | **Alcance** (Luis, 1): solo la app (la web, el panel, el contador, el borrado y el número de chats en espera en `news`). Los cuatro archivos del avisador en la jaula del VPS (DM a Luis, segundo token) son una tarea aparte: no están en el taller. |
| C2 | **Contacto al empezar** (Luis, 1): nombre y email o teléfono (al menos uno), la casilla «I've read the privacy notice» y el primer mensaje, en un solo formulario. Sin la casilla no se envía. |
| C3 | **Interruptor** (Luis, 1): fila `app_settings.webchat` = `{on, at, by}`, apagada si no existe. Se cambia en Automations, en una tarjeta «Web chat». Apagado: la burbuja solo sale en un navegador que ya tiene la llave de un chat (para volver a él), `POST /api/chat` responde 404 y los chats ya abiertos siguen funcionando (el visitante lee y escribe, el equipo contesta) *(decisión del constructor)*. `/api/config` se guarda 5 minutos en caché: la burbuja tarda hasta 5 minutos en desaparecer, pero `POST /api/chat` deja de abrir chats en el acto. Luis lo enciende cuando estén la regla WAF y el párrafo del aviso. |
| C4 | **Dónde** (Luis, 1): burbuja abajo a la derecha en la portada y en cada ficha `/p/<id>`. Desde una ficha, el chat guarda `listing_id` y el panel dice de qué casa pregunta. En móvil, por encima de la barra fija `.mbar` de la ficha. No sale en `#/apply` ni en `#/privacy` *(decisión del constructor: ahí ya se está rellenando un formulario)*. |
| C5 | **Volver a la conversación** (Luis, 1): el navegador guarda en `localStorage` («hampton-chat») solo la llave, la hora y el id del último mensaje visto: nada personal (DESIGN.md, seguridad). La llave sirve 7 días desde el último mensaje del chat (también los del equipo); pasados, el servidor responde como a una llave que no existe y el navegador la olvida entonces (y, en todo caso, a los 30 días) *(ajuste tras la revisión: una respuesta del equipo el día 6 alarga la llave)*. «End chat» la olvida en ese aparato (el equipo conserva la conversación para contestar por fuera). «Delete chat» borra la conversación en el servidor, con confirmación. |
| C6 | **Firma** (Luis, 1): las respuestas del equipo salen como «<nombre> · Hampton Estates», con la primera palabra de `admins.name` de quien contestó; si no tiene nombre (o el usuario ya no existe), «Hampton Estates». El email del equipo nunca llega a la web. |
| C7 | **Estados** *(decisión del constructor)*: `waiting` (el último mensaje es del visitante: espera al equipo), `answered` (el equipo contestó el último), `handled` («Mark handled»). Un mensaje nuevo del visitante lo devuelve a `waiting` desde cualquiera. `waiting_since` = hora del primer mensaje sin respuesta. |
| C8 | **Contador**: «Messages N» en la barra del panel = chats en `waiting`. Una consulta más en `openCounts` sobre un índice parcial. No entra en el Inbox ni en `notifications`/`events` (NOT-01). |
| C9 | **`news` de Hermes** devuelve además `chats_waiting` (un número). Como `status` pasa `openCounts` tal cual, su `counts` también trae el número; el texto del resumen de las 8:00 no cambia *(decisión del constructor)*. Nada más de los chats sale por la puerta: ni nombres, ni textos, ni ids. Hoy el avisador lee solo `items` y `cursor` (ideas §6) e ignora el campo; enviarlo al canal y a Luis es la tarea del VPS. |
| C10 | **Límites** *(decisión del constructor, simplifica ideas §7)*: Turnstile al empezar cada chat; mensajes de 1 a 1.000 caracteres del visitante y hasta 2.000 del equipo; como mucho 40 mensajes del visitante por chat y 3 s entre dos suyos; solo texto. **No se guarda la IP** ni su huella: con Turnstile por chat, el tope por chat y la regla WAF basta, y es un dato personal menos. Si hay abuso, se apaga con el interruptor. |
| C11 | **Borrado**: un chat se borra 30 días después de su último mensaje, en la pasada diaria (`runRetention`), con sus mensajes en cascada y su número en `retention_run.chats`. El visitante con «Delete chat» y el equipo con Delete lo borran en el acto. Un aplicante o una visita que el equipo cree a mano a partir de un chat siguen sus propias reglas (12 meses). |
| C12 | **Previews**: en `*.pages.dev` el chat está apagado por nombre de host (usan la base de producción): la burbuja no sale y las rutas públicas del chat responden 404. |
| C13 | **«Pause all outbound» no para las respuestas del chat** *(decisión del constructor)*: las escribe y envía una persona en el panel; la pausa es para lo automático. |
| C14 | **El panel ve cuándo estuvo el visitante**: `visitor_seen_at`, puesto al día por las lecturas del visitante como mucho una vez por minuto; el detalle dice «Visitor on the website now» (menos de 1 min) o «Last on the website 3 h ago», para decidir si contestar en el chat o llamar *(decisión del constructor)*. |

## Textos para el visitante (inglés; Luis los aprueba con la spec)
- Botón: «Message us».
- Cabecera del formulario: «Leave your message and your contact details. A person from Hampton Estates will reply here, usually within 2 hours during office hours, or contact you directly. Please don't share documents, financial or health details here.»
- Tras enviar, debajo de la conversación: «We'll reply here. If you close this page, you can come back on this device for 7 days, and we may also contact you by email or phone.»
- Si Turnstile no carga en 6 s: el mismo plan B que la reserva (llamar al teléfono de la oficina).

## Aviso de privacidad (párrafo nuevo en `renderPrivacy`, Luis lo aprueba; lo revisa el abogado con PRE-33)
- En «What we collect», un punto: «If you use the chat on our website: your name, the email or mobile number you give, your messages and our replies, and the property you were looking at.»
- Sección nueva «Web chat»: «A person from Hampton Estates reads and answers every message; the chat does not reply automatically. We use what you write only to answer you, in the chat or by contacting you. We delete a conversation 30 days after its last message. If you ask us to register your search or arrange a viewing, those details are kept as explained above. You can delete the conversation yourself at any time with "Delete chat".»
- En «In your browser», una frase: «If you start a chat, this browser keeps a random key, not your details, so you can come back to the conversation for 7 days. "End chat" removes it.»

## Dónde va (lo decidido)
- **Migración 0022** (`migrations/0022_chats.sql`):
  - `chats`: `id`, `key_hash` UNIQUE (SHA-256 de la llave), `status` CHECK (`waiting`, `answered`, `handled`), `listing_id` REFERENCES listings ON DELETE SET NULL, `name`, `email`, `phone` (CHECK de al menos uno), `privacy_ack_at`, `created_at`, `last_at`, `waiting_since`, `visitor_seen_at`, `handled_at`, `handled_by`.
  - `chat_messages`: `id`, `chat_id` REFERENCES chats ON DELETE CASCADE, `role` CHECK (`visitor`, `team`), `sent_by` (email del admin, solo en `team`), `text` CHECK de longitud, `created_at`.
  - Índices: parcial `WHERE status = 'waiting'` (contador), por `last_at` (borrado y llave), por `(chat_id, id)`.
- **Rutas públicas** (`server/routes/chat.js`). La llave (32 bytes aleatorios, base64url, devuelta una sola vez) viaja solo en `Authorization: Bearer`; ninguna ruta lleva id; el servidor deduce el chat de la huella:
  - `POST /api/chat`: abre el chat (contacto, casilla, primer mensaje, `listing_id` opcional que solo vale si es una ficha publicada, Turnstile). Comprobaciones baratas primero; Turnstile al final, como la reserva.
  - `GET /api/chat`: la conversación (estado, mensajes con `role`, firma de C6, texto y hora; la ficha si la hay). Pone al día `visitor_seen_at` (C14).
  - `POST /api/chat/messages`: un mensaje del visitante (C10).
  - `DELETE /api/chat`: el visitante borra su chat.
  - Una llave desconocida o caducada responde siempre lo mismo (401 «This chat has ended. Start a new one.»).
  - `api.js` añade `chat` a los segmentos con `cache-control: no-store`. La comprobación de mismo origen del router ya cubre los POST y DELETE.
  - `GET /api/config` añade `chat: true|false` (interruptor encendido y host que no es `*.pages.dev`). Con `false`, la burbuja sale igual si hay llave guardada, salvo en `*.pages.dev`.
- Un `listing_id` que no es una ficha publicada se ignora (el chat se abre sin ficha), no se rechaza. Los mensajes del visitante y los del equipo cuentan como «último mensaje» para la llave de 7 días y el borrado de 30 *(decisiones del constructor)*.
- **Rutas del panel** (con sesión): lista por estado, detalle, `reply`, `handled`, `DELETE` y el interruptor (`POST /admin/webchat`). `GET /admin/automations` devuelve `webchat`.
- **Web**: un módulo nuevo `site/chat.js`, cargado solo al pulsar la burbuja o si `localStorage` ya tiene una llave (para mostrar «1 new reply» en la burbuja). Todo se pinta con `textContent` o `esc()`, nunca HTML de los mensajes; sin enlaces automáticos en los textos. Sondeo solo con una llave, la pestaña visible y el chat en `waiting` o `answered`: cada 5 s el primer minuto, 15 s hasta los 5 minutos y 30 s después; se para a las 2 h del último mensaje y vuelve al escribir o al abrir el panel.
- **Panel**: pantalla `#/messages` (`admin/src/Messages.jsx`) con el patrón `.inbox` (lista y detalle), `.seg` Waiting / Answered / Handled / All con contadores, y en el detalle: contacto (mailto, tel y WhatsApp como en el aplicante), la ficha, C14, la conversación, «Send reply» (primario), «Mark handled» (ghost) y Delete dentro de `<details class="more">` con confirmación. Entrada «Messages» en la barra con su contador. Tarjeta «Web chat» en Automations con el interruptor (`role="switch"`, texto On/Off) y quién lo cambió y cuándo.

## Lo que queda al constructor
- Nombres, forma exacta del JSON y textos del panel en inglés (sentence case, sin exclamaciones, sin «—» como separador).
- Cómo se ve la burbuja y el panel del chat (con /impeccable, dentro de DESIGN.md: píldora ink, la escala de espacios, z-index de los niveles que ya existen, a pantalla completa en móvil, Escape lo cierra y devuelve el foco a la burbuja, `aria-live="polite"` en la conversación).
- Cada cuánto sondea la pantalla Messages (como las demás, 30 s; el detalle abierto puede ir más rápido).
- El paso nuevo del e2e y las pruebas del servidor.

## Fuera
- La IA (MSG-04, fases 2 y 3), «Create applicant» desde un chat (MSG-05), Meta (MSG-03), el correo (AUT-17).
- Los cuatro archivos del avisador en el VPS (tarea aparte, C1).
- Adjuntos, idiomas, horario calculado de los negociadores, aviso por sonido, chats en el Inbox.

## Hecho cuando
- Con el interruptor encendido, en local: un visitante escribe desde el móvil (390) y desde el ordenador (1280); «Messages 1» aparece en el panel en 30 s o menos; una persona contesta y el visitante ve la respuesta firmada; «Mark handled» lo quita del contador; el visitante vuelve tras recargar y ve su conversación; «Delete chat» la borra.
- Con el interruptor apagado o en `*.pages.dev`, no hay burbuja y `POST /api/chat` responde 404.
- `news` trae `chats_waiting`; el borrado de 30 días está probado; `npm test`, `npm run build` y el paso del e2e pasan.
