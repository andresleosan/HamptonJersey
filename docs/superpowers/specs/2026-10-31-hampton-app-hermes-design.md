# Hampton App · El Hermes de Hampton (AUT-13, AUT-14 y PUB-13)

Fecha: 2026-10-31 · Estado: diseño general aprobado por Luis el 30-oct-2026 (arquitectura §6.6, P-18, preguntas 15 y 16); decisiones nuevas del 31-oct en §2 · Base: `main` en `f823d17`
Puntos del checklist: AUT-13 (puerta de la app y trabajo de Hermes), AUT-14 (Telegram) y PUB-13 (textos de fichas). Este spec cubre los tres; esta entrega construye la parte de la app (§6) y deja el resto escrito como pendiente (§7).

## 1. Intención

Hermes, el agente de IA que corre en el VPS, redacta y avisa; la app guarda los datos, aplica las reglas y recoge las aprobaciones. Para que Hermes trabaje para Hampton hace falta una puerta de la app pensada solo para él: con su propia llave, con operaciones fijas y que nunca le entregue datos de personas.

**Éxito de la entrega completa (arquitectura §6.6, «Hecho cuando»):**
- Hermes pide trabajo a la app con su llave y devuelve el borrador de un texto de ficha, que aparece en la ficha; «Use this text» y guardar lo aplican.
- Alguien del equipo pregunta por Telegram «¿qué hay por confirmar?» y recibe la respuesta en su idioma y sin datos personales.
- El resumen llega a las 8:00 de Jersey, y un aplicante nuevo produce su aviso en uno o dos minutos, sin datos de la persona.
- La pantalla Automations muestra la última vez que Hermes pidió trabajo.
- Una pausa pedida por Telegram se ve en el panel.

**Éxito de esta entrega (verificable en el taller, con pruebas):**
- La puerta `/api/hermes/…` solo responde con la llave correcta y solo tiene seis operaciones. Sin llave configurada, está cerrada.
- Ninguna respuesta de la puerta contiene el nombre, el email, el teléfono ni el número de un aplicante o de quien pidió una visita.
- Un texto de ficha pedido en el editor (o por Hermes) llega como borrador, se ve en la ficha y solo pasa al formulario con «Use this text»; la ficha cambia solo al guardarla.
- Hermes puede pausar los envíos; el panel lo enseña en todas las pantallas y solo allí se reanuda.
- La app guarda la hora de la última petición de Hermes.

**No-objetivos de esta entrega:** instalar el Hermes de Hampton, crear el bot, conectar el modelo, la pantalla Automations (AUT-01), textos alternativos y fotos (resto de PUB-13), un botón de pausa en el panel (llega con Automations).

**Anti-objetivos:**
- Que Hermes apruebe, publique, reanude, borre o lea algo fuera de su lista.
- Que un mensaje de Telegram cuente como aprobación.
- Que por la puerta salga cualquier dato de una persona, ni siquiera su número.
- Que la llave viva dentro del contenedor de Hermes.

## 2. Decisiones

