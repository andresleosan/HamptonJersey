# Arquitectura Hampton App

> Propuesta para convertir la web y el panel de Hampton Estates en el sistema de trabajo diario del equipo: aplicantes, propiedades, otras agencias, visitas, alquileres gestionados, publicación, mensajes, tours 3D y analítica. Parte del texto «Hampton APP» de Luis y crece sobre lo que ya está en producción en el repo HamptonJersey.
>
> Versión 1 · 23-oct-2026 · Preparada por Claude para Luis · Borrador: nada de esto está aprobado ni construido · Base: HamptonJersey en `ada40e3` (Cloudflare Pages + D1 + R2 + panel `/admin`)
>
> Añadido el 29-oct-2026: §6.5 (plan de ChatGPT de cada empleado), decisión P-17 y pregunta 14. Añadido el 30-oct-2026: §6.6 (Hermes, el cerebro de IA de las automatizaciones, con Telegram), decisión P-18 y preguntas 15 y 16; ese mismo día Luis las respondió y aprobó el diseño del Hermes propio de Hampton. Lo construido y lo pendiente está en [ESTADO.md](ESTADO.md) y en el [checklist](checklist-hampton-app.html). La versión HTML de este documento sigue siendo la del 23-oct.

## 0. Lo esencial

Tu texto describe bien qué tiene que pasar. Le faltaba el cómo que evita trabajo repetido: dónde vive cada dato, quién cambia cada estado y qué ocurre cuando algo no llega. Estos son los ocho cambios de fondo:

| # | Cambio | Por qué | Efecto en el día a día |
|---|---|---|---|
| 1 | Un **inventario único del mercado de Jersey** en lugar de una investigación por aplicante | El mercado es pequeño: Places.je muestra unos 1.640 anuncios en venta y 340 en alquiler, y Homely.je trabaja con 42 agencias (observado el 23-oct-2026). Leerlo una vez al día sirve a todos los aplicantes a la vez, y Places.je tiene una API pública para hacerlo con permiso | Un aplicante nuevo ve coincidencias en minutos, sin coste de IA por aplicante y sin propiedades repetidas |
| 2 | Separar **Propiedad, Anuncio y Match** | Tus «estados de propiedad» describen la relación propiedad × aplicante. Guardados en la propiedad, dos aplicantes para la misma casa se pisan | Cada aplicante tiene su estado con cada casa; la disponibilidad se guarda una sola vez |
| 3 | Preguntar a cada agencia **una vez por casa**, en un correo diario, con un **acuerdo de comisión** negociado una sola vez | Con 3 aplicantes para la misma casa saldrían 3 correos y 3 negociaciones | Una respuesta de la agencia actualiza a todos los aplicantes de esa casa |
| 4 | Un **registro de eventos** como columna vertebral | Avisos, historial, auditoría, analítica y disparadores necesitan lo mismo: qué pasó, cuándo y quién | Una tabla en lugar de cinco sistemas; el historial de cada ficha sale solo |
| 5 | El aplicante **se atiende solo** desde un enlace personal | «Waiting for applicant response» hoy significa llamar y esperar | Sus clics (reservar, descartar, preguntar) cambian los estados sin que nadie teclee |
| 6 | **IA solo donde el dato no tiene forma**, por API y según la clase del dato | Filtros, plazos y pagos son reglas exactas: SQL no se equivoca y no cuesta | Menos errores, coste bajo y medible, datos sensibles fuera de la nube |
| 7 | **Autonomía graduable** en cada automatización | Una automatización nueva se equivoca al principio | Borrador, luego aprobación con un clic, luego automático con muestreo |
| 8 | **Crecer sobre HamptonJersey**, sin segundo backend | Ya hay catálogo, panel con Google, bandeja de visitas, D1, R2 y Turnstile en producción | Lo nuevo son tablas D1, rutas `/api`, pantallas del panel y un Worker con cron |

## 1. Punto de partida

### 1.1 Lo que ya existe y se reutiliza

| Pieza | Estado (fuente) | Papel en esta arquitectura |
|---|---|---|
| Web pública + panel `/admin` en Cloudflare Pages `hamptonjersey` | En producción; el push a `main` despliega (repo) | Se amplía; no se rehace |
| D1 `hampton`: `listings`, `media`, `viewing_requests`, `admins`, `tours`, `deleted_listings`, `research_*` | En producción (migraciones 0001–0007) | `listings` sigue siendo el catálogo propio; `viewing_requests` evoluciona a `viewings`; `admins` a `staff` |
| R2 `hampton-media`; el CHECK de la BD impide publicar fotos con `origin='external'` | En producción | La regla se extiende a todo lo que venga del mercado; hoy no cubre las fotos de los paquetes de agencias (§7.5) |
| Login con Google (Firebase) + cookie HMAC de 8 h; un solo rol | En producción | Se añade el rol `owner` para lo sensible |
| Reserva de visitas con Turnstile: 5 horas fijas (10:00, 11:30, 14:00, 15:30, 17:00), lunes a sábado, presencial o videollamada, agente como texto libre | En producción (`server/viewings.js`); sin control de choques ni aviso por email | Se sustituye por disponibilidad real por negociador (§5.9) |
| `Hampton_Database`: 47 registros, 135 fuentes, 896 hechos con confianza, 205 incidencias, 239 búsquedas hechas con dos sistemas | Instantánea del 5-oct (README y SQLite) | Su modelo «fuente → hecho → confianza → incidencia» es el que necesita la búsqueda para aplicantes |
| Paquetes de 9 agencias recogidos de sus webs públicas el 8-oct (5 con datos: 264 fichas importadas como archivadas; 3 bloquearon la recogida con robots.txt o un 403) | 8-oct (cerebro y README de los paquetes) | Son inventario de mercado, no stock propio ni prueba de un acuerdo; qué hacer con ellos lo decide la pregunta 1 del §12 |
| Directorio `jersey-scout`: 97 empresas de Jersey, 58 con email y 76 con web | Export del 9-jun | Contactos iniciales de agencias |
| faster-whisper y ollama (gemma4:12b) en el VPS de Optimyze | En el VPS | Carril privado para notas de voz y datos sensibles |
| Hermes Agent (Nous Research, código abierto) en el VPS de Optimyze | Instalado el 29-oct-2026 en un contenedor aislado, solo accesible por el tailnet; todavía sin conexión con Hampton App ni Telegram | Cerebro de IA de las automatizaciones, con Telegram para hablar con él (§6.6, añadido el 30-oct-2026). Hampton tendrá su propio Hermes en el mismo VPS, todavía sin instalar |

El proyecto SDD de `/root/Hampton` (Astro, specs 001–009, sin publicar) sigue aparte y esta propuesta no lo toca. Una restricción práctica: el contenedor donde trabaja Claude no tiene cron ni systemd, así que todo lo programado vive en Cloudflare y no depende de que haya una sesión abierta.

### 1.2 Supuestos (míos, a confirmar)

- **S1.** Hampton busca casas para sus aplicantes también entre los anuncios de otras agencias y cobra repartiendo comisión (lo dice tu texto).
- **S2.** El equipo es pequeño (en la web aparecen dos personas). El sistema tiene que funcionar sin alguien dedicado a operarlo.
- **S3.** Hampton quiere ofrecer gestión de alquileres. No sé si ya la ofrece ni para cuántas propiedades.
- **S4.** Optimyze construye y opera el sistema; los datos son de Hampton.
- **S5.** Hampton no usa hoy un CRM inmobiliario. Si lo usa, conviene integrarse con él en vez de duplicarlo.

### 1.3 Decisiones ya tomadas que se respetan

- **D6** un solo rol (propongo añadir `owner`, ver P-12) · **D9** borrar = archivar · **D15** las visitas se guardan en D1 con Turnstile · **D16** fotos y tours de otras agencias nunca públicos (hoy el CHECK solo lo garantiza para `origin='external'`, ver §7.5) · **D19** todo en inglés: web, panel y mensajes de la API.
- El push a `main` despliega producción: solo con el sí explícito de Luis, y las migraciones se aplican en remoto antes del push.
- Por D19, los nombres de pantallas, estados y botones van en inglés en este documento; la explicación va en español.

## 2. Mapa del sistema

```capas
Público · internet | Web y fichas | Registro de aplicantes | Portal del aplicante | Reserva de visitas | Valoración y «List your property» | Chat web
Panel del equipo · /admin | Action inbox | Applicants | Properties | Agencies | Viewings | Listings | Lettings | Messages | 3D tours | Insights | Automations
Motor · Cloudflare | D1 (fuente de verdad) | Tabla events | Matching en SQL | Worker de tareas (cron cada 10 min) | R2 (fotos, vídeos, tours) | Puerta para Hermes (§6.6)
Carril privado · VPS de Optimyze | Hermes, cerebro de IA (§6.6) | Modelos locales para datos sensibles | Transcripción de notas de voz | Preparación de tours 3D | El VPS pide trabajo; no abre puertos
Servicios externos | API de Places.je | Correo de Hampton | WhatsApp Business | Meta (Facebook, Instagram) | Google o Outlook Calendar | Banco (CSV) | Firma electrónica | GPU por horas | Telegram (Hermes)
```

Cómo encaja con lo que hay:

- **Pages sigue sirviendo** la web, el panel y `/api`. Un Worker hermano, `hampton-jobs`, comparte la misma D1 y hace lo que Pages no puede: tareas programadas (Cron Triggers), recepción de correos (Email Workers) y colas si algún día hacen falta.
- **Un solo reloj.** El Worker corre cada 10 minutos y ejecuta consultas de «lo que venció»: seguimientos a agencias, recordatorios, pagos atrasados, fichas por confirmar. El estado vive en D1, así que si una ejecución falla, la siguiente lo recoge. No hace falta un motor de flujos.
- **Carril privado sin puertos.** Cuando una tarea debe hacerse con modelos locales, la API la deja en la tabla `jobs`; un proceso del VPS pregunta cada minuto por HTTPS con un token de servicio, la hace y devuelve el resultado. El VPS sale hacia Cloudflare; nadie entra al VPS. Encaja con la postura de solo Tailnet. Luis eligió después otro camino para los modelos locales (decisión A2 del spec F0): Cloudflare llega a Ollama en el VPS por un túnel privado, también sin abrir puertos. Desde el 30-oct-2026, Hermes (§6.6) será además un proceso del VPS que pide a la app el trabajo de IA con datos públicos; los datos sensibles nunca pasan por él.
- **AI Gateway** de Cloudflare es la puerta única a los modelos: registra cada llamada con su coste y la automatización que la hizo, y permite cambiar de modelo sin desplegar. Desde el 30-oct-2026 la IA pasará por Hermes (P-18, §6.6) y AI Gateway deja de ser la puerta principal.

### 2.1 Un aplicante de punta a punta

```flow
Se registra en la web → Matching contra el inventario → Revisión del equipo → Correo a la agencia → La IA lee la respuesta → Aviso al aplicante → Reserva desde su enlace → Recordatorios → Visita → Feedback → Offer / Application → Agreed
```

Lo que hace una persona en ese recorrido: revisar coincidencias (o aprobarlas en lote), resolver las respuestas de agencias que la IA no entendió con seguridad, hacer la visita y negociar. El resto lo mueve el sistema.

## 3. Modelo de datos

Todo en D1; los archivos en R2. La columna Fase indica cuándo se crea cada tabla (§9).

