# Ideas: «Hampton Bot», el empleado de IA de Hampton (chat web + panel + Telegram) — 2026-11-06

> Documento de ideas, no un spec aprobado: lo que se construya pasa antes por /brainstorming y su spec. Salió de cinco propuestas independientes, quince críticas adversariales, una síntesis y una revisión (6-nov-2026). Ya incorpora las decisiones de Luis de ese día: nombre visible «Hampton Bot»; bot de Telegram nuevo (Hermes 2 y @Carl_Bro_001_bot no cambian); correo con Cloudflare Email Service (AUT-17, P-19).

## 0. En una página

**Qué se propone.** Un empleado digital llamado «Hampton Bot» con tres caras: el chat de la web, el panel /admin y un bot nuevo de Telegram solo para Luis. El cerebro del chat vive dentro de Hampton App (una «Pages Function»: código que corre en Cloudflare al recibir una petición) y usa Workers AI, los modelos que Cloudflare aloja en su red, por un «binding» (un enchufe de configuración, sin clave que robar). El modelo solo entiende qué pide el visitante; el código actúa con lo que ya existe. En el panel, Hampton Bot propone y una persona aprueba con su sesión de Google.

**Por qué así.** Un chat público es entrada hostil y trae datos personales (C2) en cuanto alguien deja su teléfono: nunca toca al Hermes 2 actual (terminal y poder de desarrollador) ni pasa por el VPS, que sigue saliendo hacia la app sin puertos abiertos. Cloudflare ya es el encargado del aviso de privacidad, y Workers AI no entrena ni retiene lo que procesa.

**Qué se puede empezar ya.** La fase 1 (chat con respuesta humana, sin IA) no espera a nadie. En paralelo, Luis crea el bot nuevo en BotFather (nombre visible «Hampton Bot»; @Carl_Bro_001_bot sigue con Hermes 2 sin cambios), crea la regla de límite de peticiones en Cloudflare y aprueba el párrafo nuevo del aviso. Coste del modelo: 0 € al mes con el tráfico previsto; el plan Workers Paid (5 $/mes) llega de todos modos por el correo (AUT-17). En el checklist, desde el 6-nov: PRE-34 (fase 0, Luis), MSG-02 (fase 1, con el primer paso de MSG-05), MSG-04 + el resto de MSG-05 (fases 2 y 3) y AUT-16 (fase 4). Hampton Bot se empieza con «/avanzar MSG-02» (puesto 3 del orden de trabajo de ESTADO.md; la siguiente tarea global sigue siendo AUT-17).

## 1. Qué es «el empleado» y qué no es

Hampton Bot es un asistente automático con nombre: contesta sobre fichas publicadas, horario y cómo reservar o registrarse; propone al equipo; pasa a una persona cuando no puede apoyar la respuesta en datos. Las caras comparten nombre y reglas, no memoria. Límites:

- Nunca aprueba, publica, borra, confirma visitas ni reanuda envíos: eso es del panel, con sesión de Google. Desde el chat solo borra el visitante, con su llave, su propia transcripción; nunca el aplicante ni la visita nacidos de ella.
- Nunca entra en la base de datos: el modelo no tiene herramientas; el código ejecuta consultas fijas y valida lo que devuelve.
- Nunca da consejo legal, de estatus de vivienda (Qualified/Registered), hipotecas, AML ni cifras de valoración: describe la categoría de la ficha y remite a gov.je y a una persona.
- Nunca inventa precio ni disponibilidad (los hechos los escribe el código con plantillas); nunca envía nada solo a clientes fuera del chat; nunca ve datos de otras personas ni pide documentos, ingresos o datos bancarios.
- Nunca habla con el público por Telegram.

## 2. Arquitectura recomendada

