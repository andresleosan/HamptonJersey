# Correo de la app mediante Hermes con el Gmail de Hampton

## Decisiones de Luis

**21-nov-2026 (PRE-23).** Todas las automatizaciones de la app se hacen mediante Hermes. El correo sale desde el Gmail que Hampton ya usa, conectado al Hermes de Hampton, y las respuestas vuelven a ese buzón. Cloudflare Email Service, el traspaso del dominio en Wix y el DNS dejan de ser requisitos del correo. El dominio propio sigue sirviendo a la web (PRE-16).

**21-nov-2026, segunda ronda.** Respuestas de Luis:

| Pregunta | Decisión |
| --- | --- |
| Conexión | Google Cloud + OAuth con la API de Gmail. Gmail no es un conector de Nous Portal en Hermes v0.22.5. Desde el 21-nov, por seguridad, el token lo guarda el cartero (fase C), no la skill `google-workspace` de Hermes. |
| Interruptores | Uno por tipo de correo en Settings › Automations: **Confirmar disponibilidad** y **Coordinar visitas**. Apagado, Hermes deja el correo en Borradores de Gmail. Encendido, lo envía solo, sin aprobación uno a uno. El interruptor es la aprobación. |
| Visitas | Van a los dos. A la agencia o el propietario, para acordar el día y la hora. Al cliente, solo si al registrarse no dejó días y horas para visitas (`applicants.viewing_availability` vacío), para preguntárselos. |
| Texto | Lo redacta Hermes con IA, a partir de los datos mínimos que le da la app. |

Consecuencias que Luis acepta con estas respuestas:
- Con el interruptor encendido, el correo sale sin que una persona lo lea. Para estos dos tipos, esto sustituye la revisión individual del plan maestro (R01).
- Hermes recibe por su puerta los datos mínimos del destinatario: correo, nombre, la casa y las franjas. Hasta ahora la puerta solo daba datos públicos y contadores (H6, H7). PRE-13 debe cubrir a Google y al proveedor del modelo.

## Lo que no cambia

- La app decide qué correo toca, a quién y en qué modo. Hermes no elige el destinatario, no se pone el modo él mismo y no puede reanudar una salida pausada.
- Siguen igual Pause all outbound, el límite diario, las bajas y la regla de un envío por versión.
- Un resultado dudoso queda pendiente de comprobación en el panel y no se reintenta solo.
- Un interruptor general, `HERMES_MAIL_READY`, apagado por defecto en los dos `wrangler.toml`, lo para todo. Encenderlo es decisión de Luis.

Estado comprobado el 21-nov:
- El Hermes de Hampton (contenedor `hermes`, v0.22.5) no tiene cuenta de Gmail.
- Tiene instalada la skill `google-workspace`, pero sin `gws`. Su script `google_api.py` envía y responde, pero no crea borradores.

## Cómo funciona

1. **La app prepara la tarea.** El reloj crea una fila en `mail_tasks`, una sola por motivo:
   - Consulta de disponibilidad lista para salir (AGE-03/AGE-05), a la agencia.
   - Propuesta de visita abierta (VIS-17), a la agencia.
   - Búsqueda sin días y horas, al cliente, para preguntárselos.
2. **Hermes la recoge.** Cada 10 minutos pide `GET /api/hermes/mail/next`. La app comprueba el interruptor general, la pausa, el límite diario y el interruptor del tipo, y entonces reserva una tarea. Devuelve el modo (`draft` o `send`), el destinatario, los datos mínimos y las reglas de redacción.
3. **Hermes la redacta.** Escribe el asunto y el texto en inglés con IA, sin inventar datos, firmado por Hampton Estates.
4. **Hermes la entrega.** En modo `draft`, crea un borrador en Gmail. En modo `send`, la envía.
5. **Hermes devuelve el resultado.** Llama a `POST /api/hermes/mail/:id/result` con el token de la reserva, el resultado (`drafted`, `sent`, `failed` o `unknown`), el texto que escribió y los identificadores de Gmail. La app lo guarda en la ficha. Un envío acreditado arranca los plazos de AGE-08.
6. **Las respuestas vuelven.** Llegan al mismo hilo. Que se traigan a la ficha es la fase C, que es MSG-03 y AGE-06.

## Fases

| Fase | Entrega | Responsable | Aceptación |
| --- | --- | --- | --- |
| A | Migración aditiva `mail_tasks`, los dos interruptores en Automations, `HERMES_MAIL_READY` apagado, las operaciones de la puerta (`next` y `result`) y los productores de las tres tareas. | Desarrollo | Pruebas: el modo sigue al interruptor del tipo. Con la pausa o el interruptor general apagado no se reserva nada. Un resultado repetido no duplica. Una reserva vencida queda `unknown`. Sin días ni horas, va una tarea al cliente. |
| B | Conectar el Gmail con OAuth: activar la verificación en dos pasos de la cuenta (Google Cloud la exige), proyecto de Google Cloud, API de Gmail, pantalla de consentimiento, cliente «Desktop» y autorización desde el cartero (`correo.mjs autorizar` y `codigo`, permiso `gmail.compose`), no desde Hermes, para que el token nunca entre en su contenedor. Cambio del 21-nov tras la revisión de seguridad. | Luis, guiado paso a paso | El cartero guarda el token y un borrador de prueba aparece en Gmail. |
| C | Skill `hampton-correo` y tarea programada de Hermes cada 10 minutos, con un pequeño script para crear borradores (la API `users.drafts.create`). | Desarrollo y Luis (instalarla es configuración de Hermes) | Con una casa y una agencia ficticias: con el interruptor apagado aparece el borrador en Gmail; con el interruptor encendido llega un solo correo al buzón de prueba. |
| D | Respuestas a la ficha: Hermes lee solo los hilos de `mail_tasks` y la app los asocia (AGE-06, MSG-03). | Desarrollo | La misma respuesta, sincronizada dos veces, da una sola entrada. Se distinguen respuesta humana, acuse y rebote. |
| E | Piloto real, cierre de AGE-05 y AUT-11, y avance de VIS-13. | Luis y desarrollo | Remitente correcto, una sola copia, respuesta en su ficha y tarea de llamada a los dos días laborables. |