| Tabla | Qué guarda | Campos clave | Fase |
|---|---|---|---|
| `contacts` | Cualquier persona: aplicante, propietario, inquilino | nombre, email, móvil en formato internacional, canal preferido, idioma, consentimientos con fecha y origen, fecha de borrado prevista | F0 |
| `applicants` | Una búsqueda de un contacto (una persona puede tener dos: alquilar ya y comprar después) | operación, presupuesto y flexibilidad, dormitorios, baños, tipo, parroquias deseadas y excluidas, mascotas, plazas de parking, exterior, amueblado, fecha de entrada, duración, estatus de vivienda, situación de compra, requisitos libres + etiquetas, etapa, origen, responsable | F0 |
| `staff` (evoluciona de `admins`) | El equipo | email, nombre, rol (`owner` o `staff`), móvil, foto, calendario, si enseña casas | F0 |
| `events` | Todo lo que pasa | cuándo, quién (persona, sistema, aplicante, agencia), entidad, tipo, datos | F0 |
| `notifications` | Lo que cada persona debe ver o hacer | evento, destinatario, categoría, `action_required`, `due_at`, `resolved_at`, leída | F0 |
| `properties` | La casa física, una sola vez aunque la anuncien tres agencias | dirección normalizada, parroquia, código postal, tipo, dormitorios, baños, parking, mascotas (sí, no, desconocido), categoría de vivienda, tenencia, estado, `last_verified_at` | F1 |
| `market_listings` | Cada anuncio visto en cada fuente | fuente, URL, referencia externa, precio normalizado, datos extraídos y su confianza, `first_seen`, `last_seen`, `removed_at`, huella de la foto principal, `property_id` | F1 |
| `listings` (existe) | El catálogo propio publicado | + `property_id`, campos de Jersey (§5.10), `confirmed_at` (§4.4; construido el 30-oct-2026, en lugar de `review_due_at`) | F1 y F4 |
| `matches` | Aplicante × propiedad | puntuación, lista de requisitos ✅ ❌ ❓ con evidencia, estado, motivo de descarte, `introduced_at` | F1 |
| `agencies` | Otras agencias | web, emails de ventas y alquileres, teléfonos, acuerdo de comisión (estado, condiciones, vigencia, documento), permiso para enseñar fotos, tiempo medio de respuesta | F2 |
| `outreach` | Cada consulta a una agencia sobre una casa | preguntas hechas, envío, hilo del correo, respuesta interpretada (JSON), seguimientos, estado | F2 |
| `availability_snapshots` | Copia congelada de la ficha y de la respuesta cuando se confirma la disponibilidad | propiedad, fecha, datos, texto de la respuesta | F2 |
| `viewings` (evoluciona de `viewing_requests`) | Visitas | propiedad, aplicante, negociador, inicio y fin, tipo, estado, confirmaciones, feedback de ambos lados, resultado | F3 |
| `availability_rules`, `availability_exceptions` | Horario de cada negociador | plantilla semanal, excepciones por fecha, duración de visita, margen entre visitas | F3 |
| `offers`, `sales` | Ofertas y expedientes de venta | casa, aplicante, importe, condiciones, estado · comprador, vendedor, abogados, hitos con fecha prevista y real | F3 |
| `social_posts` | Publicaciones en redes | ficha, canal, id de la publicación, estado | F4 |
| `tenant_applications` | Solicitudes de alquiler | solicitante, empleo e ingresos (C3), referencias, avalista, estado | F5 |
| `tenancies`, `charges`, `payments` | Contratos, cobros previstos y pagos recibidos | partes, fechas, renta, depósito y su registro, referencia de pago única, régimen legal (ley de 2011 o de 2025), última subida de renta · vencimiento, importe, estado · fecha, importe, referencia, cobro conciliado | F5 |
| `compliance_items`, `maintenance_jobs` | Obligaciones con caducidad y reparaciones | tipo, caduca el, documento · urgencia, categoría, proveedor, coste, aprobación del propietario | F5 |
| `messages` | Conversaciones de todos los canales | canal, hilo, contacto, dirección, texto, adjuntos, borrador de IA, enviado por | F6 |
| `daily_stats` | Contadores por ficha y día | ficha, día, métrica, valor | F7 |
| `capture_jobs` | Tours 3D | ficha, archivos de entrada en R2, estado por etapa, resultados, coste | F8 |
| `jobs` | Trabajo para el carril privado del VPS | tipo, entrada, estado, intentos, resultado | Cuando haga falta |

Reglas para todas las tablas: precios siempre con moneda y periodo (como ya exige `listings`); un dato desconocido es `NULL`, nunca 0; nada se borra de verdad sin pasar por archivado (D9); cada cambio de estado escribe un evento.

**Pendiente de la pregunta 1 (§12).** Si Hampton también anuncia casas cuyo encargo tiene otra agencia, hace falta una tercera categoría además de «propia» y «de mercado»: `listings.instruction = 'co_listed'`, con la agencia, el reparto acordado y el permiso de fotos. Esas casas siguen pasando por la confirmación de la agencia (§5.7), no suben en la puntuación como las propias y solo enseñan fotos con permiso. Si en cambio las 264 fichas son inventario de mercado, F1 empieza migrándolas a `properties` y `market_listings`, y los datos de Places.je las sustituyen.

## 4. Estados

### 4.1 Aplicante: etapa y cola de trabajo

Tu texto da cuatro estados de aplicante. El problema: un aplicante puede estar «In process» con una casa y tener «New properties found» con otras a la vez, y un solo campo no puede expresarlo. Propuesta en dos capas.

**Etapa** (se guarda; una a la vez):

```flow
New → Searching → Viewing → Offer / Application → Agreed → Completed
salidas: Paused · Lost (con motivo) · Archived
```

**Cola de trabajo** (se calcula a partir de sus matches; puede tener varias etiquetas a la vez). Conserva tus nombres con la ortografía corregida:

| Etiqueta | Significa | Se calcula como |
|---|---|---|
| `Waiting for investigation` | Registrado; la primera búsqueda está en cola | Sin búsqueda completada. Con el inventario dura minutos |
| `Waiting for review` (era «Waiting for reviewing») | Hay resultados y falta la revisión humana | Matches `Found` de la primera búsqueda sin revisar |
| `New properties found` (era «New Properties Founded») | Búsquedas posteriores encontraron casas nuevas | Matches `Found` creados después de la primera revisión |
| `In process` | Al menos una casa espera a la agencia o al aplicante | Matches en `Waiting for agent confirmation` o `Waiting for applicant response` |
| `Viewing booked` (nueva) | Tiene una visita próxima | Visita confirmada en el futuro |
| `No matches` (nueva) | 7 días sin coincidencias | El sistema propone ampliar criterios |
| `Gone quiet` (nueva) | 14 días sin responder | Mensaje automático «Are you still looking?» |

### 4.2 Match: aplicante × propiedad

Aquí van tus «estados de propiedad», que en realidad son de la pareja:

```flow
Found → Shortlisted → Waiting for agent confirmation → Waiting for applicant response → Interested → Viewing booked → Viewed → Offer / Application → Agreed
salidas: Rejected by staff (motivo) · Not available · Not interested (motivo) · No response
```

- `Waiting for agent confirmation` se salta si la casa es de Hampton: su disponibilidad ya se conoce.
- `Waiting for applicant response` se pone solo cuando la agencia confirma, como pedías.
- `Not available` es un hecho de la **propiedad**. Al marcarla, a mano o por la respuesta de una agencia, se cierran a la vez todos sus matches abiertos.
- `Not interested` (era «Not intereses») es de la **pareja**. Lo marca el aplicante con un clic o el equipo, siempre con motivo: precio, zona, tamaño, estado u otro. Los motivos alimentan la puntuación.

### 4.3 Propiedad del inventario

```flow
Detected → Active → Availability confirmed → Under offer / Let agreed → Sold / Let
salidas: Gone (no aparece en la fuente dos pasadas seguidas) · Not available
```

Una casa está `Stale` si su última verificación tiene más de 7 días (alquiler) o 30 (venta): hay que volver a confirmarla antes de mandarla a un aplicante. Al confirmar la disponibilidad se guarda un `availability_snapshot` con la ficha completa y la respuesta de la agencia tal como estaban ese día. Es lo que pedías: los detalles enteros en el momento en que se confirmó la disponibilidad.

### 4.4 Ficha propia del catálogo de Hampton

```flow
Draft → Ready for review → Published → Under offer / Let agreed → Sold / Let
salidas: Withdrawn · To confirm
```

`To confirm` es tu «por confirmar»: una ficha publicada sin cambios en 90 días si es venta, o 30 si es alquiler (configurable). Crea una tarea para llamar al propietario. Se guarda como `review_due_at` y una bandera, sin tocar el campo `availability` que ya existe.

> **Construido el 30-oct-2026 (ADM-04).** Luis eligió 3 meses en venta y 1 mes en alquiler. Se guarda solo la fecha de la última confirmación (`confirmed_at`): la ponen publicar, cambiar la disponibilidad o el precio, los cambios de Sales y el botón «Still available». «To confirm» se calcula al leer, sin bandera ni reloj. El aviso sale en el panel (número junto a Listings y su pestaña), no como tarea del Inbox, y `availability` no se toca.

### 4.5 Visita

```flow
Requested → Confirmed → Reminded → Completed → Feedback received
salidas: Cancelled · No-show · Rescheduled
```

Migración desde lo actual: `new` pasa a Requested, `contacted` a Confirmed y `closed` a Completed o Cancelled según sus notas.

### 4.6 Alquiler gestionado y cobros

```flow
Offer accepted → Referencing → Contract signed → Deposit protected → Active → Renewal due → Renewed
salidas: Notice given → Ended (inventario de salida y devolución del depósito)
```

```flow
Scheduled → Due → Paid
salidas: Part paid · Overdue (pasado el margen) → In arrears → Resolved / Written off
```

## 5. Módulos

Cada módulo sigue el mismo orden: lo que pediste, lo que propongo y cuándo está hecho.

### 5.1 Notificaciones: Action inbox

**Pediste:** pestañas All, New applicants, Matched y Missing payments; los pagos con fecha límite de cobro.

**Propuesta:** dos bandejas.

- **Needs action**: cosas con dueño y plazo (revisar matches, una respuesta de agencia dudosa, confirmar una visita, llamar por un pago atrasado, una ficha `To confirm`). No desaparecen hasta resolverse.
- **Feed**: lo informativo (aplicante nuevo, agencia que confirmó, visita reservada).
- Pestañas por categoría: All · New applicants · Matched · Agency replies · Viewings · Missing payments · Messages · Compliance.
- Cada aviso trae su acción en un clic: Approve, Reply, Call (muestra el número), Snooze, Done.
- **Tiempo real sin complicarse**: el panel consulta cada 30 segundos y el navegador muestra una notificación para lo urgente. Para un equipo de 2 a 4 personas basta.
- **Menos ruido**: avisos agrupados («5 new matches for this applicant»), resumen por email a las 8:00 de Jersey, preferencias por persona.
- **Missing payments con fecha límite**: cada cobro tiene `due_date` y un margen (`grace_days`, 3 por defecto). Pasado el margen sin pago conciliado, aparece aquí. Incluye también las comisiones que otras agencias deben a Hampton.

**Hecho cuando:** cada tipo de evento genera su aviso en menos de un minuto, y un aviso de Needs action solo se va al resolverlo.

### 5.2 Seguimiento de aplicantes

- **Lista**: filtro To Let / To Buy, como pediste; orden por fecha de solicitud, de la más nueva a la más antigua o al revés; columnas Name, Phone, Applied, Stage, cola de trabajo, Matches (encontradas · confirmadas · disponibles), Last contact y Assigned to.
- **Filtros extra**: necesita revisión, presupuesto, parroquia, responsable y origen.
- **La tarjeta se entiende sin abrirla**: «Searching · no matches yet (last search 2 h ago)» o «12 found · 3 confirmed · 2 available».
- **Ficha** con pestañas: Requirements (editable; al cambiar se recalcula el matching), Matches (Found, Shortlisted, Confirmed y Available, con la lista ✅ ❌ ❓ de cada casa), Timeline, Messages y Viewings.
- **Acciones rápidas**: Send shortlist, Book viewing, Pause search y Widen criteria (enseña cuántas casas más saldrían con un 10 % más de presupuesto o una parroquia más).

### 5.3 Seguimiento de propiedades

- **Tarjeta**: estado, precio con su periodo, dirección (calle y parroquia), dormitorios, baños y fecha de disponibilidad, como pediste; además la fuente (Hampton o agencia), «checked 2 days ago», aplicantes con match e interesados.
- **Ficha**: Overview, History (todos los eventos), Availability snapshots, Matched applicants con su estado, Photos (las externas, privadas), Adverts (todos los anuncios de esa casa en todas las fuentes, con su precio, así se ven las bajadas), Viewings y Notes.
- **Filtros**: To Buy / To Let, dormitorios, parroquia (las doce), rango de precio, estado, fuente y «cambió en los últimos 7 días».

### 5.4 Registro de aplicantes paso a paso

Principios: móvil primero, una pregunta por pantalla con opciones que se tocan, unos dos minutos en total, guarda el avance, Turnstile y consentimiento explícito. El mismo asistente sirve dentro del panel para registrar a quien llama o entra en la oficina (`source: phone` o `walk-in`).

| Paso | Pregunta | Campos |
|---|---|---|
| 1 | What are you looking for? | To Let / To Buy (Commercial más adelante) |
| 2 | Where? | Parroquias deseadas (las doce como fichas), parroquias o zonas que no quiere, «near…» (trabajo, colegio) en texto |
| 3 | What kind of home? | Tipo (flat, house, cottage, studio), dormitorios mínimos e ideales, baños mínimos, plazas de parking (0, 1, 2, 3+), exterior (jardín, terraza, balcón), amueblado (alquiler), mascotas (ninguna, gato, perro, otra, y cuántas) |
| 4 | Budget and timing | Máximo (y mínimo); «I can stretch to…»; alquiler en £ al mes; fecha de entrada; duración del contrato. Compra: situación (primera vivienda, nada que vender, necesita vender, al contado) e hipoteca aprobada en principio (sí, no, en trámite) |
| 5 | Eligibility in Jersey | Estatus de vivienda (Permanent Entitled, Entitled, Licensed, Licensed for Lease Only, Entitled for Work Only, Standard, Not sure) con una línea que explica por qué se pregunta (§7.3); si compra, si es su primera vivienda; quiénes vivirán (adultos, niños) |
| 6 | About you | Nombre, email, móvil, canal preferido (WhatsApp, llamada, email), mejor hora, idioma, «Anything else that matters?» en texto libre, consentimientos |

- **Resultado inmediato**: al enviar ve «We found 7 homes that match right now. We will confirm availability and contact you within X hours», con el enlace a su portal. Hampton fija la X.
- **Requisitos libres a etiquetas**: la IA convierte el texto en imprescindibles y deseables («quiet street», «near Victoria College»); el equipo las confirma en la ficha.
- **Duplicados**: mismo email o móvil es el mismo contacto; si la operación es otra, se crea otra búsqueda.
- **Lo que no se pide aquí**: ingresos, empleador o documentos de identidad. Eso pertenece a las referencias de un alquiler concreto, con más protección (clase C3, §6.3).
- **Alertas para visitantes**: «Save this search» con solo email y criterios. Usa el mismo motor y convierte visitantes en aplicantes.