```
 VISITANTE (navegador)             EQUIPO (panel, Google)       LUIS (Telegram, 2 cuentas)
   site/chat.js · Turnstile          #/messages · Automations      bot nuevo (solo Luis)
        │ POST /api/chat/messages         │                          ▲ DM «N chats waiting»
        │ (llave en Authorization)        ▼                          │ (sin IA, sin texto)
 ┌──────── Hampton App · Pages Functions + D1 (lo que ya existe) ─────┼─────┐
 │ routes/chat.js ─► guardias (PII, C3, topes) ─► hamptonbot.js             │     │
 │   1 llamada «entender» (tope 10 s) ─► Workers AI (binding, retención 0)  │
 │   código actúa (readLive + evaluate, huecos, horario) ─► plantilla       │
 │   ─► respuesta en la MISMA petición HTTP (3-8 s)                         │
 │ D1: chats · chat_messages · app_settings.hamptonbot ─► barra del panel         │
 └──────────────────────▲───────────────────────────────────────────────────┘
                        │ solo de salida, cada minuto; ningún puerto abierto
 ┌──── VPS · jaula de Hampton (hampton-hermes; Hermes 2 queda fuera) ───────┐
 │ squid ─ custodio (llave) ─ avisador ─► canal «Hampton Team» + DM a Luis  │
 │ Fase 4: portero (token del bot) ─ Hermes de Hampton enjaulado (solo Luis)│
 └──────────────────────────────────────────────────────────────────────────┘
```

Camino de un mensaje: la Pages Function comprueba llave, límites y guardias, guarda el mensaje en D1 (la base de datos de la app), hace **una** llamada a Workers AI con tope de 10 s que devuelve un JSON fijo (intención, idioma, criterios, si pide persona), valida cada campo, ejecuta la acción con código y responde en la misma petición. Si el modelo tarda, falla o el JSON no valida, el mensaje pasa a persona: el chat queda en «waiting», «Messages N» sale del sondeo de 30 s del panel y `news` devuelve además el número de chats en espera, que el avisador (sin IA) publica en el canal y manda a Luis.

**Llave en el navegador:** `sessionStorage` («hampton-chat»: llave y hora, nada personal); muere al cerrar la pestaña y en el servidor caduca a las 24 h. **Sondeo** (preguntar si hay respuesta) solo mientras espera a una persona: cada 5 s el primer minuto, 15 s hasta los 5 minutos, 30 s después y hasta 2 h; se para con la pestaña oculta y se reanuda al volver o al escribir. Si cierra la pestaña, sigue por el contacto que dejó; el widget se lo dice.

## 3. Catálogo de capacidades

| Capacidad | Para quién | Dato | Modo inicial | Existe ya | Falta |
|---|---|---|---|---|---|
| Mensaje y respuesta del equipo | cliente | C2 | sin IA | Turnstile, validadores | widget, tablas, Messages |
| Ficha publicada; horario y contacto | cliente | C0 | sombra → auto | readLive, Availability | plantillas |
| Buscar («3 beds in St Helier under £2,500») | cliente, Luis | C0 | sombra → auto | matching.evaluate | search() sobre publicadas |
| Huecos libres y reserva | cliente | C0 | auto | loadAvailability, #book | abrirlo prellenado |
| Registrar la búsqueda | cliente | C2 (criterios) | auto | asistente #/apply | prellenado |
| Propietario que quiere valorar | cliente | C2 | auto | cita «General enquiry» | plantilla sin cifras |
| Pasar a persona y dejar contacto | cliente | C2 | auto | — | mini-formulario + aviso |
| «Suggested reply» | equipo | C2 | Draft (Use/Edit/Discard) | patrón HermesDraft | hamptonbot.js en borrador |
| Create applicant prellenado | equipo | C2 | Approve (Save) | NewApplicant | ?chat=ID, campos cerrados |
| «N chats esperan»: canal y DM a Luis | equipo, Luis | C0 (número) | auto, sin IA | avisador, news() | segundo token, 4 archivos del VPS |
| Preguntas de Luis por Telegram | Luis | C0 | lectura + pausa | puerta status/jobs/pause | Hermes de Hampton, portero, /search |
| Textos de fichas y Properties Queue | equipo | C0/C2 | Draft | puerta jobs/imports | siguen en Hermes; /imports: decisión 4 |

## 4. El chat en la landing