## Tareas afectadas

| ID | Cambio |
| --- | --- |
| PRE-23 | Recoge las decisiones del 21-nov, que sustituyen la del 6-nov. |
| AUT-17 | Pasa a ser «Correo mediante Hermes». La construye desarrollo, y su bloqueo es conectar el Gmail (fase B). |
| AGE-05 | Se cierra cuando Gmail, vía Hermes, acepta la consulta, la app registra el acuse y un segundo intento no duplica. Con el interruptor apagado, queda en borrador. |
| VIS-13, VIS-17 | La coordinación de visitas por correo usa la tarea de agencia y la de cliente de este plan. |
| AUT-11 | Su prueba real usa el transporte Hermes-Gmail. |
| MSG-03, AGE-06 | Las respuestas llegan por Hermes y cada una aparece una sola vez (fase D). |
| AUT-13, PRE-13 | Hermes pasa a ver direcciones y datos mínimos de clientes, así que los acuerdos de tratamiento deben cubrir a Google y al proveedor del modelo. |
| ADM-10, ADM-12, ADM-18, ADM-19, NOT-10, OFE-02, PRE-12, REG-15, MSG-02 | Siguen dependiendo de AUT-17, ahora como canal Hermes. Cada una conserva su interruptor. |
| BUS-06 | Se quita de la cola de Luis porque está hecha desde el 20-nov. |

Las tareas cerradas que dependían de AUT-17 siguen cerradas. Lo que dejaron pendiente de correo está en la lista «Traído de…» de AUT-17.

## Volver al envío manual

1. Apagar el interruptor del tipo: lo nuevo queda en borradores.
2. Si hace falta parar todo, pulsar Pause all outbound o apagar `HERMES_MAIL_READY`.
3. Conciliar en el panel las tareas reservadas o dudosas.
4. Los envíos que salieron conservan su texto y sus identificadores de Gmail.

## Fase C: piezas construidas (21-nov-2026, apagadas)

- La puerta tiene su propia clave, `HERMES_MAIL_KEY` (creada el 21-nov en Pages y en `/root/hampton-hermes/secretos/hermes_mail_key`), y tres operaciones: `POST mail/next`, `POST mail/:id/check` y `POST mail/:id/result`. La comprobación se hace una sola vez por reserva, justo antes de Gmail (migración 0122). Si hay pausa o el tipo volvió a borradores, la tarea vuelve a la cola. Si hay una baja, o la consulta o la propuesta ya no está como se reservó, se cancela. Sin comprobación, no se acepta un borrador ni un envío.
- `hermes/correo.mjs`, el **cartero**: un servicio aparte en el VPS, fuera del contenedor de Hermes. Solo él guarda la clave del correo, el token de Google y las reservas. Hermes le pide `POST /siguiente`, que devuelve los datos para redactar sin la dirección ni el token, y le entrega `POST /entregar {id, subject, body}`. El cartero comprueba, pone la dirección que eligió la app, crea el borrador o envía, y devuelve el resultado. Antes de llamar a Gmail marca «enviando», y guarda el resultado antes de comunicarlo: si se corta, da `unknown` y nunca llama dos veces. Un acuse perdido se repite en la siguiente llamada.
- `hermes/skills/hampton-correo/SKILL.md`: la skill de Hermes, un correo por ejecución, solo con `curl` al cartero.

Instalación (configuración del VPS y de Hermes: la hace o autoriza Luis, después de la fase B):
1. Contenedor `hampton-cartero` con `node hermes/correo.mjs`, `APP_ORIGIN`, `HERMES_MAIL_KEY_FILE`, `GOOGLE_TOKEN_FILE` (el token `authorized_user` de la fase B, que no se copia en Hermes) y `ESTADO_DIR` privado. Va en una red propia con el contenedor de Hermes de Hampton, y su proxy de salida deja pasar solo la app, `oauth2.googleapis.com` y `gmail.googleapis.com`.
2. Una clave propia para llamar al cartero (`CARTERO_KEY_FILE` en el cartero y en Hermes, distinta de la del correo); el cartero solo escucha en una dirección privada. En Hermes, `CARTERO=http://<dirección privada>:8788`, `CARTERO_KEY_FILE`, la skill y la tarea programada cada 10 minutos.
3. Con una casa y una agencia ficticias: con el interruptor apagado aparece el borrador. Después Luis decide encender `HERMES_MAIL_READY`.