Tus nueve campos están todos: nombre, email, móvil, presupuesto, dormitorios y baños, zona ideal y no deseada, mascotas, parking con número de plazas y requisitos personalizados. Añado operación, tipo, exterior, amueblado, fechas, situación de compra, estatus de vivienda, hogar, canal e idioma porque sin ellos el matching propone casas que el aplicante no puede o no quiere.

### 5.5 Búsqueda de propiedades: el inventario del mercado

**Pediste:** una «Deep Research» la primera vez; después una búsqueda diaria con modelos baratos y dos investigaciones con modelos distintos para comparar, sin repetir lo que ya está en la base.

**Propuesta:** darle la vuelta. En vez de buscar para cada aplicante, el sistema lee el mercado una vez al día y cruza a todos los aplicantes contra él.

1. **Fuentes, de mejor a peor** (detalle y términos en §7.3):
   - **La API pública de Places.je**: anuncios de muchas agencias ya estructurados (agencia, precio, dormitorios, parroquia, estado, `property_key`), con permiso y sin leer HTML. Unos 2.000 anuncios disponibles caben en unas 20 peticiones. Exige clave desde el 2-nov-2026: hay que pedirla ya. Su directorio de agencias y agentes alimenta `agencies`, y su historial de transacciones da comparables para las valoraciones (§5.10).
   - Exportaciones o feeds que las agencias acepten mandar, para lo que no esté en Places.je. Los propios README de los paquetes de octubre lo concluyen: las agencias que bloquean la recogida automática solo entran con un export o feed autorizado. Pedirlo dentro del acuerdo de comisión es un trato justo, porque Hampton les trae compradores e inquilinos.
   - Webs de agencias, solo si sus términos lo permiten, con baja frecuencia, respetando `robots.txt` y con un user-agent identificado.
   - Otros portales, solo con permiso escrito. Homely.je lo prohíbe expresamente.
2. **Pasada diaria** a las 06:00 de Jersey y otra a mediodía para alquileres: descargar, extraer, normalizar, deduplicar, comparar con ayer y cruzar.
3. **Extracción**: lo que llega por API o feed ya viene estructurado. Para páginas web, un lector específico por fuente cuando la página es estable (gratis y exacto); si no, IA barata con un esquema JSON fijo. Solo se procesan las páginas que cambiaron, comparando una huella del contenido.
4. **Normalización**: precio a libras al mes o total; parroquia desde la dirección o el código postal; dormitorios y baños como números; mascotas, parking y amueblado como sí, no o desconocido.
5. **Deduplicación**: primero la `property_key` de Places.je cuando exista; después dirección normalizada + parroquia + dormitorios + precio ±10 % + huella de la primera foto. Las agencias suelen usar las mismas fotos del propietario, así que la huella de imagen detecta la misma casa aunque cambie el texto.
6. **Comparación con ayer**: casa nueva, cambio de precio o desaparecida, cada una como evento. Dos pasadas sin verla la marcan `Gone` y sus matches se cierran solos como `Not available`.
7. **Cruce** con todos los aplicantes activos (§5.6). Un aplicante nuevo se cruza en el momento contra el inventario que ya existe.

**Verificación**: nada entra sin una página descargada que lo respalde (URL y fecha). La IA solo extrae de páginas reales, así que no puede «encontrar» casas que no existen. Los valores fuera de rango o con baja confianza quedan marcados para revisión.

**Dónde sí uso dos modelos**: en la extracción, si dos modelos baratos no coinciden en precio o dormitorios, el dato queda en «needs review» en lugar de adivinar. En la Deep Research, la unión de dos sistemas encuentra más resultados, y cada uno se verifica contra su página. Dos modelos pueden coincidir y estar equivocados a la vez; la referencia es la página descargada.

**Cuándo usar Deep Research**: si el inventario da menos de 3 casas, si el requisito es raro (caballerizas, cocina industrial, local con licencia) o para compras fuera del mercado. Lo que encuentre entra al inventario con su fuente y sirve también a los demás aplicantes. El modelo de evidencia de `Hampton_Database` (fuente, hecho, confianza, incidencia y registro de búsquedas) es justo este patrón y ya está probado.

**Hecho cuando:** la pasada diaria termina sola y registra, por fuente, cuántos anuncios leyó y cuántos son nuevos, cambiados o desaparecidos; y un aplicante nuevo ve coincidencias en menos de 5 minutos.

### 5.6 Matching y revisión humana

- **Filtros duros (SQL)**: operación; precio menor o igual que el máximo por (1 + flexibilidad); dormitorios y baños mínimos; fuera de las parroquias excluidas; categoría de vivienda compatible con su estatus (§7.3); mascotas (si la ficha dice «no pets» y el aplicante tiene perro, queda fuera; si no lo dice, sigue con ❓); parking y fecha de disponibilidad, con la misma lógica.
- **Puntuación de 0 a 100**: parroquia preferida, dormitorios ideales, exterior, amueblado, posición del precio dentro del presupuesto, frescura del anuncio y requisitos libres (la IA compara la descripción con las etiquetas y cita la frase que lo prueba). Las casas de Hampton suben, porque no hay comisión que repartir.
- **Lista ✅ ❌ ❓ por casa**: es tu «indicar si no posee alguno de los requisitos», con evidencia («Pets: the advert says "no pets"» → ❌).
- **Los ❓ se convierten en preguntas** del correo a la agencia («Are pets allowed? Is parking included?»).
- **Cola de revisión rápida**: ordenada por puntuación; teclas A para aprobar, R para descartar (motivo en un toque) y S para saltar; aprobación en lote por encima de un umbral.
- **De manual a automático**: el sistema mide cuántas aprueba el equipo por tramo de puntuación. Si, por ejemplo, el 95 % de las de 85 o más se aprueban, propone aprobarlas solas. El equipo decide.
- **Ampliar criterios**: con menos de 3 coincidencias calcula alternativas (10 % más de presupuesto, una parroquia más, un dormitorio menos) y las sugiere al equipo o al aplicante.

### 5.7 Contacto con agencias: disponibilidad y comisión

**Pediste:** un correo automático al agente que administra la propiedad para saber si sigue disponible y si comparte la comisión.

- **Disparador**: matches aprobados de una casa que no es de Hampton. Sale una sola consulta por casa, con independencia de cuántos aplicantes haya; el correo dice «we have N qualified applicants», lo que además da fuerza para negociar.
- **Según el acuerdo con esa agencia** (`agencies.fee_agreement`):
  - `agreed`: solo pregunta disponibilidad, los ❓ y horarios de visita.
  - `none`: primer contacto con presentación, aplicantes interesados, disponibilidad, propuesta de reparto con las condiciones estándar de Hampton y permiso para enseñar datos y fotos al aplicante. Se negocia una vez y queda guardado.
  - `declined`: preguntar o no la disponibilidad es una decisión de negocio, configurable en el panel.
- **Agrupado**: envíos a horas fijas (por ejemplo, 09:00 y 14:00), un correo por agencia con todas sus casas pendientes, desde el buzón real de Hampton y con una referencia en el asunto (`[HE-OUT-1234]`) para enlazar la respuesta. Dos envíos al día porque en alquiler una casa puede irse en horas.
- **Lectura de la respuesta**: la IA devuelve un JSON fijo con disponible (sí, no, no lo dice), desde cuándo, respuestas a los ❓, horarios de visita ofrecidos, comisión (acepta, rechaza o contraoferta, con condiciones), si necesita una persona (contraoferta, queja, tema legal o ambigüedad) y su confianza.
  - Confianza alta: se aplica sola. La propiedad pasa a `Availability confirmed`, sus matches a `Waiting for applicant response` y se guarda el snapshot.
  - Confianza baja: crea una tarea con la interpretación ya rellenada; el empleado confirma con un clic o corrige.
- **Seguimiento**: sin respuesta en 2 días laborables, recordatorio amable automático; tras dos recordatorios, tarea «Call agency» con su teléfono. El panel muestra por agencia la tasa y el tiempo medio de respuesta.
- **Prueba de presentación**: cada consulta y cada respuesta quedan guardadas con fecha («Hampton introduced N applicants for this property on date D»). Es la base para reclamar una comisión si hay disputa.
- **Riesgo de que el aplicante vaya directo**: la lista que recibe no muestra la agencia ni el enlace original hasta que la comisión esté acordada o la visita organizada. Es una política configurable que conviene revisar con un abogado (§7.3).

**Hecho cuando:** una respuesta típica de agencia actualiza la casa y avisa a sus aplicantes sin que nadie teclee, y la lectura acierta en al menos 27 de 30 respuestas reales etiquetadas antes de pasar a automático.

### 5.8 Respuesta del aplicante y su portal

- Cuando un match pasa a `Waiting for applicant response`, el aplicante recibe un mensaje por su canal (WhatsApp con plantilla aprobada, o email) con su enlace: «3 homes confirmed for you».
- **Portal** con enlace personal sin contraseña (token aleatorio guardado con hash, caduca a los 30 días, revocable): tarjetas con fotos (las de Hampton o las que la agencia permita), precio, parroquia, dormitorios y la lista ✅ ❓, con tres botones: **Book a viewing**, **Not for me** (motivo en un toque) y **Ask a question**. Desde ahí también puede cambiar sus criterios, pausar la búsqueda o borrar sus datos.
- Recordatorios a las 24 y 72 horas si no hace nada. A los 7 días el match pasa a `No response` y se le pregunta si sigue buscando; a los 30 días sin actividad, la búsqueda queda en `Paused`.
- Cada clic es un evento que cambia el estado. Al equipo solo le llega un aviso si hay algo que hacer.

### 5.9 Visitas: Arrange Property Viewing

**Pediste:** ver los horarios libres de los negociadores, que el usuario elija día y hora, que vea si otro usuario ya tiene cita ese día (sin sus datos) para animarle a decidir, y que cada negociador marque los días y horas en que está y no está disponible.

- **Disponibilidad**: cada negociador tiene una plantilla semanal (por ejemplo, lunes a viernes de 09:30 a 17:30 y sábado de 10:00 a 13:00) y excepciones por fecha (vacaciones, horas bloqueadas o un hueco extra). Duración por visita (30 minutos por defecto), margen entre casas (15 minutos, más si cambia de parroquia) y máximo de visitas por día.
- **Restricciones de cada casa**: si está ocupada por un inquilino, aviso previo mínimo (por ejemplo, 24 horas) y aviso automático al inquilino; quién tiene las llaves; qué negociadores pueden enseñarla.
- **Página de reserva**: solo huecos reales (disponibilidad del negociador y restricciones de la casa). Los ocupados aparecen como «Booked», sin datos de nadie. Opcional: «2 viewings booked this week», solo con números reales que caducan a los 14 días. Inventar urgencia es una práctica engañosa, así que el contador nunca se infla.
- **Sin dobles reservas**: la reserva se guarda con una sola sentencia SQL que solo inserta si no se solapa con otra cita del mismo negociador (en SQLite es atómica). Si dos personas pulsan a la vez, la segunda ve el hueco ya tomado.
- **Calendario**: la cita se escribe en el Google o Outlook Calendar del negociador, y se leen sus horas ocupadas para no chocar con su agenda personal. El aplicante recibe una invitación de calendario.
- **Recordatorios** a las 24 y 2 horas con botones Confirm, Reschedule y Cancel. Si a 2 horas de la visita sigue sin confirmar, se avisa al negociador.
- **Visitas en bloque**: si varias personas quieren la misma casa, el sistema propone huecos seguidos o una «open viewing» (las fichas ya tienen la línea «Open viewing: fecha»). Ahorra viajes.
- **Después de la visita**: a la hora, el aplicante recibe un formulario con las tres opciones de tu texto: **Proceed** (oferta o solicitud), **Need more information** y **Not interested** (con motivo). El negociador deja una nota de voz desde el móvil; se transcribe en el VPS con faster-whisper (puede contener datos personales) y queda resumida en el historial.
- **Contador de interesados**, como pediste: por casa, cuántas personas tienen interés activo (visita reservada o hecha, «Proceed» o «Need more information»). El equipo puede quitar a alguien, con motivo, y el interés caduca solo. La web lo muestra solo si es 2 o más y es real.
- **Informe para el propietario**: resumen semanal automático con vistas, consultas, visitas y temas del feedback. Evita la llamada de «¿cómo va?».
- **Casas de otras agencias**: la visita la organiza la agencia; el sistema le propone tres horarios en los que el aplicante puede.
- **De lo actual a lo nuevo**: el formulario actual se mantiene; las 5 horas fijas (`TIMES`) se sustituyen por `/api/slots` y el texto libre `agent` por el negociador real.

### 5.10 Publicación de propiedades propias

**Pediste:** recoger todos los datos de una propiedad nueva y, al tenerlos, publicarla sola en la web y en redes, con seis familias de datos.