**Dónde y cómo.** Burbuja abajo a la derecha, en la portada y en cada ficha /p/<id>. `site/chat.js` se carga solo al pulsar, como `apply.js`. Solo texto, sin adjuntos, 1.000 caracteres; foco y `aria-live` como en el asistente. Todo se pinta como texto (`textContent`), nunca HTML; los enlaces salen de una lista blanca del servidor.

**Primera burbuja, fija y por fase.** Fase 1, botón «Message us»: «Leave your message; a person from Hampton Estates will reply, usually within 2 hours in office hours. Please don't share documents, financial or health details here.» Desde la fase 3, botón «Chat with Hampton Bot»: «I'm Hampton Bot, Hampton Estates' automated assistant. A person reads every chat and you can ask for one at any time.» Con enlace al aviso de privacidad y Turnstile (la comprobación anti-robots de los formularios) debajo.

**Idiomas y horario.** Versión 1 en inglés; otro idioma → línea fija escrita por personas en ese idioma y paso a persona. En la app no hay «horario de oficina»: hay horas por negociador y excepciones por fecha en Settings › Availability. El horario de Hampton Bot es la unión de las horas de los negociadores activos menos sus excepciones del día (un festivo de Jersey se bloquea allí, como un día libre); así dice «usually within 2 hours» o «from 10:00 on Monday».

