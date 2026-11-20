# Correo de la app mediante Hermes con el Gmail de Hampton

Decisión de Luis del 21-nov-2026 (PRE-23): **todas las automatizaciones de la app se hacen mediante Hermes.** El correo sale desde el Gmail que Hampton ya usa, conectado al Hermes de Hampton, y las respuestas vuelven a ese buzón. Cloudflare Email Service, el traspaso del dominio en Wix y el DNS dejan de ser requisitos del correo. El dominio propio sigue sirviendo a la web (PRE-16).

Reglas que no cambian:
- El panel aprueba cada envío. Hermes solo entrega la versión aprobada y devuelve el resultado.
- Hermes no aprueba sus propios envíos, no reanuda la salida y no consulta libremente la base.
- Siguen igual la cola D1, la idempotencia, la cuota diaria, la pausa general, las bajas, los resultados inciertos en revisión y la retención de 30/90 días. Ya están construidos y no dependen del proveedor.

Estado comprobado el 21-nov:
- El Hermes de Hampton (contenedor `hermes`, v0.22.5) responde «You have no gmail account».
- Hermes 2 todavía no tiene sesión iniciada.

## Fases

| Fase | Entrega | Responsable | Aceptación |
| --- | --- | --- | --- |
| 1 | Conectar el Gmail en el Hermes de Hampton (alias `hampton`) y permitir su salida a Gmail en el proxy. | Luis | `hermes connectors accounts gmail` muestra la cuenta esperada. Quedan documentados los permisos concedidos, el envío, la lectura por hilo y los identificadores que devuelve. |
| 2 | Paso de una vivienda externa, con ficha o sin ella, a la consulta con contacto verificado. Reutiliza BUS-07, AGE-03 y AGE-04. | Desarrollo | Si falta la dirección o hay varios anunciantes, el panel pide elegir. Repetir la operación reutiliza la ficha y la consulta. |
| 3 | Transporte por finalidad: la cola deja de exigir `send_email` y `EMAIL_SERVICE_READY`. | Desarrollo | Hermes reclama solo los tipos de mensaje habilitados, con un único propietario por fila. Remitente y respuesta van al mismo Gmail. |
| 4 | Puente: operación de la puerta de Hermes con identidad propia. Toma un envío aprobado y devuelve un resultado autenticado: aceptado (con messageId y threadId), rechazado o incierto. Lleva una migración aditiva para cuenta, messageId y threadId. | Desarrollo | Tolera doble clic, dos ejecutores, la caída del VPS y la pérdida del acuse. Lo que pudo salir queda pendiente de comprobación hasta verlo en «Enviados». |
| 5 | Respuestas: Hermes trae solo los hilos de envíos de Hampton. | Desarrollo | La misma respuesta sincronizada dos veces da una sola entrada. Se distinguen respuesta humana, acuse, rebote y caso ambiguo. El empleado confirma el resultado (AGE-06). |
| 6 | Piloto con una consulta ficticia a un buzón de prueba. | Luis y desarrollo | Remitente correcto, una sola copia recibida, respuesta en la ficha correcta y tarea de llamada a los dos días laborables (AGE-08). Cierra AUT-11 y AGE-05. |

Si el conector de Hermes no permite limitar la lectura a los hilos de Hampton, la alternativa es un pequeño servicio propio con OAuth de Google y Gmail API, invocado por Hermes con la misma operación.

## Tareas afectadas

| ID | Cambio |
| --- | --- |
| PRE-23 | Recoge la nueva decisión, que sustituye la del 6-nov. |
| AUT-17 | Pasa a ser «Correo mediante Hermes». Cambia su responsable a desarrollo y su bloqueo a «conectar el Gmail». Ya no requiere Wix, DNS ni Email Sending. |
| AGE-05 | Se cierra cuando Gmail, vía Hermes, acepta el mensaje aprobado, la app registra el acuse y un segundo intento no duplica el envío. |
| AUT-11 | Su prueba real usa el transporte Hermes-Gmail. Cierra el componente de correo. |
| MSG-03 | Las respuestas llegan por Hermes y cada una aparece una sola vez. |
| AUT-13, PRE-13 | Hermes pasa a ver direcciones y respuestas: hay que definir la instancia y los acuerdos de tratamiento (Google y VPS). |
| ADM-10, ADM-12, ADM-18, ADM-19, NOT-10, OFE-02, PRE-12, REG-15, VIS-13, MSG-02 | Siguen dependiendo de AUT-17, ahora como canal Hermes. Cada una conserva su propio interruptor y su aprobación humana. |
| BUS-06 | Se quita de la cola de Luis porque está hecha desde el 20-nov. |

Las tareas cerradas que dependían de AUT-17 (ADM-03, ADM-09, ADM-14, ANA-08, NOT-08, NOT-09, PRE-10, PUB-16, SAP-08, VIS-04, VIS-08, VIS-10) siguen cerradas. Lo que dejaron pendiente de correo está en la lista «Traído de…» de AUT-17.

## Volver al envío manual

1. Apagar el interruptor de la finalidad, por ejemplo `AGE05_SEND_READY`, o pulsar Pause all outbound.
2. Conciliar los intentos que Hermes tenga reclamados.
3. Devolver a manual solo los que estén acreditados como no enviados. Los que salieron conservan sus identificadores y su evidencia.