- **Captación**: el formulario público «Book a valuation» crea un contacto propietario y una cita en el mismo calendario de §5.9. Para preparar la valoración, el historial de transacciones de Places.je da comparables reales, y los datos de demanda de §5.14 ayudan a convencer al propietario.
- **Alta desde el móvil durante la valoración** («New instruction» en el panel): secciones por familia de datos, subida de fotos con control de calidad (resolución, desenfoque, oscuridad, líneas torcidas), plano y documentos.
- **Campos obligatorios según la operación** y porcentaje completado. Con menos del 100 % de lo obligatorio no se puede publicar.
- **Tus seis familias, adaptadas a Jersey**. La lista original era de España: IBI, comunidad, fianza, Idealista o Fotocasa no aplican aquí.

| Familia | Campos |
|---|---|
| 1. Identificación y ubicación | Dirección, parroquia, código postal JE, referencia HE-…, operación (venta, alquiler, traspaso de negocio), estado (obra nueva, segunda mano, a reformar), promotor si es obra nueva |
| 2. Características | Superficie interior en pies² y m², dormitorios, baños, aseos, salones, parking (plazas, garaje), trastero, planta y plantas del edificio, ascensor, año, estado de conservación, calefacción (gasoil, gas, eléctrica, bomba de calor, GLP), doble acristalamiento, exterior (jardín, terraza, balcón, patio), comodidades (piscina, gimnasio, zonas comunes), amueblado y mascotas en alquiler |
| 3. Económicos | Precio de venta, renta mensual, o premium más renta si es un negocio; precio por pie² calculado; depósito (alquiler); parish rates si se publican; service charge (pisos); suministros incluidos; fecha de disponibilidad |
| 4. Legal y técnico | Tenencia (freehold, flying freehold, share transfer, leasehold), categoría de vivienda (§7.3), licencia de vivienda en alquiler si aplica, certificado energético si existe, ocupación (vacía, alquilada), abogado del vendedor |
| 5. Marketing | Título, descripción en inglés, galería, vídeo, tour 360 o 3D, plano, destacada (`featured_rank` ya existe), etiquetas (renovated, sea view, town centre…), textos para redes |
| 6. Estado y trazabilidad | Estado, IDs en portales, vistas, consultas, visitas, guardados, fecha de publicación, `confirmed_at` (§4.4), motivo de retirada |

- **Ayuda de IA**: con los campos y las fotos redacta título, descripción, puntos fuertes, textos para redes y textos alternativos, y etiqueta cada foto por estancia. Una persona aprueba. Regla: no inventa datos y marca cualquier frase que no salga de un campo.
- **Fotos**: se pueden quitar objetos temporales (personas, trípode, desorden); nunca defectos permanentes. Esconder una grieta o tapar una vista es describir mal la casa.
- **Idioma**: inglés, por D19. Las traducciones (por ejemplo, al portugués) solo si Hampton las pide y revisadas por una persona.
- **Un botón Publish**: la web al momento (ya existe), sitemap y datos estructurados para buscadores y asistentes de IA, Facebook e Instagram por la API de Meta (carrusel, texto y enlace) y, opcionalmente, un vídeo vertical generado con las fotos. Portales por feed donde Hampton tenga cuenta.
- **Los cambios de estado se propagan**: `Under offer` y `Let agreed` cambian la etiqueta en la web y pueden generar la publicación «Let agreed».
- **Tu regla de los 3 meses** queda como `To confirm` (§4.4). Para las casas de otras agencias no hace falta: el inventario detecta solo cuándo desaparecen (§5.5).
- **Salud de la ficha**: muchas vistas y pocas consultas sugieren revisar el precio o las fotos; el sistema avisa al equipo.

### 5.11 Gestión de alquileres

**Pediste:** un protocolo para seguir las propiedades con servicio de administración de inquilinos, que cada nuevo Lease Agreement quede en la base de datos y que se envíen notificaciones. Los mensajes de redes pasan a §5.12 y la regla de los 3 meses a §5.10.

- **Alta de una propiedad gestionada**: propietario, condiciones (porcentaje de gestión), documentos de cumplimiento, llaves y datos bancarios para liquidar (acceso solo para `owner`).
- **Nuevo contrato**, desde `Let agreed`: partes, fechas, renta y día de pago, depósito (importe, esquema, fecha de registro y referencia), contrato firmado con firma electrónica, inventario con fotos y lecturas de contadores. El calendario de cobros se genera solo.
- **Cobros y Missing payments**:
  - Cada contrato tiene una **referencia de pago única** (por ejemplo, `HE-T0042`) que el inquilino pone en su transferencia.
  - Se importa el extracto del banco en CSV (a diario o cuando se suba) y se concilia por referencia e importe; lo que no casa va a la cola «Unmatched payment».
  - Secuencia de atraso configurable: día +1 recordatorio amable, +5 recordatorio firme, +7 tarea de llamada, +10 aviso al propietario y +14 carta formal con plantilla.
  - Liquidación mensual al propietario (rentas menos honorarios y reparaciones) en PDF, enviada sola al cerrar el mes.
- **Calendario de cumplimiento por propiedad**: cada obligación con caducidad avisa a 60, 30 y 7 días, y si vence aparece en rojo en la bandeja. La lista concreta para Jersey está en §7.3.
- **Reparaciones**: el inquilino avisa desde su portal o por WhatsApp con fotos; la IA clasifica urgencia (emergencia, urgente, rutina) y tipo; una emergencia (fuga, sin calefacción en invierno, cerradura) avisa al equipo al instante; se asigna un proveedor del directorio; el propietario aprueba si se supera un importe; la factura pasa a la liquidación.
- **Inspecciones** cada 6 meses, programadas solas, con una lista en el móvil, fotos e informe al propietario.
- **Renovación** a 90 días del fin: pregunta al propietario (renovar, revisar la renta) y al inquilino (quedarse) con botones. Si el inquilino se va, se crea un borrador de ficha copiando la anterior para anunciarla antes de que quede vacía.
- **Asistente de revisión de renta**: calcula la subida máxima legal (tope RPI, una vez cada 12 meses) y la primera fecha posible con 2 meses de aviso, y prepara la carta. Tiene en cuenta si el contrato sigue con la ley de 2011 o con la de 2025 (§7.3).
- **Salida**: inventario de salida contra el de entrada, propuesta de deducciones y devolución del depósito a través del esquema.
- Los plazos legales (registro del depósito, preavisos, licencias) son **parámetros**, no código, y los valida un abogado de Jersey.

### 5.12 Mensajes: Facebook, Instagram, WhatsApp, web y email

- **Una bandeja** para Messenger e Instagram (webhooks de la API de Meta), WhatsApp Business (Cloud API), el chat web y el email general. Cada conversación queda unida a un contacto.
- **Asistente**: responde solo lo que puede apoyar en datos (disponibilidad, precio y características de las fichas publicadas, horario, cómo reservar una visita con el enlace, cómo registrarse con el asistente). Lo demás lo deja como borrador con un resumen para una persona. Siempre dice que es automático y pasa a una persona si se lo piden.
- **Modos**: empieza en borrador; después responde solo a una lista blanca de intenciones (horario, enlace de reserva, registro) y se amplía según el acierto medido.
- **Reglas de Meta** (verificar al implementar): las respuestas automáticas van dentro de la ventana de 24 horas desde el último mensaje del cliente; fuera de ella, en WhatsApp, solo con plantillas aprobadas. Publicar y responder en nombre de la página exige una app de Meta verificada con permisos aprobados. Es el trámite más lento de todo el proyecto, conviene empezarlo pronto.
- **De conversación a aplicante**: botón Create applicant con los campos ya rellenados por la IA a partir del chat.
- **Objetivo de servicio**: primera respuesta automática en menos de 5 minutos en horario de oficina; respuesta humana en menos de 2 horas.

### 5.13 Tour 3D: 360 y Gaussian Splatting

**Pediste:** una carpeta por propiedad con dos subcarpetas (vídeos 360 y fotos 360); un LLM con MCP y computer use que limpie las fotos, corrija el color y saque con After Effects los fotogramas (6 a 10 por segundo) para entrenar el splat.

- **Sin computer use para esto.** Manejar Photoshop y After Effects a través de la pantalla es lento, frágil y caro para un proceso que se repite igual cada vez. Los mismos pasos por línea de comandos corren solos y dan siempre el mismo resultado:
  - `ffmpeg` extrae los fotogramas a la tasa que se quiera (6 a 10 por segundo caminando despacio es un buen punto de partida; lo importante es que dos fotogramas seguidos se solapen mucho) y convierte el vídeo 360 en vistas normales con su filtro `v360`.
  - Un filtro de nitidez descarta los fotogramas borrosos.
  - **Una sola corrección de color** (una LUT) aplicada igual a todos los fotogramas. Retocar cada foto por separado, con IA o a mano, hace que el splat parpadee y aparezcan «floaters».
  - En lugar de borrar objetos foto a foto, **máscaras automáticas** de personas, operador y trípode, que el entrenamiento ignora.
- **El protocolo de captura importa más que la edición**: ordenar antes de grabar, todas las luces encendidas, exposición y balance de blancos bloqueados, caminar despacio en bucles, cámara en monopié a la altura del pecho, operador fuera de plano, cada estancia y cada paso entre estancias, cuidado con espejos y ventanas. Va como checklist en el panel.
- **Carpetas** con la referencia de Hampton delante: `HE-R027_Chateau-La-Chaire/videos_360`, `/fotos_360` y `/_output`. Mejor aún: subir desde el panel a R2, lo que crea el trabajo y muestra su estado.
- **Dos productos de la misma visita**: un **tour 360 de fotos** (rápido, robusto, funciona en cualquier móvil) y el **splat** como versión premium.
- **Etapas del splat**: fotogramas, posiciones de cámara (COLMAP o GLOMAP), entrenamiento (gsplat o Nerfstudio, Postshot o Brush) en una GPU alquilada por horas porque el VPS no tiene GPU, limpieza (SuperSplat), compresión (SPZ o SOG), R2 y visor en la ficha, con el tour 360 como respaldo en móviles lentos.
- **Revisión humana antes de publicar**: floaters y privacidad (fotos familiares, documentos o caras reflejadas, que se difuminan).
- **Encaje con lo actual**: la sección «3D tours» del panel solo acepta Matterport, YouTube y Vimeo. Para tours propios hay que servirlos desde R2 y ajustar la CSP.
- **Comprar en vez de construir**: con pocas fichas al mes, Matterport o una app de captura puede salir más barato que mantener la cadena propia. Se decide con el volumen real (pregunta 8).

### 5.14 Analítica y trazabilidad

**Pediste:** que la dirección vea la actividad de cada usuario en la web, las propiedades más vistas y el tráfico, para entender tendencias y ofrecer lo que se demanda.

- **Qué medir**: por ficha (vistas, fotos abiertas, tour abierto, reservas, guardados); búsquedas y filtros usados en la web, que son demanda declarada; búsquedas sin resultados, que son demanda sin cubrir; origen de las visitas (campañas, publicaciones en redes); el embudo visita, consulta, aplicante, visita, oferta y cierre; tiempos del equipo (primer contacto, primera lista enviada, visitas por semana) y de las agencias (tiempo de respuesta).
- **Demanda contra oferta**: los requisitos de los aplicantes (presupuesto, dormitorios, parroquia) contra el inventario. Si hay muchos aplicantes para un tipo de casa y pocas casas, ese dato sirve para captar propietarios («we have tenants waiting for a home like yours»). Así la base de aplicantes trae fichas nuevas.
- **Actividad por persona**: anónima por defecto. Se une a una persona solo cuando se registra o entra en su portal y ha aceptado el aviso de privacidad.
- **Herramientas**: Cloudflare Web Analytics para el tráfico, sin cookies; los eventos de negocio salen de la tabla `events`; las vistas por ficha se cuentan en `daily_stats` (una fila por ficha, día y métrica que se incrementa, en lugar de una fila por visita).
- **Pantalla Insights**: fichas más vistas, mapa de demanda (parroquia × dormitorios × presupuesto), embudo, tiempos de respuesta y un resumen semanal por email.

### 5.15 Ofertas, referencias y cierre

No estaba en tu texto y es donde una agencia pequeña pierde más horas: entre «la visita fue bien» y «firmado» hay que perseguir abogados, documentos y respuestas. Se resuelve con hitos y recordatorios automáticos.

- **Ofertas de compra**: el aplicante la hace desde su portal o la registra el negociador; llega al propietario con un clic; aceptar, rechazar o contraofertar queda en el historial; varias ofertas por la misma casa se ven juntas.
- **Venta acordada**: se abre un expediente con comprador, vendedor, abogados de ambas partes, precio y condiciones, y una lista de hitos con fecha prevista y real (los de Jersey en §7.3). Cada semana sale un correo automático a los abogados pidiendo el estado de lo pendiente, y comprador y vendedor reciben un resumen sin tener que llamar.
- **Comprobaciones del cliente** en ventas: las que exija la normativa contra el blanqueo (§7.3), con los documentos en almacenamiento restringido (clase C3, sin IA en la nube).
- **Solicitud de alquiler**: el inquilino rellena su solicitud en el portal (empleo, ingresos, referencias, avalista si hace falta, estatus de vivienda); una regla configurable comprueba la asequibilidad; las referencias se piden por email con un enlace para responder; el contrato sale de una plantilla y se firma electrónicamente. Al firmar nace el contrato de §5.11.
- **Comisiones**: al cerrar una operación con otra agencia se genera la factura de la parte acordada, que pasa a Missing payments si no se cobra a tiempo (§5.1).