| # | Decisión | Quién |
|---|---|---|
| H1 | **Sin horario de silencio** en los avisos de Telegram: cada aviso sale al momento, a cualquier hora | Luis, 31-oct (sustituye la propuesta de 21:00 a 08:00) |
| H2 | El resumen de las 08:00 de Jersey **incluye las fichas To confirm** (ADM-04), con su referencia y su título | Luis, 31-oct |
| H3 | PRE-32 incluye comprobar que el plan de ChatGPT permite **que el equipo lo use a través de Hermes y que Hermes trabaje sin Luis delante**. Si no, las preguntas del equipo y el resumen esperan a un plan Business o pasan a la vía API (P-09) | Luis, 31-oct |
| H4 | **La llave la guarda un pequeño intermediario fuera del contenedor de Hermes.** Hermes llama al intermediario sin llave; el intermediario solo reenvía `/api/hermes/…` a la app y añade la llave | Luis, 31-oct |
| H5 | **Llave:** secreto de Cloudflare `HERMES_KEY` (32 caracteres o más) del proyecto Pages, enviada como `Authorization: Bearer …`. Se compara en tiempo constante (resumen SHA-256). Sin el secreto, o con uno corto, la puerta responde 401 a todo. Se cambia con `wrangler pages secret put HERMES_KEY` y la anterior deja de valer en el siguiente despliegue | Claude |
| H6 | **La puerta tiene seis operaciones fijas** y nada más (§4). No acepta la cookie del panel, ni SQL, ni rutas de admin. Va fuera de la comprobación de mismo origen porque no usa cookies: un navegador no puede enviar la cabecera `Authorization` a otro origen sin CORS, y la app no responde CORS | Claude |
| H7 | **Solo datos públicos (C0) y contadores.** Los avisos dicen «New applicant» o «New viewing request for {título de la ficha}» (solo si la ficha está publicada y sin archivar; si no, «New viewing request»), con un enlace al Inbox o a Viewings, y solo de lo que llegó desde la web (`action_required = 1`). Nunca el título del aviso del Inbox, que lleva el nombre de la persona | Luis (§6.6); el filtro es de Claude |
| H8 | **Tabla `jobs`** (migración 0018): por ahora un solo tipo, `listing_text`, de una ficha. Estados: `queued` → `working` → `draft` → `used` o `discarded`; `failed` tras 3 intentos. Un solo trabajo abierto (`queued`, `working` o `draft`) por ficha y tipo. Un trabajo tomado hace más de 10 minutos sin borrador vuelve a la cola; al tercer intento queda `failed` | Claude |
| H9 | **Solo fichas publicadas en la web**, porque Luis decidió que Hermes solo recibe datos públicos. Una ficha sin publicar puede ser confidencial; Luis confirmó el 31-oct que no se abre a las fichas sin publicar. Hermes recibe los datos de la ficha al tomar el trabajo, no al pedirlo: los campos que enseña la web (`toPublic`, sin fotos, interés, orden ni tour) tal como están guardados. Ni la dirección (`road_name`), ni la investigación, ni datos del propietario. Si la ficha deja la web, su trabajo espera a que vuelva: mientras tanto el panel no lo enseña (el bloque solo sale en fichas publicadas) y no se puede cancelar desde allí (límite conocido) | Claude, tras la revisión del código; confirmado por Luis el 31-oct |
| H10 | **Aprobación:** el borrador se ve en la ficha. «Use this text» lo copia al formulario (título, resumen y descripción) y deja el trabajo en `used` con quién y cuándo; la ficha solo cambia cuando esa persona pulsa Save. «Discard» lo descarta. Las dos cosas solo existen en el panel, con la sesión de Google | Luis (§6.6); los estados son de Claude |
| H11 | **Pausa:** `app_settings.outbound = {paused, at, by}`. Hermes solo puede ponerla (si ya estaba puesta, se conserva quién y cuándo). Por la puerta, quien la puso es «hermes» o «team», nunca el email de una persona del equipo. Se quita en el panel con «Resume sending». Hoy la app no envía nada a clientes ni agencias; todo envío futuro debe leer esa clave antes de salir | Luis (§6.6); la clave es de Claude |
| H12 | **Última petición:** cada petición con llave válida deja su hora en `app_settings.hermes = {at}`. La enseñará Automations (AUT-01); por ahora el editor la usa para no enseñar el botón de borradores mientras Hermes no se ha conectado nunca | Claude |
| H13 | **Enlaces:** se forman con el origen de la petición (`https://<host>/admin/#/…`), así siguen valiendo tras el cambio de dominio. Nunca enlazan a la ficha de una persona | Claude |
| H14 | **El resumen de las 8:00 lo escribe la app** como texto fijo en inglés dentro de `GET /api/hermes/status`, para que Hermes pueda enviarlo sin gastar el plan. Si alguien pregunta por Telegram, Hermes contesta en su idioma con esos mismos contadores | Claude |

## 3. Textos (D19: en inglés)

| Dónde | Texto |
|---|---|
| Aviso por Telegram | «New applicant» · «New viewing request for {title}» · «New viewing request» (consulta general) |
| Resumen | «Hampton summary», una línea por contador que no sea 0, la lista «To confirm: {ref} {title}» y «Open the panel: {url}». Sin novedades: «Nothing waiting.» |
| Editor, sin trabajo | botón «Ask Hermes for a draft» y la nota «Hermes drafts the title, summary and description from this listing's saved details. Nothing changes until you use the text and save.» |
| Editor, esperando | «Hermes is writing a draft (asked {time}).» y el botón «Cancel» |
| Editor, borrador | el encabezado del bloque pasa de «Draft with Hermes» a «Draft from Hermes», con sus tres campos y los botones «Use this text» y «Discard» |
| Tras usarlo | «Draft copied into the title, summary and description. Check them, then Save.» Si el formulario tiene esos campos cambiados sin guardar, antes pregunta «Replace the title, summary and description you are editing with Hermes's draft?» |
| Falló | «Hermes couldn't write the last draft.» junto al botón para pedir otro |
| Hermes callado | «Hermes last checked in {date time}.» si hace más de 15 minutos |
| Barra de pausa | «Sending to clients and agencies is paused (asked by {Hermes o el email} on {date time}). Nothing is sent until someone resumes it here.» y el botón «Resume sending» |

## 4. La puerta de Hermes

Todas con `Authorization: Bearer <HERMES_KEY>`, `cache-control: no-store` y JSON.