**Paso a persona.** Botón «Talk to a person» siempre visible, las palabras human/person/agent y cualquier intención fuera de la lista. Un mini-formulario (nombre, email o teléfono, casilla «I've read the privacy notice») va directo a `POST /api/chat/contact`: el modelo nunca ve el teléfono.

**Reserva, registro y valoración.** Hampton Bot ofrece hasta tres huecos reales (libre/ocupado, nunca de quién) y abre el formulario #book de siempre con ficha, agente, día y hora preseleccionados; el formulario hace el resto. Para registrar, escribe en `sessionStorage` «hampton-apply» con la forma del asistente, `{step: 0, a: {…}}`, y sus valores exactos (`operation` rent/buy, `parishes_wanted` «St Helier», `property_types` flat/house/cottage/studio, números como texto): el asistente ignora campos privados y valores que no sean opciones, así que el modelo elige de listas cerradas y el código traduce; el visitante termina en #/apply con consentimiento y Turnstile. Un propietario: valoración gratuita y presencial, sin cifras, con cita «General enquiry / valuation».

## 5. El panel

**Messages (#/messages).** Entrada en la barra con los chats que esperan (una consulta más en `openCounts`, sobre un índice parcial). Lista con los que esperan primero; detalle con la transcripción en texto plano, el contacto del mini-formulario, Reply, Mark handled, Create applicant y Delete. Rutas `/admin/chats` (lista por estado, detalle, reply, handled, delete y `applicant` para el prellenado) y `/admin/chat/mode`; `api.js` añade `chat` a los segmentos con `cache-control: no-store`. Reply sale al visitante si sigue en la pestaña; si no, la persona lo llama (o, con el correo de AUT-17, se le envía la respuesta al email que dejó) y pulsa «Mark handled».

**Esquema (migración 0022; la 0021 la usó PUB-22).** `chats`: id, `key_hash` UNIQUE, status open/waiting/handled/closed, listing_id (ON DELETE SET NULL), lang, mode con el que se contestó, contacto del mini-formulario con `privacy_ack_at`, `ip_hash`, created_at, last_at, expires_at, waiting_since. `chat_messages`: chat_id (ON DELETE CASCADE), role visitor/carl/team, text ≤ 2.000, shown, created_at. Índice parcial `WHERE status = 'waiting'`. No toca `events` ni `notifications` (NOT-01).

**Create applicant (MSG-05).** Abre New applicant con `?chat=ID`: contacto del mini-formulario y, desde la fase 3, los campos cerrados que Hampton Bot extrajo (requisitos libres truncados y marcados «from chat»). Save es la aprobación. **Suggested reply (fase 3):** para lo que va a persona, un recuadro «Drafted by Hampton Bot from the visitor's words: check prices, dates and promises», con enlaces y teléfonos ajenos filtrados y Use / Edit / Discard. Nunca se envía solo.

**Automations y retención.** Una fila `app_settings.hamptonbot` = {mode off/people/shadow/assist, day, calls, neurons, fails, by}, leída como clock, hermes y outbound. Tarjeta «Hampton Bot · web chat»: modo con confirmación, llamadas de hoy frente al tope, neurons, «Stopped» si el modelo falla seguido. Hampton Bot lee `outbound.paused` en cada mensaje: «Pause all outbound» lo deja en buzón (people) en el acto; reanudar, solo en el panel. Retención: dos sentencias más en `runRetention` (chats con `last_at` de más de 30 días, mensajes en cascada), contadas en `retention_run.chats`.

## 6. El bot de Telegram: nuevo y solo para Luis

**Papel exacto.** La cara de Hampton Bot para Luis, desde sus dos cuentas; nunca para el público ni el equipo. El «@» no aparece en la web. Decidido por Luis el 6-nov: es un bot **nuevo** creado en BotFather (nombre visible «Hampton Bot», usuario terminado en «bot», por ejemplo @HamptonEstatesBot si está libre); @Carl_Bro_001_bot sigue siendo Hermes 2, sin cambios. El público nunca habla con el bot: un chat público no puede pasar por Telegram sin meter chats de clientes allí.

**Alta del bot (Luis, en BotFather).** `/newbot` con el nombre «Hampton Bot»; el token se guarda como secreto 0400 en la jaula de Hampton con `guardar-llaves.sh`, nunca por chat ni en el repo; grupos desactivados, modo privacidad activado y descripción con el aviso. `/setname` cambia el nombre visible más adelante; el usuario «@» no se puede cambiar. Hermes 2 y @Carl_Bro_001_bot no se tocan.

**Fase 1, sin IA.** No son «20 líneas»: el avisador lee un solo `TOKEN_FILE` y de `news` solo `items` y `cursor`. Cambian cuatro archivos de la jaula, con prueba offline en `pruebas/`: `compose.yaml` (secreto `bot_token_carl` montado en el avisador), `guardar-llaves.sh` (segundo token, 0400 del uid 10300), `verificar.sh` (compara los montajes y secretos exactos de cada contenedor: sin tocarlo pasa a FALLA) y `avisador.mjs` (segundo cliente de Telegram, `chats_waiting` opcional en `validarNews`, un campo de estado y el paso que, cuando el número sube, manda a Luis «2 web chats waiting for a person · enlace al panel», uno cada 10 minutos como mucho). `/status` no cambia (su línea del resumen irá con `CUENTAS`, Decisión 7 del LEEME). R13 (espacios de trabajo con /root y docker.sock) es un AVISO permanente de verificar.sh y decisión de Luis: no bloquea, pero el token de Hampton Bot hereda ese riesgo.

**Fase 4 (fase 1b aprobada + AUT-16).** El Hermes de Hampton enjaulado contesta a Luis. El token no entra en Hermes: vive en el **portero**, un proxy Node sin dependencias como `key-proxy.mjs`, solo en la red interna de Docker, que sustituye el token ficticio de Hermes por el real, reenvía a api.telegram.org por squid y, en lo que vuelve de `getUpdates`, descarta reenvíos, adjuntos y mensajes con emails o teléfonos antes del modelo. Hermes lo usa con `platforms.telegram.extra.base_url`. Telegram admite un lector por token: lee el portero; el avisador conserva su copia solo para enviar el DM sin IA. Configuración: `platform_toolsets.telegram: [mcp-hampton]` (un servidor MCP mínimo, solo lectura más `pause`; MCP: herramientas estándar para un agente), `disabled_toolsets` (terminal, archivos, web, navegador), memoria y perfil de usuario apagados, plugin `hermes-session-reset-policy` más `auto_prune` a 30 días (la poda sola no borra sesiones abiertas), `TELEGRAM_ALLOWED_USERS` con los dos IDs. Luis pregunta por chats en espera, fichas (`GET /api/hermes/search`), borradores y pausa; recibe solo números, referencias y enlaces. **Properties Queue (PUB-21):** el plan del 5-nov es que este Hermes lea los documentos de Drive con el plan de ChatGPT tras PRE-32; pueden traer datos de propietarios o inquilinos (C2, a veces C3), contra la regla de clases de dato. No lo cambio en una celda: es la decisión 4.

## 7. Seguridad y privacidad

- **Llave:** secreto aleatorio de 32 bytes devuelto una vez al crear el chat; en D1 solo su huella SHA-256; viaja únicamente en la cabecera `Authorization` y ninguna ruta lleva id (`/api/chat`, `/api/chat/messages`, `/api/chat/contact`): el servidor deduce el chat de la huella; caduca a las 24 h; `cache-control: no-store`; en `*.pages.dev` el chat está apagado por nombre de host.
- **Agente sin terminal:** el modelo del chat no tiene herramientas; el Hermes de Hampton no tiene terminal, archivos ni web; Hermes 2 queda fuera.
- **Datos de personas:** contacto solo por el mini-formulario; emails y teléfonos del texto pasan a «[email]»/«[phone]» antes del modelo; IBAN, tarjetas (Luhn) y cadenas de 16+ dígitos se bloquean y pasan a persona; palabras C3 (income, benefits, arrears, disability, visa, bank…) pasan a persona sin llamar al modelo; los mensajes del equipo no entran en el contexto del modelo.
- **Límites:** Turnstile al abrir y cada 10 mensajes; 1.000 caracteres, 40 mensajes y 12 turnos con IA por chat; 3 s entre mensajes; 20 chats con mensaje por IP y día (en Jersey muchos móviles comparten IP por CGNAT), con huella HMAC de la IP y sal diaria, y dos semanas solo contando; tope diario de llamadas (200 al empezar) y de neurons. La única regla WAF del plan Free, acotada a `/api/chat*` y `/api/stats` (ANA-09): más de 20 en 10 s por IP → bloqueo 10 s; todo `/api/` no, porque la oficina sale por una IP y el panel rozaría el tope.
- **Apagado sin desplegar:** modo off/people, «Pause all outbound», cuota agotada → buzón, revocar el token del bot.
- **Retención:** 30 días desde el último mensaje; el visitante borra la suya («Delete this chat», con su llave) y el equipo desde Messages; lo convertido en aplicante o visita sigue sus 12 meses. Nunca texto de chats en events, registros, Telegram ni GitHub.
- **Aviso de privacidad:** párrafo «Web chat» (automático desde la fase 3; qué se guarda; Workers AI sin entrenar ni retener; 30 días; aplicante solo si lo pides; cómo borrar; reclamar ante la JOIC, el regulador de Jersey). Lo revisa el abogado (PRE-33).
- **Papeles:** registro en la JOIC de Hampton y de Optimyze como encargado (PRE-03); DPIA corta (evaluación de impacto, art. 16) antes de encender el modelo; contrato Hampton–Optimyze (art. 19) con Cloudflare como subencargado. Transferencia: el art. 66(2)(a) de la Data Protection (Jersey) Law 2018 da por adecuado un país cuando la Comisión Europea lo ha decidido bajo el art. 45 del RGPD; la decisión UE–EE. UU. de 2023 es una, solo para empresas certificadas en el Data Privacy Framework. El abogado confirma que la certificación de Cloudflare, Inc. cubre Workers AI.
- **Pruebas:** fontanería con un modelo falso: `hamptonbot.js` recibe `ai.run` por parámetro y `HBOT_FAKE=1` en `.dev.vars` inyecta uno fijo, porque `wrangler pages dev` con `[ai]` llama a la cuenta real y cobra incluso en local. Calidad con el modelo real: 30 casos inventados + 10 adversarios (≥ 27/30 y 10/10) antes de salir de la sombra y al cambiar modelo o prompt.

## 8. Modelo y costes

**Elección: Workers AI por binding**, modelo `@cf/google/gemma-4-26b-a4b-it` (0,10 $/0,30 $ por millón de tokens, «zero data retention», plan Free). Por qué: Cloudflare ya es el encargado del aviso, no entrena ni retiene, no hay clave ni transferencia nueva. Riesgos: la calidad de un modelo abierto (lo decide la batería) y un JSON no garantizado (se pide por llamada a función; si falla, a persona). Escalón si la batería no pasa: Claude por Amazon Bedrock en Europa tras AI Gateway (registros sin cuerpos, límite de gasto): Opus 5.5 en región Londres (eu-west-2); Haiku 5.5 y Sonnet 5.5 solo con el perfil «Geo EU» (`eu.anthropic.claude-haiku-5-5`, dentro del EEE; nunca «Global», que puede incluir EE. UU.); cliente Bedrock clásico, no Mantle. Reino Unido y EEE son adecuados para Jersey. La API directa de Anthropic no tiene región europea (`inference_geo` solo «global» o «us») ni addendum de Jersey en su DPA: solo con el abogado. Cambiar de proveedor es cambiar una función en `hamptonbot.js`.

**Clases de dato.** C0 (fichas, horario) va en el prompt; C2 (texto del visitante, sin emails ni teléfonos) a Workers AI, el contacto solo a D1; C3 nunca; por Telegram, solo números y referencias.

**Estimación** (3.000 visitas/mes, 5 % abre el chat = 150 chats, 6 turnos, una llamada por turno de ~1.200 tokens de entrada y 150 de salida ≈ 15 «neurons», la unidad de cobro de Workers AI): 900 llamadas/mes, 450-900 neurons/día, menos del 10 % de los 10.000 gratis diarios → 0 €. El plan Workers Paid (5 $/mes) ya llega por el correo (AUT-17): con él, por encima de las 10.000 neurons gratis al día se paga 0,011 $ por cada 1.000 en vez de pasar a buzón. Con Claude, la cuenta visible (900 llamadas = 1,08 M tokens de entrada + 0,135 M de salida): Haiku 5.5, 1,08 × 0,10 $ + 0,135 × 0,50 $ ≈ 0,2 $/mes; Opus 5.5, 1,08 × 4 $ + 0,135 × 20 $ ≈ 7 $/mes (su pensamiento cuenta como salida: con 500 tokens, ≈ 13 $). Precios de lista de Anthropic; los de Bedrock por región se comprueban al contratar, más una cuenta de AWS. Tiempo: fases 1-3 ≈ 7 sesiones.

## 9. Fases

**Fase 0 · Papeles y Cloudflare (PRE-34; Luis, sin código, en paralelo).** Aviso de privacidad; DPIA corta; registro JOIC de Hampton y Optimyze; regla WAF; política de acceso en previews; BotFather: bot nuevo «Hampton Bot» y su token guardado en la jaula. Bloqueo: Luis y abogado. Hecho cuando: regla creada, bot creado y token guardado, aviso aprobado, DPIA firmada por Hampton.

**Fase 1 · Chat con respuesta humana (MSG-02 y el primer paso de MSG-05, sin IA).** Migración 0022; rutas públicas y del panel; widget; Messages v1; contador; retención; `news` con `chats_waiting` y los cuatro archivos de la jaula con su prueba. Bloqueo: nada (para publicar, la regla WAF y el token del bot nuevo guardado). Hecho cuando: un visitante escribe desde el móvil, «Messages 1» aparece en ≤ 30 s, una persona contesta y el visitante lo ve; `verificar.sh` sale sin FALLA con el token de Hampton Bot guardado y Luis recibe el DM de prueba sin datos.

**Fase 2 · Hampton Bot en sombra (MSG-04).** `[ai]` en wrangler.toml y `HBOT_FAKE` en `.dev.vars.example`; `server/hamptonbot.js` (una llamada, lista blanca, guardias, plantillas, tope de 10 s); modo `shadow`: Hampton Bot contesta cada mensaje, se guarda con `shown = 0` y el visitante no lo ve; fila `app_settings.hamptonbot` y tarjeta; topes; batería con el modelo real. Bloqueo: fase 0 (DPIA y aviso), porque entra C2. Hecho cuando: ≥ 27/30 y 10/10, una semana o 30 chats revisados sin un dato inventado, p95 < 15 s.

**Fase 3 · Hampton Bot en vivo (assist; MSG-04 y el resto de MSG-05).** Las intenciones de la lista blanca se contestan solas; botón y burbuja pasan a «Hampton Bot»; tarjetas de fichas; #book y «hampton-apply» prellenados; Suggested reply y campos de Hampton Bot en Create applicant. Bloqueo: «sí» de Luis tras medir. Hecho cuando: una reserva y un registro reales nacidos en el chat aparecen en Viewings y Applicants; primera respuesta automática < 10 s y humana < 2 h en horario durante una semana.

**Fase 4 · Hampton Bot en Telegram para Luis (= fase 1b + AUT-16).** Hermes de Hampton con el portero, MCP mínimo, `GET /api/hermes/search`, dos llaves en la puerta, `verificar.sh` ampliado. Bloqueo: PRE-32 o una clave de API con acuerdo de datos para ese Hermes, y la decisión 4 sobre /imports. Hecho cuando: Luis pregunta por chats y fichas desde sus dos cuentas y recibe solo números, referencias y enlaces; otra cuenta no recibe nada; el portero para reenvíos, adjuntos y teléfonos.

**Después.** Con el correo de la app (AUT-17, decidido el 6-nov): avisar por email al visitante que dejó contacto cuando el equipo contesta y ya cerró la pestaña. Solo si se pide: idiomas, reserva dentro del chat, Meta (MSG-03), chats en el Inbox (NOT-01).

## 10. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Conectar el chat a Hermes 2 | Poder de taller + texto hostil (restricción 2) |
| Hermes en el VPS como cerebro de la web (recadero, MCP, sondeo largo) | Tres a cinco contenedores y texto de clientes en el VPS; su api_server mezcla sesiones |
| Anthropic directa por defecto | Sin región UE/UK ni addendum de Jersey; escalón vía Bedrock en Europa |
| AI Gateway en la v1 | Guarda cuerpos por defecto; binding y topes en código bastan |
| Id del chat en la URL | La llave quedaría en registros e historial; va solo en la cabecera |
| Categoría «chat» en notifications/events ahora | Reconstruir tablas con historial (NOT-01); el contador propio basta |
| Modo Draft en vivo; pantalla Settings › Messages | Nadie llega en 5 minutos (modo sombra); ajustes que no cambian (una fila `carl`) |
| Enlace público t.me al bot · Meta/WhatsApp | Chats de clientes en Telegram; Meta prohíbe asistentes de IA fuera de EEE/BR/TR/IT |

## 11. Decisiones que solo Luis puede tomar

1. **El bot y el público (decidido el 6-nov).** El público habla con «Hampton Bot» en la web; el bot de Telegram es nuevo y solo para Luis; @Carl_Bro_001_bot sigue con Hermes 2. Sin datos de personas por Telegram. Queda por hacer: crear el bot en BotFather cuando toque la fase 0.
2. **Proveedor del modelo para el chat (C2):** Workers AI, Claude por Bedrock en Europa o Anthropic directa con el abogado. Recomendación: Workers AI; Bedrock (Opus en Londres o Haiku con perfil EU) si la batería falla.
3. **Papeles antes de encender el modelo:** aviso, DPIA, registro JOIC de Hampton y Optimyze, abogado (PRE-33). Recomendación: sí; la fase 1 sin IA no espera.
4. **Properties Queue (PUB-21):** mantener el plan del 5-nov (el Hermes de Hampton lee los documentos de Drive con el plan de ChatGPT tras PRE-32) o pasar esa lectura a un modelo con acuerdo de datos (Workers AI desde la app o la clave de la decisión 2). Recomendación: modelo con acuerdo; hasta entonces /imports no se abre al plan de ChatGPT.
5. **Cloudflare:** la única regla WAF del plan Free para `/api/chat` + `/api/stats` y la política de acceso en previews; Workers Paid ya viene decidido por el correo (AUT-17). Recomendación: regla y política ya. Sombra una semana y lista blanca en inglés van por defecto, sin pregunta.

**Revisión.** Acepté todos los puntos del revisor. Dos con matiz: para la llave elegí su segunda variante (ninguna id en la ruta; la huella identifica el chat) por ser menos código; y en la fase 4 el token vive en el portero, pero el avisador conserva una copia solo para enviar el DM sin IA, porque un solo lector de `getUpdates` no impide varios emisores.