## 6. Automatizaciones e IA

### 6.1 Ficha estándar de cada automatización

Cada automatización nueva se define con esta ficha antes de construirla:

| Campo | Ejemplo: leer respuestas de agencias |
|---|---|
| Objetivo | Quitar al equipo el trabajo de leer cada respuesta y actualizar estados |
| Disparador | Correo nuevo con `[HE-OUT-…]` en el asunto |
| Entradas | Texto del correo, preguntas que se hicieron, casas incluidas |
| Pasos | Clasificar, validar el JSON, aplicar si la confianza supera el umbral; si no, crear una tarea |
| Modelo y clase de dato | Modelo barato por API · clase C1 |
| Punto humano y modo | Tarea si la confianza es baja · modo inicial Draft |
| Salidas | Estado de la propiedad y de sus matches, snapshot, avisos |
| Si falla | Reintento con espera; al tercer fallo, aviso a Luis; nunca aplica dos veces lo mismo |
| Tope de coste | Un importe mensual; al llegar, pasa a Draft |
| Pruebas | 30 respuestas reales etiquetadas, que se repiten al cambiar de modelo |
| Hecho cuando | 27 de 30 aciertos en las pruebas y una semana en Draft sin correcciones graves |

### 6.2 Pantalla Automations del panel

Para el equipo de Hampton, la «interfaz fácil de usar» es un tablero para controlar lo que ya existe:

- Lista de automatizaciones con interruptor, modo (**Draft**: propone y una persona aprueba · **Approve**: aprobación en lote · **Auto**: actúa sola y se revisa una muestra), última ejecución, porcentaje de éxito, pendientes de aprobar y coste del mes.
- Plantillas editables (correos y WhatsApp) y parámetros (días, umbrales, horarios).
- Registro de cada ejecución con su entrada y su salida, con los datos sensibles ocultos.
- Un botón general **Pause all outbound** que detiene cualquier envío a clientes y agencias.

Para construir y probar automatizaciones nuevas, Luis puede seguir usando n8n en el VPS. Lo que pasa a producción para Hampton vive en el código de la app, con pruebas.

Desde el 30-oct-2026 los pasos con IA los hará Hermes (§6.6), que además avisará y responderá por Telegram. La pantalla Automations sigue siendo el sitio donde el equipo controla cada automatización y ve lo que espera aprobación. Lo que propone Hermes se aprueba en el panel, en el propio borrador, y nunca por Telegram: un texto de ficha, por ejemplo, dentro de la ficha con «Use this text» y guardándola (§6.6).

### 6.3 Dónde corre y qué modelo usa

**Tu regla, afinada:**

- Automatizaciones internas de Optimyze: en el VPS, con puerto solo por Tailnet, como ahora.
- Automatizaciones para un cliente como Hampton: dentro de su app y en su cuenta de Cloudflare. Lo único público es lo que usa el público (web, registro, portal, reservas y webhooks), cada pieza con Turnstile, firma verificada o límite de peticiones.
- Lo que necesite modelos locales: en el carril privado del VPS, que pide trabajo y no abre puertos.

**La clase del dato decide el modelo**, no si la automatización es interna o de un cliente:

| Clase | Ejemplos | Qué se permite |
|---|---|---|
| C0 Público | Fichas, anuncios del mercado, textos publicados | Cualquier modelo por API; el más barato que pase las pruebas |
| C1 Contacto profesional | Correos de agencias, nombres de empresas | API con condiciones de empresa: sin entrenar con tus datos y con acuerdo de tratamiento |
| C2 Personal básico | Nombre, teléfono y requisitos del aplicante; chats | API con acuerdo de tratamiento, enviando solo lo necesario (los requisitos sin nombre ni teléfono) y en región UE o Reino Unido si se ofrece |
| C3 Sensible | Documentos de identidad, extractos, ingresos, referencias, atrasos y disputas, datos bancarios | Modelo local en el VPS o sin IA; nunca apps de chat de consumo |

**Suscripciones o API.** Las suscripciones de ChatGPT o Gemini están pensadas para personas trabajando en una ventana: sus límites cambian sin aviso, no garantizan servicio y sus términos pueden no permitir usarlas como motor de un servicio para un cliente. Las automatizaciones deben ir por API, con pago por uso, condiciones de empresa y registro de cada llamada. Con modelos pequeños, casi todas estas tareas cuestan céntimos. Las suscripciones siguen siendo útiles para que Luis prototipe.

> **Actualizado el 29-oct-2026.** Luis quiere que los empleados de Hampton usen su suscripción de ChatGPT en las automatizaciones de la app. OpenAI ofrece una vía oficial para eso, «Sign in with ChatGPT», pero hoy no admite una app comercial alojada como esta. Detalle y condiciones en el §6.5; mientras no haya permiso de OpenAI, la regla de este apartado sigue vigente.

> **Actualizado el 30-oct-2026.** Decisión de Luis (P-18): Hermes, en el VPS de Optimyze, es el cerebro de IA de las automatizaciones (§6.6). Las llamadas a modelos pasan por Hermes y no por AI Gateway, que deja de ser la puerta principal. La clase del dato sigue decidiendo qué se permite. Como el modelo de Hermes es hoy el plan de ChatGPT de Luis, vale la regla de datos del §6.5: C0 sí; C1 y C2 solo con un plan Business o Enterprise y su acuerdo de tratamiento; C3 nunca pasa por Hermes, va a un modelo local por el camino de la decisión A2.

**AI Gateway** de Cloudflare como puerta única: cada llamada queda registrada con su coste y su automatización, lo repetido se puede cachear, se ponen límites y se cambia de proveedor sin desplegar.

### 6.4 Barandillas

- Clave de idempotencia en cada envío (plantilla + entidad + versión): un mensaje no sale dos veces aunque una tarea se repita.
- Topes diarios por canal y por agencia.
- Horas de silencio: nada de WhatsApp ni SMS entre las 21:00 y las 08:00 de Jersey.
- Interruptor por automatización y el general Pause all outbound.
- Cada automatización con IA tiene su batería de pruebas, que se repite al cambiar de modelo.

### 6.5 El plan de ChatGPT de cada empleado (Sign in with ChatGPT)

Añadido el 29-oct-2026 a petición de Luis: que los empleados de Hampton usen su suscripción de ChatGPT para las automatizaciones de la app. Es su regla original de las suscripciones (§11) y pasa a ser la siguiente tarea (checklist AUT-12).