| Operación | Respuesta |
|---|---|
| `GET /api/hermes/status` | contadores del panel (`action`, `new_applicant`, `viewing`, `matched`, `sales`, `rentals`, `expiring`, `to_confirm`), `drafts_waiting`, la lista `to_confirm_listings` [{id, title, link}], `outbound` y el `summary` de texto (H14) |
| `GET /api/hermes/news?after=N` | avisos con id mayor que N [{id, text, link}], 50 como mucho, y `cursor`. Sin `after`: ninguno y el cursor actual, para no mandar el historial al arrancar. Un `after` mayor que el último aviso devuelve el cursor al último |
| `POST /api/hermes/jobs` `{kind: "listing_text", listing: "HE-R027"}` | `201 {id}`; `409 {id}` si ya hay uno abierto; `404` si la ficha no existe, no está publicada o está archivada |
| `POST /api/hermes/jobs/next` | toma el trabajo más antiguo: `{job: {id, kind, listing: {…C0}}}` o `{job: null}` |
| `POST /api/hermes/jobs/:id/draft` `{title, summary, description}` | solo un trabajo en `working`; los mismos límites que el editor (200, 5.000 y 20.000 caracteres), al menos un campo con texto, cuerpo de 160 KB como mucho → `{link}` a la ficha en el panel |
| `POST /api/hermes/pause` | `{outbound: {paused: true, at, by: "hermes"}}` |

Cualquier otra ruta bajo `/api/hermes` responde 404 (tras comprobar la llave: 401 sin ella).

**El panel** (sesión de Google y mismo origen, como el resto): `GET /api/admin/jobs?listing=ID` (`{job, hermes_at}`), `POST /api/admin/jobs` (pedir), `POST /api/admin/jobs/:id/use`, `POST /api/admin/jobs/:id/discard` y `POST /api/admin/outbound/resume`. Los contadores del panel ganan `outbound` (`null` o `{at, by}`).

## 5. Diseño (DESIGN.md)

- El bloque del borrador va en la sección Description del editor, encima del resumen, solo en una ficha publicada. Usa `.btn.ghost.sm` y `.btn.sm`; el borrador, en un recuadro con el borde `line` y radio pequeño, sin sombra (no es una segunda tarjeta). Sus textos se muestran como texto (React), nunca como HTML.
- La barra de pausa es `.warn` con su botón `.btn.ghost.sm` de 32px, arriba de cada pantalla del panel, con `role="status"`.
- Mensajes como `<p role="status" class="ok">` o `role="alert" class="err"` junto a la acción.
- Sin tokens, fuentes, librerías ni atributos `style=` nuevos. Espacios 4/8/12/16/24. Objetivos de 32px en el panel.

## 6. Esta entrega (rama `hermes/aut-13`)

1. Migración 0018: la tabla `jobs` y sus índices.
2. La puerta de Hermes (§4) con su llave, el registro de su última petición y la pausa.
3. Las rutas del panel, la barra de pausa con «Resume sending» y el bloque del borrador en el editor.
4. El intermediario de la llave (`hermes/key-proxy.mjs`, H4), con su prueba: Node sin dependencias, lee la llave de un archivo, escucha solo en la red interna que se le dé (si acaba escuchando en todas las interfaces, se cierra, se escriba como se escriba `LISTEN_HOST`) y solo reenvía `GET` y `POST` de `/api/hermes/…`, quitando las cabeceras `authorization`, `cookie` y `host` que traiga. Si el cuerpo pasa de 160 KB, responde 413 y cierra sin leer el resto. Cómo se instala: el plan, «Installation notes».

## 7. Lo que queda (fuera de esta entrega)

- **Luis:** PRE-32 con la comprobación de H3; crear el bot con @BotFather; reunir los números de usuario de Telegram del equipo y que cada uno active la verificación en dos pasos.
- **Instalación en el VPS** (con Docker y las llaves del VPS y de Cloudflare, que el taller no tiene): poner `HERMES_KEY` en Cloudflare; instalar el Hermes de Hampton en su jaula (sin terminal ni código, memoria y skills propias apagadas, conversaciones borradas a los 30 días) con salida solo al modelo, a `api.telegram.org` y al intermediario; el intermediario en la red interna con la llave como secreto de Docker; las tareas de Hermes: `news` cada minuto o dos, `status` a las 08:00 de Europe/Jersey sin horario de silencio (H1), y `jobs/next` cada minuto o dos.
- **AUT-14:** los usuarios permitidos del bot, la instrucción de no usar datos de clientes y la guía corta para el equipo.
- **PUB-13, resto:** textos para redes, textos alternativos, etiquetar y limpiar fotos, y marcar las frases que no salen de un campo.
- **AUT-01:** la pantalla Automations con la última petición de Hermes, el aviso si deja de pedir trabajo y el botón Pause all outbound.
- Un límite de peticiones a `/api/hermes` en el WAF cuando el dominio esté en Cloudflare.