**Qué ofrece OpenAI** (consultado el 29-oct-2026 en [developers.openai.com/siwc](https://developers.openai.com/siwc) y en el [DevKit](https://github.com/openai/sign-in-with-chatgpt-devkit)):

| Pieza | Qué hace | Condición hoy |
|---|---|---|
| Inicio de sesión en una web | Solo identidad: el empleado entra con su cuenta de ChatGPT (OpenID Connect con PKCE; datos `openid`, `profile`, `email`). No da acceso a modelos | Prueba limitada para socios comerciales seleccionados; lista de espera a través de un representante de OpenAI |
| Uso del plan de ChatGPT | Las peticiones de IA de la app (Responses API) se cargan al plan del usuario, sin clave de API | Documentado solo para apps de código abierto que corren en la máquina del usuario o en su propia VM. Para una app de pago o alojada en remoto, OpenAI pide rellenar un formulario de interés |
| DevKit (SDK, componentes y ejemplo) | SDK local en Node.js, componentes React y logos | Licencia no comercial: no sirve para «operar un producto o servicio por o para una empresa» sin un acuerdo escrito con OpenAI |

Limitaciones del preview: peticiones con `store: false` y `stream: true`; el token se renueva desde la app; no admite generación de imágenes, búsqueda en archivos, intérprete de código, audio ni subida de archivos; la búsqueda web depende de la cuenta. La documentación no dice qué planes son válidos (Free, Plus, Pro, Business, Enterprise), qué límites de uso hay ni si se puede usar en tareas de fondo sin la persona delante.

**Qué significa para Hampton.** Hampton App es una web comercial alojada en Cloudflare, así que hoy no entra en ninguna de las dos vías. El primer paso no es código:

1. Luis rellena el formulario de interés de OpenAI para apps alojadas o de pago y pide un client ID, explicando el caso (equipo de 2 a 4 personas, automatizaciones internas de una inmobiliaria).
2. Hampton dice qué plan de ChatGPT tiene cada empleado (pregunta 14 del §12).
3. Con el permiso por escrito de OpenAI (y su licencia o acuerdo para el SDK), se diseña y se construye.

**Cómo encajaría si OpenAI da acceso:**

- En el panel, cada empleado pulsa «Connect ChatGPT» una vez. El token se guarda cifrado en D1 con la clave en los secretos de Cloudflare, nunca en el navegador ni en el repositorio, y se puede desconectar.
- Una automatización con IA corre con el plan del empleado que la lanza o que la aprueba en modo Draft (§6.2). Si los términos no permiten tareas de fondo, las automatizaciones del reloj se quedan en la vía API (AUT-02) o esperan a que alguien las apruebe.
- Si el empleado no tiene plan válido o agota su límite, la automatización no se cae: pasa a la vía API si Luis la ha activado, o queda en pausa con un aviso.
- La pantalla Automations muestra por automatización qué vía usó (plan del empleado o API) y cuántas peticiones.

**Datos.** Las peticiones con el plan del empleado se rigen por las condiciones de esa cuenta, y falta confirmar con OpenAI cuáles aplican. En los planes personales (Free, Plus, Pro) OpenAI puede usar las conversaciones para entrenar si no se desactiva; en Business y Enterprise no. Por eso, mientras no esté claro: datos C0 sí; C1 y C2 solo con un plan Business o Enterprise de Hampton y su acuerdo de tratamiento; C3 nunca (modelo local, §6.3).

**Hecho cuando:** OpenAI ha dado acceso por escrito, un empleado conecta su cuenta en el panel, una automatización con IA corre con su plan, y la pantalla Automations registra qué vía usó.

### 6.6 Hermes: el cerebro de IA de las automatizaciones, con Telegram

Añadido el 30-oct-2026 a petición de Luis: Hermes Agent, el agente que ya corre en el VPS de Optimyze, es el cerebro de IA de las automatizaciones de Hampton, en una instalación propia de Hampton (pregunta 15). Con él se enlazan las automatizaciones, y Luis habla con él y lo gestiona por Telegram (decisión P-18; checklist AUT-13 y AUT-14). El mismo día Luis respondió las preguntas 15 y 16 y aprobó el diseño que sigue, repasado con /grill-me. Ese Hermes de Hampton todavía no está instalado ni conectado a nada. Lo que no decidió Luis va marcado como propuesta.

**Qué hay hoy** (comprobado en el VPS el 30-oct-2026):

- Hermes Agent v0.22.5, de Nous Research y de código abierto: un agente con memoria, tareas programadas y pasarela de mensajería (Telegram, entre otras).
- Corre en un contenedor aislado: sin permisos de administrador, sin acceso a Docker ni a los archivos del VPS, y sin llegar a los demás servicios del VPS. Solo sale a internet hacia una lista de dominios: los proveedores del modelo y los repositorios de código y de paquetes. Su panel solo se abre desde el tailnet y pide contraseña.
- Su modelo es el plan de ChatGPT de Luis, con el inicio de sesión de OpenAI Codex.
- Es el Hermes de desarrollo de Optimyze. No tiene ninguna vía a Hampton App (ni llave, ni el dominio de la app en su lista de salida) y Telegram no está configurado.

**Reparto del trabajo.** La app sigue al mando; Hermes piensa y conversa.

| Pieza | Hace | No hace |
|---|---|---|
| Hampton App (Cloudflare) | Guarda los datos (D1), aplica las reglas exactas en SQL (matching, plazos, To confirm), lleva el reloj (AUT-07), hace los envíos con sus barandillas (§6.4) y recoge las aprobaciones en el panel | Llamar a modelos de IA |
| Hermes (VPS) | Redacta (textos de fichas, publicaciones, resúmenes), lee texto sin forma, encadena pasos («cuando pase X, prepara Y»), avisa y responde por Telegram a Luis y al equipo | Entrar en la base de datos, enviar nada a clientes o agencias por su cuenta, aprobar lo que él mismo propone, tocar datos sensibles (C3) |

**Cómo se conectan.** Luis aprobó lo esencial el 30-oct-2026: Hermes nunca entra en la base de datos; por la puerta de la app solo lee datos públicos y contadores, pide trabajo, devuelve borradores y pausa los envíos; y lo que propone se aprueba en el panel. El resto de esta lista es propuesta de Claude y se fija en el spec: la llave como secreto de Cloudflare, la tabla `jobs`, que esas consultas no gasten el plan, el paso a Approve o Auto y lo que enseña Automations.

1. La app abre una puerta pequeña solo para Hermes: unas pocas rutas con su propia llave, guardada como secreto de Cloudflare y que se puede cambiar en cualquier momento. Solo admite operaciones fijas: leer datos públicos (C0) y contadores, pedir el trabajo pendiente que su plan permite, devolver borradores y pausar los envíos. Nada de SQL libre, ni borrar, ni publicar, ni reanudar.
2. La app deja el trabajo en la tabla `jobs` (§3), por ejemplo «redacta la descripción de HE-R027» o «resumen de la mañana». Hermes pregunta por HTTPS con una tarea programada, lo hace y devuelve el resultado. Para los avisos al momento (abajo) pregunta cada minuto o dos. Esas preguntas y los avisos de texto fijo no deben gastar el plan: el modelo solo entra cuando hay que redactar o responder, y cómo se consigue con Hermes se decide al construirlo. Hermes sale hacia la app: nadie entra al VPS y no se abre ningún puerto.
3. Lo que devuelve Hermes entra como borrador (Draft, §6.2) y una persona lo aprueba en el panel. Una automatización pasa a Approve o a Auto cuando sus pruebas lo justifican (AUT-09, AUT-10).
4. La pantalla Automations enseña qué hizo Hermes en cada ejecución y cuándo pidió trabajo por última vez, y avisa si deja de pedirlo.

**Telegram** (decisiones de Luis del 30-oct-2026):

- Un bot propio del Hermes de Hampton, que crea Luis con @BotFather y que solo responde a los usuarios permitidos: Luis y el equipo de Hampton desde el inicio. Cada persona activa la verificación en dos pasos de Telegram y habla con el bot en privado, no en grupos. Hermes contesta en el idioma en que se le escribe.
- Por Telegram se puede:
  - preguntar el estado («¿qué fichas hay por confirmar?», «¿cuántos aplicantes nuevos hay?»);
  - recibir el resumen del día a las 8:00 de Jersey;
  - recibir al momento, en uno o dos minutos, un aviso por cada aplicante nuevo, cada solicitud de visita nueva y cada borrador que espera aprobación;
  - pedir borradores de textos de fichas;
  - pausar los envíos (Pause all outbound, §6.4).
- Los avisos no llevan datos de la persona: «New applicant» con un enlace al Inbox, o «New viewing request for 23 Le Bernage» con un enlace a Viewings. Nunca enlazan a la ficha de una persona. Por eso la app solo le da a Hermes el tipo de novedad y la ficha, nunca el texto de los avisos del Inbox, que lleva el nombre de la persona.
- Horario de silencio (propuesta de Claude, a confirmar con Luis al construir AUT-14): de 21:00 a 08:00 de Jersey los avisos esperan y entran en el resumen de las 8:00, como las horas de silencio de los envíos (§6.4).
- Lo que espera aprobación trae un botón que abre el panel en ese borrador, y se aprueba allí, con el inicio de sesión de Google. También se hace en el panel reanudar los envíos, aprobar lo que manda algo a clientes o agencias, publicar o cambiar datos importantes. Hermes nunca puede aprobar lo que él mismo propone, y un mensaje de Telegram no cuenta como aprobación: la cuenta se puede robar y un texto puede colar instrucciones. Mientras la pausa está puesta, la app no envía nada, la pida quien la pida.
- Por Telegram solo viajan contadores, referencias y títulos de fichas (HE-R001) y enlaces a pantallas del panel. Nada sobre un aplicante concreto, ni siquiera su número: un número que identifica a una persona también es un dato personal (C2). Los chats con un bot no van cifrados de extremo a extremo y se guardan en los servidores de Telegram.
- Privacidad del chat:
  - una guía corta para el equipo: en el chat solo referencias de fichas, nunca datos de clientes;
  - si alguien escribe datos de un cliente, Hermes tiene la instrucción de avisar y no usarlos (no se puede garantizar: por eso la regla);
  - la memoria de Hermes está apagada. «Sin memoria» incluye que no escriba skills propias: son notas de «cómo hacer X» que Hermes puede sacar solo de las conversaciones y que no se borrarían con ellas;
  - Hermes borra su copia de las conversaciones a los 30 días. La copia que guarda Telegram no la borra Hermes.

**Datos y modelo** (decisión de Luis, pregunta 16). El Hermes de Hampton usa el plan de ChatGPT de Luis y solo recibe datos públicos (C0) y contadores. Vale la regla del §6.5:

- datos públicos (C0) y contadores, sí;
- C1 y C2, solo si Hermes pasa a un plan Business o Enterprise con acuerdo de tratamiento, y con su memoria apagada y sus conversaciones de trabajo borradas antes de que la app borre esos datos (12 meses, §7.2), porque Hermes guarda lo que lee;
- C3, nunca pasa por Hermes: sigue la decisión A2 (Ollama en el VPS, al que llega Cloudflare por un túnel privado). Hermes no alcanza los servicios del VPS, así que darle un modelo local sería cambiar sus barreras, y eso se decide con /grill-me.

Hermes es una app de código abierto que corre en el VPS de Luis con su propio plan. Si solo lo usara Luis, parecería el caso que OpenAI documenta para usar un plan de ChatGPT fuera de su web (§6.5). Antes de conectar ese plan al Hermes de Hampton, Luis comprueba dos cosas (PRE-32): que las condiciones de su plan permiten usarlo en el trabajo de un cliente, y que en la configuración de datos de ChatGPT está apagada la opción de mejorar el modelo con su contenido.

Propuesta de Claude, a confirmar con Luis: comprobar además que esas condiciones permiten que el equipo de Hampton use el plan a través de Hermes, y que Hermes trabaje sin Luis delante, como en el resumen de las 8:00. Las condiciones de OpenAI no dejan poner la cuenta a disposición de otras personas, y el Hermes de Optimyze usa la misma cuenta, así que una suspensión pararía los dos. Si no lo permiten, las preguntas del equipo y el resumen esperan a un plan Business o pasan a la vía API (P-09), y Hermes solo responde a Luis.

**Un Hermes solo para Hampton** (decisión de Luis, pregunta 15). El Hermes de hoy es el de desarrollo de Optimyze: está pensado para trabajar con copias de otros proyectos (hoy no tiene ninguna) y puede salir a GitHub y a los repositorios de paquetes. Si ese mismo agente tuviera la llave de Hampton App, una instrucción escondida en una web o en un repositorio podría usarla. Las reglas del propio despliegue de Hermes ya lo dicen: cada cliente con datos propios va en su propio Hermes.

Es un segundo Hermes en el mismo VPS, en su propia jaula (su carpeta, sus datos, su panel y su bot), igual de aislado y todavía sin instalar:

- con su propio bot;
- sin herramientas de terminal ni de código;
- sin entrar nunca en la base de datos: solo usa la puerta de la app;
- con una lista de salida mínima: el modelo, Telegram y el dominio de Hampton App.

Esa lista no basta para que no salgan datos: un bot o una clave de otra persona en esos mismos dominios servirían para sacarlos. Lo que protege es lo poco que ese Hermes tiene y puede hacer. Por eso la llave de la app solo da operaciones fijas y datos C0. Además, si se puede, la guarda un pequeño intermediario fuera del contenedor de Hermes (propuesta de Claude, a confirmar en el spec).

**Primera entrega** (decisión de Luis: las dos partes a la vez, en un mismo plan; todo con datos C0):

1. El resumen de las 8:00, las preguntas por Telegram y los avisos al momento (AUT-13 y AUT-14). Propuesta de Claude, a confirmar con Luis: el resumen incluye las fichas que han pasado a To confirm (ADM-04). Se calculan al mirar, así que no hay un momento que dispare un aviso.
2. Los borradores de textos de fichas (PUB-13). Se piden con un botón en el editor de la ficha o por Telegram. El borrador aparece dentro de la ficha con «Use this text», y usarlo y guardar la ficha es la aprobación.

Después llegará la extracción de anuncios del mercado, cuando llegue la clave de Places.je (BUS-09).

Con un plan Business y la memoria de Hermes apagada llegarían la lectura de respuestas de agencias (AGE-06), los requisitos libres convertidos en etiquetas (REG-13) y el resumen de las notas de voz (VIS-15). La búsqueda en la web (BUS-11) no la haría el Hermes de Hampton: leer páginas cualesquiera es justo lo que no debe hacer el agente que tiene la llave de la app.

**Hecho cuando:** se cumplen las cinco cosas:

- Hermes pide trabajo a la app con su llave y devuelve el borrador de un texto de ficha, que aparece en la ficha y que «Use this text» y guardar aplican;
- Luis o alguien del equipo pregunta por Telegram «¿qué hay por confirmar?» y recibe la respuesta en su idioma y sin datos personales;
- el resumen llega a las 8:00 de Jersey, y un aplicante nuevo produce su aviso en uno o dos minutos, sin datos de la persona;
- la pantalla Automations muestra la última vez que Hermes pidió trabajo;
- una pausa pedida por Telegram se ve en el panel.

## 7. Seguridad, privacidad y cumplimiento en Jersey

### 7.1 Acceso

- Hoy hay un solo rol (D6). Propuesta: `owner` (usuarios, pagos, datos bancarios, borrados definitivos y ajustes) y `staff` (todo lo demás). Más roles solo si aparecen personas con tareas distintas.
- Se mantiene el login con Google y la cookie HMAC. Se exige verificación en dos pasos en esas cuentas de Google. Opcional: Cloudflare Access delante de `/admin` y `/api/admin` como segunda puerta.
- Los enlaces del portal son aleatorios, se guardan con hash, caducan y se pueden revocar.
- Los webhooks de Meta y WhatsApp verifican la firma de cada llamada.

### 7.2 Datos personales

- **Registro en la JOIC**: obligatorio para los responsables del tratamiento establecidos en Jersey (Data Protection Authority (Jersey) Law 2018, art. 17); no registrarse es delito. Con menos de 10 empleados equivalentes cuesta 70 £, más un recargo de 50 £ para quien está registrado en la JFSC como agencia inmobiliaria, y se renueva entre el 1 de enero y el final de febrero. Comprobar que Hampton está al día y, si Optimyze trata datos por cuenta de Hampton, revisar también su caso.
- **Aviso y base legal**: aviso de privacidad en el registro y en el portal; cada uso con su base legal (contrato o interés legítimo para gestionar la búsqueda, consentimiento para marketing).
- **Marketing directo** (Data Protection (Jersey) Law 2018, art. 36): el derecho a oponerse se comunica de forma explícita y separada en el primer contacto o antes, y si alguien se opone se deja de enviar. Va en el registro, en el primer WhatsApp o email y en el pie de los correos a agencias. Jersey no tiene un equivalente de la PECR británica y no encontré reglas propias para email, SMS o WhatsApp: que lo confirme un abogado.
- **Cookies**: la guía de la JOIC pide consentimiento afirmativo para las no esenciales. Cloudflare Web Analytics no usa cookies; si algún día se añade algo que las use, banner con opción real de rechazar.
- **Conservación**: aplicantes inactivos borrados o anonimizados a los 12 meses con aviso previo (propuesta; Hampton fija el plazo). El aplicante puede descargar o borrar sus datos desde su portal.
- **Proveedores**: acuerdos de tratamiento con Cloudflare, Google, Meta, el proveedor de IA y Optimyze si opera el sistema.

### 7.3 Reglas de Jersey que el sistema debe respetar

Verificado el 23-oct-2026 en gov.je, jerseylaw.je, la JFSC, la JOIC y despachos de Jersey. Varias reglas cambiaron este año. Todas entran como parámetros revisables y un abogado de Jersey las valida antes de automatizar nada.

**Estatus de vivienda** (Control of Housing and Work Law). Desde el 14-sep-2026 hay seis estatus y «Standard» sustituye a «Registered» sin cambiar su contenido. El estatus decide qué casas puede proponer el matching:

| Estatus | Alquilar | Comprar | Regla para el matching |
|---|---|---|---|
| Permanent Entitled, Entitled | Cualquier vivienda | Cualquier vivienda | Sin filtro |
| Licensed | Casi todo salvo first-time buyer restricted y vivienda social; una sola vivienda, como residencia | Igual, una sola | Excluir FTB restricted y social |
| Licensed for Lease Only (nuevo) | Registered y Qualified con contrato de menos de 9 años; una sola vivienda | No consta | Solo alquiler y plazo menor de 9 años |
| Entitled for Work Only | Una vivienda Registered | Solo junto a una pareja Permanent Entitled, Entitled o Licensed | Solo Registered |
| Standard (antes Registered) | Una vivienda Registered, lodgings o alojamiento turístico | No; puede adquirir acciones de share transfer, pero ocupar la vivienda requiere consentimiento | Solo Registered; compra marcada para revisión |

Una vivienda Qualified exige tarjeta Permanent Entitled, Entitled, Licensed o Licensed for Lease Only. Una Registered admite cualquier estatus.

**Alquiler** (Residential Tenancy (Jersey) Amendment Law 2025, en vigor desde el 15-abr-2026). Los contratos de plazo fijo firmados antes siguen con la ley de 2011 hasta que vencen, así que cada contrato guarda bajo qué régimen está.

- Contrato escrito y firmado, obligatorio.
- Inventario (condition report) al inicio y al final, en 7 días; multa de hasta 10.000 £.
- Depósito protegido en **mydeposits Jersey**, el único esquema, en los **30 días** siguientes a recibirlo y con el aviso de datos prescritos. No encontré un tope legal al importe.
- **Subidas de renta**: una cada 12 meses, con al menos 2 meses de aviso por escrito y tope en el RPI de Jersey, salvo excepciones (mejoras para el inquilino o renta muy por debajo del mercado). El inquilino puede recurrir al Rent Tribunal. El asistente de renovación (§5.11) calcula la subida máxima y la primera fecha posible y prepara la carta.
- **Preavisos**: el inquilino periódico da 1 mes. El casero, sin causa, al menos 1 año en contratos periódicos; con causa, de 7 días a 6 meses según el motivo. Solo un plazo fijo inicial, de hasta 3 años.
- Prohibido cobrar premium o «key money» u obligar a comprar muebles. No hay una prohibición general de honorarios al inquilino, pero el límite entre un «admin fee» y un premium no está claro: consultar a un abogado antes de cobrar algo al inquilino.

**Licencia de vivienda en alquiler** (desde el 1-may-2024; alquilar sin ella es infracción desde el 1-ago-2024): una por vivienda, a nombre del propietario, válida 2 años, 61,50 £ desde enero de 2026 y renovación con un enlace que llega por email. Calendario de cumplimiento para §5.11:

| Obligación | Plazo |
|---|---|
| Licencia de la vivienda | Cada 2 años; copia al inquilino con la vía de quejas en 28 días; cambios notificados en 28 días |
| Instalación eléctrica (EICR) | Cada 5 años, con copia al inquilino en 28 días; checklist anual o al cambiar de inquilino |
| Gas | Revisión anual por un técnico Gas Safe |
| Alarmas | Humo (EN 14604) en cada planta; CO (EN 50291) donde haya un aparato de combustión |
| Riesgos | Los 29 riesgos prescritos por la Order de 2018 |
| Depósito | En mydeposits Jersey en 30 días |
| Inventario | Al inicio y al final, en 7 días |

**Ventas y blanqueo de capitales**: la agencia inmobiliaria (compraventa de freehold, flying freehold, leasehold y acciones con derecho de ocupación) es negocio del Schedule 2 de la Proceeds of Crime (Jersey) Law 1999. Exige registro en la JFSC y diligencia debida sobre compradores y vendedores (Handbook de la JFSC, sección 18). Además, cobrar rentas o depósitos en una cuenta propia cuenta como administrar fondos y también exige registro (confianza media): confirmarlo antes de F5.

**Compraventa**: freehold y flying freehold se «pasan» ante la Royal Court el viernes por la tarde y pagan Stamp Duty; share transfer es una compra de acciones, sin Royal Court, y paga Land Transaction Tax. Hitos para el expediente de §5.15: oferta, abogados, estatus de vivienda y diligencia debida, cuestionario del vendedor, búsquedas (título, planning), tasación e hipoteca, contrato acordado, fondos en el abogado, passing day o completion, pago al vendedor e impuestos.

**Datos de la ficha**: no encontré obligación legal de publicar categoría, tenencia o service charge, pero es lo habitual en Jersey. Los parish rates son dos, foncier (propietario) y occupier (ocupante), y los paga quien posee u ocupa la vivienda el 1 de enero; en un alquiler amueblado el occupier rate lo paga el casero. El certificado energético no es obligatorio: su entrada, prevista para el 1-ene-2026, se aplazó sin fecha.

**Portales y fuentes del inventario** (observado el 23-oct-2026):

| Fuente | Qué ofrece | Uso |
|---|---|---|
| Places.je | API REST pública de solo lectura: anuncios con agencia, precio, dormitorios, parroquia, estado y `property_key`; directorio de agencias y agentes; historial de transacciones por propiedad. Clave obligatoria desde el 2-nov-2026; 60 peticiones por minuto. Unos 1.640 anuncios en venta y 340 en alquiler disponibles | Fuente principal. Pedir la clave ya |
| Homely.je | Alertas por email dos veces al día; sin API. Sus términos prohíben extraer datos, crear una base competidora y usar sus datos para contactar a las agencias | No usar |
| Properties.je | Sin API ni alertas por ahora; sus términos no hablan del scraping | Solo con permiso escrito |
| JEP property, OnTheMarket, Rightmove | Más volumen, con mucho solapamiento; Rightmove casi sin alquileres | Revisar sus términos antes de usarlos |

**Direcciones**: el gazetteer oficial (JLPI, más de 90.000 direcciones) se licencia a través de Digimap Jersey, sin precio público. Para empezar basta con asignar la parroquia desde el texto de la dirección y el código postal; el gazetteer queda como mejora si la deduplicación lo pide.

**Fuentes** (consultadas el 23-oct-2026; comprobar de nuevo antes de decidir):

- Estatus de vivienda: [gov.je, residential status](https://www.gov.je/residentialstatus) · [Walkers, sep-2026](https://www.walkersglobal.com/en/Insights/2026/09/Jerseys-Control-of-Housing-and-Work-law-what-employers-need-to-know) · [Mourant, share transfer](https://www.mourant.com/guides/share-transfer-residential-property-in-jersey/)
- Alquiler: [Residential Tenancy (Jersey) Law, versión vigente](https://jerseylaw.je/laws/current/l_31_2011) · [gov.je, cambios de 2026](https://www.gov.je/news/2026/pages/ResidentialTenancyChanges.aspx) · [Appleby](https://www.applebyglobal.com/publications/major-changes-to-jerseys-residential-tenancy-law/)
- Depósitos: [Deposit Scheme Regulations 2014](https://www.jerseylaw.je/laws/current/ro_103_2014) · [gov.je, deposit protection](https://www.gov.je/Home/RentingBuying/OtherRentalOptions/pages/depositprotectionrentedaccommodation.aspx)
- Licencia de vivienda en alquiler: [gov.je, rented dwellings](https://www.gov.je/Home/RentingBuying/OtherRentalOptions/Pages/RentedDwellings.aspx)
- Blanqueo: [Proceeds of Crime (Jersey) Law 1999](https://jerseylaw.je/laws/current/l_8_1999) · [JFSC Handbook, sección 18](https://www.jerseyfsc.org/media/fmvb1zqt/handbook-section-18-real-estate-agents.pdf)
- Datos personales: [JOIC, registro](https://www.jerseyoic.org/guidance/data-protection/registration) · [Data Protection (Jersey) Law 2018](https://jerseylaw.je/laws/current/l_3_2018)
- Compraventa: [Mourant, freehold](https://www.mourant.com/guides/buying-and-selling-freehold-property-in-jersey/) · [gov.je, parish rates](https://www.gov.je/Home/Parish/Pages/Rates.aspx) · [gov.je, certificados energéticos](https://www.gov.je/News/2023/Pages/TimetableForEnergyPerformanceCertificates.aspx)
- Portales: [Places.je, API para desarrolladores](https://places.je/developers) · [Homely.je, términos](https://homely.je/legal/terms) · [gov.je, cartografía digital](https://gov.je/PlanningBuilding/JerseyMappingService/Pages/Digital.aspx)

### 7.4 Copias y secretos

- D1 permite restaurar a un punto en el tiempo (Time Travel; comprobar el plazo según el plan). Además, una exportación semanal cifrada a un destino privado.
- Los secretos viven solo en las variables de Cloudflare, nunca en el repo.
- La tabla `events` es también la auditoría: quién hizo qué y cuándo.

### 7.5 Un riesgo que ya existe en producción

Lo encontró la lectura en frío del documento y lo comprobé en el código (`scripts/import_agencies.py`, líneas 171 a 176). Las 6.221 fotos de los paquetes de agencias se guardaron con `origin='upload'` y `public=1`, apoyadas en el permiso que declaraste el 8-oct (los README dicen que no se verificó por separado). El CHECK de la base de datos solo impide publicar fotos con `origin='external'`. Hoy no se ven porque esas 264 fichas están archivadas, pero si alguien restaura y publica una desde el panel, sus fotos pasan a ser públicas. Los mismos README dicen que los datos se recogieron de las webs públicas de las agencias y que no se escribió a ninguna, así que no consta un permiso de la agencia.

**Propuesta, sin aplicar porque necesita tu sí:** marcar esas fotos como no públicas, o darles un origen propio (por ejemplo `agency`) que el CHECK trate como `external`, y publicarlas solo cuando el acuerdo con esa agencia incluya el permiso de fotos.

## 8. Lo que no construiría

| En vez de… | Usaría… | Por qué |
|---|---|---|
| Investigación diaria por aplicante con dos modelos | Inventario único y matching en SQL | Más completo, más barato y sin duplicados |
| Computer use sobre Photoshop y After Effects | `ffmpeg`, herramientas de línea de comandos y un protocolo de captura | Repetible, sin pantalla y sin coste por clic |
| Un sistema de notificaciones aparte | La tabla `events` y unas reglas | Una sola fuente de verdad |
| Un motor de flujos para esperas y recordatorios | Un cron cada 10 minutos y consultas de lo vencido | El estado ya está en D1 |
| Un calendario propio | Reglas de disponibilidad y Google u Outlook | Los negociadores ya viven en su calendario |
| Pasarela de pagos o contabilidad propia | Referencia única, extracto CSV y exportación a su contabilidad | Conciliar solo exige casar referencias |
| Firma electrónica propia | Un servicio existente | Validez legal y registro de auditoría resueltos |
| Analítica de tráfico propia | Cloudflare Web Analytics y eventos propios | Sin cookies y sin coste |
| Traducción automática en la web | Inglés (D19) y traducciones revisadas si se piden | Una mala traducción describe mal la casa |
| Un segundo backend (Supabase, Postgres) | Seguir en D1 | Jersey es pequeño: miles de filas, no millones |
| Un CRM nuevo si Hampton ya tiene uno | Integrarse con el suyo | No duplicar el trabajo del equipo |

## 9. Hoja de ruta

Antes de construir nada, cuatro acciones que no esperan:

1. **Pedir la clave de la API de Places.je** en `places.je/developers/request-access`. Desde el 2-nov-2026 las llamadas sin clave reciben 401.
2. **Empezar el trámite de Meta** (verificación del negocio y app con permisos) si se quiere publicar en redes o responder mensajes. Es lo más lento.
3. **Confirmar los registros de Hampton** en la JFSC (Schedule 2) y en la JOIC (§7.2, §7.3).
4. **Medir cómo se trabaja hoy**: cuánto tarda la primera lista que recibe un aplicante y cuántas horas por semana se buscan casas a mano, para poder comparar después.

La hoja de ruta está ordenada por el trabajo que quita y por dependencias. No pongo plazos hasta resolver las preguntas del §12.

| Fase | Qué incluye | Hecho cuando |
|---|---|---|
| F0 Cimientos | `contacts`, `applicants`, `events`, `notifications` y `staff` con roles; Worker `hampton-jobs` con cron; registro paso a paso en la web y en el panel; lista y ficha de aplicantes; Action inbox básico; el camino del público hacia la app según la pregunta 2 (dominio propio o enlaces desde Wix) | Un registro desde la web pública aparece en el panel con su aviso en menos de un minuto, y los duplicados por email o móvil se unen |
| F1 Inventario y matching | `properties`, `market_listings` y `matches`; fuentes empezando por la API de Places.je; destino de las 264 fichas de agencias según la pregunta 1; extracción, deduplicación, matching, cola de revisión y lista ✅ ❌ ❓ | La pasada diaria corre sola, un aplicante nuevo ve coincidencias en menos de 5 minutos y el equipo revisa 20 casas en menos de 5 minutos |
| F2 Agencias y portal | `agencies`, `outreach` y snapshots; correos agrupados, lectura de respuestas y seguimientos; portal del aplicante con sus tres botones | Una respuesta de agencia cambia estados y avisa al aplicante sin teclear, con 27 de 30 aciertos en las pruebas |
| F3 Visitas y ofertas | Disponibilidad por negociador, huecos reales, reservas sin choques, calendario, recordatorios, feedback, contador de interesados, informe al propietario; ofertas y expediente de venta con hitos | Cero dobles reservas, recordatorios enviados, feedback en la ficha, y una oferta aceptada abre su expediente con hitos |
| F4 Publicación | Alta de ficha con campos de Jersey, ayuda de IA, Publish a la web y a Meta, KPIs y `To confirm` | Una ficha completa sale en la web y en redes con un botón |
| F5 Alquileres gestionados | Solicitud y referencias del inquilino, contratos, cobros, conciliación, atrasos, cumplimiento, reparaciones y renovaciones | Un pago atrasado aparece en Missing payments el día que toca y sigue su secuencia |
| F6 Mensajes | Bandeja unificada y asistente | Primera respuesta automática en menos de 5 minutos en horario |
| F7 Insights | Contadores, demanda contra oferta y resumen semanal | La dirección ve la demanda sin cubrir por parroquia |
| F8 Tours 3D | Primero el tour 360; después el splat | Un tour propio se ve en la ficha desde R2 |

Si la gestión de alquileres es hoy el negocio principal de Hampton, F5 puede adelantarse a F3.

## 10. Decisiones propuestas

Todas son propuestas mías; ninguna está aprobada.

| # | Propuesta | Por qué | Alternativa descartada |
|---|---|---|---|
| P-01 | Inventario del mercado (con la API de Places.je como fuente principal) y matching en SQL como motor | Sirve a todos los aplicantes a la vez, no repite casas y usa una fuente con permiso | Deep Research diaria por aplicante |
| P-02 | Separar `properties`, `market_listings` y `matches` | La disponibilidad es de la casa; el interés, de la pareja | Estados guardados en la propiedad |
| P-03 | Una consulta por casa y un correo diario por agencia | Menos correos y más fuerza para negociar | Un correo por aplicante |
| P-04 | Acuerdo de comisión por agencia, negociado una vez | Evita negociar en cada correo | Preguntar la comisión cada vez |
| P-05 | Tabla `events` como base de avisos, historial, auditoría y analítica | Una sola fuente de verdad | Sistemas separados |
| P-06 | Estado del aplicante en dos capas: etapa guardada y cola calculada | Un aplicante puede estar en varias situaciones a la vez | Un único estado manual |
| P-07 | Portal del aplicante con enlace sin contraseña | Sus clics cambian estados sin trabajo del equipo | Llamadas y correos manuales |
| P-08 | Worker `hampton-jobs` con cron cada 10 minutos junto a Pages | Pages no programa tareas, y así no se toca la web en producción | Migrar ya de Pages a Workers |
| P-09 | IA según la clase del dato (C0 a C3), por API y a través de AI Gateway | Coste medible y control de los datos | Suscripciones de consumo |
| P-10 | Modos Draft, Approve y Auto en cada automatización | La confianza se gana con datos | Automático desde el primer día |
| P-11 | Disponibilidad por negociador con plantilla y excepciones, sincronizada con su calendario | Huecos reales sin choques | Horas fijas para todos |
| P-12 | Roles `owner` y `staff` | Pagos, datos bancarios y borrados solo para `owner` | Un solo rol |
| P-13 | Campos de Jersey en fichas y registro (parroquia, tenencia, categoría de vivienda, estatus) | Sin ellos el matching propone casas que no valen | La lista genérica de España |
| P-14 | Tours 3D por línea de comandos y con protocolo de captura | Repetible y sin pantalla | Computer use sobre Adobe |
| P-15 | La lista del aplicante no revela la agencia hasta acordar comisión o visita | Protege la comisión | Enlazar el anuncio original |
| P-16 | Expediente de venta con hitos y recordatorios automáticos a los abogados | Es donde más horas se pierden y no estaba en el texto | Seguimiento por teléfono y memoria |
| P-17 | Decisión de Luis (29-oct-2026): la IA de la app usa el plan de ChatGPT de cada empleado con «Sign in with ChatGPT», si OpenAI da acceso por escrito a una app comercial alojada (§6.5) | Aprovecha suscripciones que Hampton ya paga | Solo API con pago por uso (P-09), que sigue como alternativa mientras tanto |
| P-18 | Decisión de Luis (30-oct-2026): Hermes, en el VPS de Optimyze, es el cerebro de IA de las automatizaciones; con él se enlazan, y Luis habla con él y lo gestiona por Telegram (§6.6). La app sigue guardando los datos y las aprobaciones se hacen en el panel. El mismo día Luis aprobó un Hermes propio para Hampton, todavía por instalar (preguntas 15 y 16) | Una sola IA para todas las automatizaciones, aislada como la que ya corre en el VPS, que usa el plan de ChatGPT que Luis ya paga, y Telegram para manejarla desde el móvil | AI Gateway con pago por uso como puerta única (P-09), que deja de ser la principal |

## 11. Tu texto, punto por punto

| Tu punto | Qué pasa | Dónde |
|---|---|---|
| Notificaciones: All, New applicants, Matched, Missing payments | Se mantienen y se añaden Agency replies, Viewings, Messages y Compliance, en dos bandejas | §5.1 |
| Pagos con fecha límite de cobro | `due_date` con margen configurable; incluye comisiones de agencias | §5.1, §5.11 |
| Aplicante sin match: mostrar el estado de la investigación | Cola `Waiting for investigation` o `No matches`, con la hora de la última búsqueda | §4.1, §5.2 |
| Aplicante con match: cuántas y cuántas confirmadas | Contadores en la tarjeta: encontradas, confirmadas y disponibles | §5.2 |
| Ficha del aplicante: encontradas y confirmadas disponibles | Pestaña Matches con sus estados | §5.2 |
| Ficha de propiedad: estado, precio, dirección, habitaciones, baños y disponibilidad | Igual, más la fuente y la última verificación | §5.3 |
| Historial, detalles al confirmar disponibilidad, aplicantes con match, álbum | Timeline de eventos, snapshots, matches y fotos | §5.3, §4.3 |
| Filtros To Buy / To Let, habitaciones y parroquia | Igual, más precio, estado y fuente | §5.3 |
| Al aplicar, investigar; luego correo al agente por disponibilidad y comisión | Inventario, una consulta por casa y acuerdo por agencia (cambia) | §5.5, §5.7 |
| Contar interesados al pedir visita, poder quitarlos y mostrarlo en la web | Contador real con caducidad; el equipo quita con motivo; la web lo muestra desde 2 | §5.9 |
| Tras la visita: más información, comprar o sin interés | Formulario Proceed, Need more information y Not interested | §5.9 |
| Calendario de negociadores; elegir día y hora; ver citas de otros sin sus datos | Huecos reales; los ocupados aparecen como «Booked» | §5.9 |
| Cada negociador marca días y horas disponibles y no disponibles | Plantilla semanal y excepciones | §5.9 |
| Automatizaciones con interfaz fácil | Pantalla Automations y ficha estándar; desde el 30-oct-2026, además, Telegram con Hermes (P-18) | §6.1, §6.2, §6.6 |
| Interna en puerto privado del VPS; de cliente, en una página web | Se mantiene, con carril privado sin puertos para modelos locales; Hermes trabajará desde el VPS para la app sin abrir puertos (P-18) | §6.3, §6.6 |
| Bajo riesgo con suscripciones; datos sensibles con modelos locales | Clases C0 a C3; API en lugar de suscripciones; C3 en local (cambia). Desde el 29-oct-2026 Luis retoma las suscripciones: plan de ChatGPT de cada empleado si OpenAI lo permite (P-17). Desde el 30-oct-2026, Hermes usará el plan de ChatGPT de Luis para lo que no es sensible (P-18) | §6.3, §6.5, §6.6 |
| Deep Research la primera vez | Solo para casos raros; el inventario da el resultado inicial (cambia) | §5.5 |
| Base de datos de propiedades encontradas con valor, habitaciones y requisitos que no cumple | `market_listings` y lista ✅ ❌ ❓ con evidencia | §5.5, §5.6 |
| Nueva búsqueda a las 24 horas sin repetir | Pasada diaria con comparación y deduplicación | §5.5 |
| Búsquedas diarias con modelos baratos y dos modelos para comparar | Modelos baratos en la extracción; dos modelos solo donde aportan (cambia) | §5.5 |
| Interfaz con filtro To Let / To Buy, nombre, teléfono y fecha; orden por antigüedad | Igual | §5.2 |
| Cuatro estados de aplicante | Se mantienen como cola calculada, con ortografía corregida | §4.1 |
| Cuatro estados de propiedad | Pasan al match, y `Not available` a la propiedad, que lo propaga (cambia) | §4.2 |
| Registro paso a paso con nueve campos | Los nueve, más operación, tipo, fechas, estatus de vivienda y otros | §5.4 |
| Protocolo de propiedades gestionadas; cada Lease Agreement a la base de datos; notificaciones | Contratos, cobros, cumplimiento, reparaciones y renovaciones | §5.11 |
| Responder mensajes de Facebook, Instagram y la web | Bandeja unificada con asistente (se mueve) | §5.12 |
| Tres meses sin cambios: «por confirmar» | `To confirm` en fichas propias; las externas se detectan solas | §4.4, §5.10 |
| Recoger los datos de una propiedad y publicarla sola en la web y en redes | Alta guiada y botón Publish | §5.10 |
| Familias de datos 1 a 6 | Adaptadas a Jersey (cambia) | §5.10 |
| Carpeta con dos subcarpetas; limpieza, color y fotogramas a 6–10 fps | Línea de comandos, protocolo de captura, tour 360 y splat (cambia) | §5.13 |
| Actividad de cada usuario, propiedades más vistas, tráfico y tendencias | Insights y demanda contra oferta, con privacidad | §5.14 |

Lo que añadí porque faltaba para cubrir el recorrido completo:

- Ofertas, expediente de venta con hitos, solicitud y referencias de alquiler, y facturas de comisión (§5.15).
- Portal del aplicante con enlace sin contraseña (§5.8).
- Directorio de agencias con acuerdo de comisión, prueba de presentación y estadísticas de respuesta (§5.7).
- Captación de propietarios con «Book a valuation» (§5.10) e informe semanal al propietario (§5.9).
- Alertas «Save this search» para visitantes de la web (§5.4).
- Demanda contra oferta como herramienta de captación (§5.14).
- Campos y reglas de Jersey: parroquias, tenencia, categoría de vivienda y estatus del aplicante (§5.4, §5.10, §7.3).
- Barandillas de envío, pruebas de cada IA y modos de autonomía (§6).

## 12. Preguntas para Luis

Ordenadas por cuánto cambian lo que se construye. Las tres primeras salieron de la lectura en frío del documento:

1. **¿Qué son las 264 fichas de agencias, y Hampton anuncia casas cuyo encargo tiene otra agencia?** Según el cerebro (8-oct), las tres fichas públicas (Château La Chaire, 23 Le Bernage, Playa D'Or) usan datos y fotos sacados de los portales de otras agencias. Si es inventario de mercado, se migra y Places.je lo sustituye; si Hampton las comercializa, hace falta la categoría `co_listed` (§3) y el permiso de fotos por agencia (§7.5).
2. **¿Qué web usará el público, y cuándo?** `www.hamptonestatesjersey.com` sigue en Wix (comprobado el 23-oct) y esta app vive en `hamptonjersey.pages.dev`; el proyecto Astro de `/root/Hampton` es un tercer candidato. Si el dominio pasa a esta app, F0 incluye DNS, redirecciones desde las URL de Wix, dar de alta el dominio en Firebase, Turnstile y Meta, y dejar de mantener fichas en Wix. Si Wix se queda, los formularios se enlazan o se incrustan en un iframe (un script incrustado chocaría con la comprobación de origen de la API) y la analítica mediría muy poco.
3. **¿Aceptas los cambios marcados «cambia» en §11, sobre todo P-01?** Si prefieres mantener una Deep Research por aplicante con dos modelos comparados, F1 es otro sistema: coste de IA por aplicante, deduplicación entre ejecuciones y otros criterios de «hecho». Los demás cambios (API en lugar de suscripciones, línea de comandos en lugar de computer use) afectan a piezas más pequeñas.
4. ¿Hampton usa hoy algún programa para aplicantes o alquileres (un CRM inmobiliario, hojas de cálculo)? Decide entre integrar y construir.
5. ¿Qué pesa más hoy en Hampton: alquileres, ventas, gestión de alquileres o comercial? Decide el orden de las fases.
6. ¿Hay acuerdos de comisión con otras agencias y con qué condiciones? Define el primer correo y el permiso para enseñar fotos.
7. ¿El correo de Hampton es Google Workspace, Microsoft 365 u otro? ¿Su dominio está o puede estar en Cloudflare? Decide cómo se envían y se leen los correos con agencias.
8. ¿Usan WhatsApp con clientes? ¿Tienen un número que pueda pasar a WhatsApp Business?
9. ¿Cuántos aplicantes nuevos llegan al mes y cuántas propiedades gestionan? Dimensiona costes y límites.
10. ¿Cómo pagan hoy los inquilinos (transferencia, orden permanente) y en qué banco? ¿Se puede exportar el extracto en CSV?
11. ¿Qué cámara 360 tienen y cuántos tours harían al mes? ¿Hay un PC con GPU NVIDIA? Decide entre construir o comprar el 3D.
12. ¿Optimyze opera el sistema para Hampton? Hace falta un acuerdo de tratamiento de datos y decidir a nombre de quién van las cuentas (Cloudflare ya está en la de AndresLeoSan).
13. ¿Hampton está registrada en la JFSC y en la JOIC? ¿Cobra rentas o depósitos en una cuenta propia? Decide qué controles de blanqueo y qué cuenta de clientes necesita la gestión de alquileres (F5).
14. ¿Qué plan de ChatGPT tiene cada empleado de Hampton (Free, Plus, Pro, Business o Enterprise) y quién lo paga? Decide si las automatizaciones con IA pueden usar ese plan (§6.5) y con qué datos. Añadida el 29-oct-2026.
15. ¿Un Hermes propio para Hampton, aparte del de Optimyze, y quién habla con él por Telegram: solo Luis o también el equipo de Hampton? Decide cómo se protege la llave de Hampton App y a quién responde el bot (§6.6). Añadida el 30-oct-2026. **Respondida el 30-oct-2026:** un Hermes propio para Hampton, en el mismo VPS y en su propia jaula; por Telegram le hablan Luis y el equipo de Hampton desde el inicio (PRE-31).
16. ¿Qué plan de ChatGPT usa Hermes (Plus, Pro, Business…) y permiten sus condiciones usarlo en el trabajo de un cliente? Decide qué datos puede recibir Hermes (§6.3, §6.5): con un plan personal, solo datos públicos y contadores, comprobando antes en su configuración de datos que OpenAI no entrena con lo que envía. Añadida el 30-oct-2026. **Respondida en parte el 30-oct-2026:** el plan de ChatGPT de Luis, solo con datos públicos y contadores. Falta que Luis diga qué plan es, compruebe sus condiciones y apague el entrenamiento (PRE-32).
