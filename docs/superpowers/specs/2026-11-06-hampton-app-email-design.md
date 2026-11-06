# Hampton App · Correo saliente y entrante (AUT-17)

Fecha: 6-nov-2026 · Estado: aprobada íntegramente por Luis el 6-nov-2026 (respuesta «1», remitente, respuestas, resumen recurrente, cuota y conservación). Implementación autorizada con pruebas y revisión local; sin publicación ni migraciones de producción.

Base leída: `main` en `a0c7bcf`, arquitectura P-19, AUT-17 y NOT-10 del checklist, `DESIGN.md`, pausa de AUT-11 y reloj de AUT-07. El texto privado de Luis se ha leído sin modificarlo ni incorporarlo a Git.

## Qué se quiere conseguir

La app envía correo con Cloudflare Email Service y guarda las respuestas para que el equipo las lea en el panel. Hampton conserva el buzón que usa cada día. El primer uso es el resumen de las 08:00 de Jersey al equipo, sin envíos a clientes ni agencias. Construir esta base no completa los flujos dependientes de F2 ni la bandeja multicanal de MSG-03.

Decisión ya tomada por Luis: Cloudflare Email Service, sin otro proveedor, con aprobación humana en el panel para el correo externo. Las propuestas de identidad, resumen recurrente, cuota y conservación fueron confirmadas íntegramente por Luis en este chat. Las decisiones menores de implementación se distinguen en el ledger.

## Hallazgos comprobados y límites de esta preparación

- **Pages:** Wrangler instalado, 4.148.0, no incluye `send_email` en los campos admitidos por Pages. Añadirlo al `wrangler.toml` raíz como dice hoy AUT-17 impediría validar la configuración. Pages puede guardar y aprobar los envíos en D1; el Worker hermano los envía con su binding. Así se mantiene Pages, el Worker y la misma D1, sin una API de envío pública ni otra llave.
- **Recepción:** Email Routing necesita sus propios MX y no puede compartir los del mismo dominio con un servidor externo de correo. Propongo una dirección literal en un subdominio para las respuestas, conservando los MX del buzón habitual. El alta del subdominio depende también del estado de Email Routing de la zona: se verificará antes de tocar DNS.
- **Cuenta:** `wrangler email sending list` no pudo consultar dominios: el taller no tiene autenticación de Cloudflare disponible para Wrangler. No se ha comprobado el plan contratado ni si el dominio está incorporado. El fallo de consulta no demuestra que falte el alta. No se solicitan ni se guardan tokens por el chat.
- **Código existente:** `server/jobs.js` ejecuta el borrado diario, pero aún no despacha correo. `server/routes/automations.js` y `admin/src/Automations.jsx` ya tienen la pausa general; no hay tabla outbound ni parser de correo instalado.
- No se han enviado mensajes, cambiado DNS, aplicado migraciones ni publicado nada.

## Diseño aprobado e implementado en local

### Identidad y activación

- Nombre visible: **Hampton Estates**.
- Remitente propuesto: `hello@hamptonestatesjersey.com`, sujeto a verificar que Hampton autoriza esa dirección y su dominio de envío.
- Respuestas propuestas: `replies@app.hamptonestatesjersey.com`, con regla literal hacia el Worker. No se necesita catch-all ni cambiar la recepción del dominio principal.
- El correo sale desactivado hasta completar la configuración y activarlo en el panel. La ausencia de binding, identidad o lista de destinatarios mantiene el envío cerrado y se explica en Automations.
- Workers Paid e incorporación del dominio son requisitos para enviar a destinatarios externos arbitrarios. La documentación permite envíos gratuitos a destinos verificados; no equivale a tener habilitado el envío general.
- Las direcciones del equipo se configuran dentro del panel, sin guardarlas en documentación pública. No se toma automáticamente la lista de todos los usuarios autorizados.

### Primer uso: resumen para el equipo (NOT-10)

- En Settings → Automations, tarjeta **Email** con configuración, estado, envíos aceptados hoy, fallos y pendientes de revisar; tarjeta **Daily team summary** con destinatarios y activación explícita.
- La persona revisa una muestra del resumen y activa el envío diario para esos destinatarios. Esa activación autoriza únicamente el resumen interno recurrente. Los futuros correos a clientes o agencias siguen necesitando aprobación del contenido y de los destinatarios en el panel.
- El resumen reutiliza los contadores actuales de `openCounts` y el resumen de `server/routes/hermes.js`: aplicantes nuevos, visitas pendientes, coincidencias por revisar, ventas, alquileres, aplicantes por caducar y borradores pendientes. Incluye además el número de fichas «To confirm» y de chats esperando respuesta, con enlace al panel, sin nombres ni datos de clientes. Se envía por separado a cada destinatario; la lista de otros destinatarios no aparece en el correo.
- El reloj existente prepara y envía una vez por destinatario y fecha local a partir de las 08:00 en `Europe/Jersey`, también con el cambio de hora. Si estuvo parado, lo intenta durante ese día; al pasar al siguiente no manda resúmenes viejos. Las preferencias tienen efecto antes del siguiente envío.
- Propuesta de límite inicial: **100 intentos de envío al día de Jersey**, compartidos por todos los correos. El límite se reserva de forma atómica antes de llamar al servicio; incluye resultados inciertos. Alcanzarlo deja la cola pendiente, sin perderla.
- **Pause all outbound** también detiene este resumen. Antes de cada llamada al proveedor se vuelve a comprobar pausa, configuración, baja y autorización. Una pausa no puede retirar un correo que el proveedor ya haya aceptado.
- La tarjeta y la barra actuales se actualizarán para decir que la pausa también afecta al resumen interno. Los topes por agencia de AUT-11 siguen pendientes del flujo de consultas a agencias; este límite compartido no los sustituye.

### Salida y revisión humana

- Tabla `outbound`: plantilla, entidad y versión como clave de idempotencia, destinatario normalizado, contenido aprobado e inmutable, fecha, aprobador cuando corresponda, estado, intentos y `messageId` de Cloudflare. Para el resumen: fecha de Jersey y destinatario en la clave; el snapshot queda fijado al preparar el envío.
- Estados visibles: borrador, aprobado/en cola, enviándose, aceptado por Cloudflare, fallido, resultado desconocido, cancelado. **Aceptado** no se presenta como entregado al buzón.
- Aprobaciones y cambios se registran en `events`. Los envíos externos futuros solo podrán salir desde una versión aprobada; Hermes no recibe permiso de envío.
- El Worker toma cada envío mediante una actualización condicional en D1, evitando que dos ticks lo despachen a la vez. Reserva la cuota en la misma operación transaccional que toma el trabajo. No se mantiene una transacción abierta durante la llamada de red.
- No se promete entrega exactamente una vez: si el servicio acepta y el proceso cae antes de registrar su respuesta, el envío queda con resultado desconocido y requiere revisión humana. No se reencola automáticamente un envío cuya aceptación es incierta.
- Los resultados desconocidos sin revisar se cuentan globalmente, sin limitarse al día, y tienen enlace al filtro paginado **Pending review**. Permanecen hasta reconocer su revisión o cumplir la conservación de metadatos de 90 días. Reconocerlos los retira de pendientes, conservando su resultado desconocido y sin reenviarlos.
- Solo se reintentan automáticamente fallos documentados como rechazo anterior a la aceptación y recuperables, como un límite temporal; máximo tres intentos. Un timeout o un fallo interno ambiguo va a revisión. Una respuesta aceptada guarda el `messageId` antes de cerrar el trabajo.
- Los resúmenes caducados aún en cola se cancelan. Un trabajo en «enviándose» que no se cierra dentro del plazo operativo va a resultado desconocido, nunca de vuelta a la cola. Si el contenido alcanza su plazo de borrado mientras sigue pendiente se cancela antes de borrarlo. La tarjeta permite revisar estado, hora, referencia y resultado del proveedor; no ofrece un botón que repita a ciegas un envío incierto.
- Lista de bajas local más las supresiones del proveedor. Dar de baja tiene efecto sobre trabajos pendientes. Los fallos permanentes de destinatario bloquean nuevos intentos. El equipo puede desactivar su resumen desde el panel.
- Plantilla común en inglés, HTML y texto plano, con identidad de Hampton, contacto existente del aviso de privacidad y enlace absoluto a `https://www.hamptonestatesjersey.com/#/privacy` (la ruta del aviso existente en `site/apply.js`). No se inventan razón social, registro ni otra información legal.

### Entrada y lectura

- `hampton-jobs` incorpora `email()`; la regla de Cloudflare entrega únicamente la dirección de respuestas configurada. Su cron sigue funcionando. Sin URL pública de Worker.
- Se analiza MIME con `postal-mime`; texto y HTML entrantes son contenido no fiable. Nunca se ejecutan ni se muestran HTML, scripts, imágenes remotas o adjuntos del remitente. La primera versión muestra texto plano y avisa de que los adjuntos no se guardan.
- Propuesta de límites: rechazar por SMTP correos mayores de 1 MiB antes de parsearlos; guardar como máximo 50.000 caracteres de texto y señalar truncamiento. Validar campos y cabeceras, limitar su longitud y deduplicar por una clave derivada del mensaje recibido, sin confiar únicamente en un Message-ID arbitrario.
- Enlazar `[HE-OUT-…]` y cabeceras de hilo solo cuando el envío existe y el remitente coincide con su destinatario esperado. La dirección de sobre y la cabecera From no prueban identidad: no se concede acceso ni se modifica una casa, visita o aplicante por recibir un correo. Un correo ambiguo queda sin enlazar para revisión; un reenvío de otra persona no se une automáticamente.
- Resolver conjuntamente los marcadores del asunto, In-Reply-To y References: las pistas reconocidas deben señalar un único envío al destinatario esperado; un marcador de asunto sin resolver o pistas contradictorias no producen vínculo. References puede ser la única pista; los ancestros ajenos a la app no crean una asociación por sí solos.
- Los fallos de persistencia no se tratan como éxito: se deja fallar el handler según el contrato documentado del proveedor; el plan debe verificar su comportamiento de reintento y deduplicación. Nunca se responde automáticamente desde `email()`.
- Lectura de respuestas en una sección **Email** del panel, con paginación, vista de texto, vínculo al envío si lo hay y borrado. No mezcla todavía chats y correos ni permite redactar correo libre. Recibir una baja no ejecuta instrucciones del texto: una persona la revisa y marca al remitente como suprimido.
- Si falla el refresco de un detalle ya cargado, se conserva su texto con aviso de posible desactualización y reintento directo; el éxito devuelve el foco al detalle actualizado. Una revisión ya guardada no se vuelve a enviar al reintentar su lectura.
- Propuesta de conservación: cuerpos entrantes y contenido saliente, 30 días; metadatos de estado e intentos, 90 días. Borrado diario junto al reloj; las claves mínimas de deduplicación y supresión se conservan según su función y se documentan expresamente en el plan. El borrado de contactos eliminará contenido personal relacionado; se revisará el aviso de privacidad antes de activar la recepción real.
- Logs y avisos de Hermes: códigos de error permitidos, horas y contadores; nunca direcciones, asuntos ni cuerpos. Acceso a configuración, lectura y borrado solo con la autenticación del panel y las comprobaciones de origen existentes.

## Qué queda fuera

Consultas a agencias, interpretación por IA, recordatorios de visitas, portal, respuesta por email a chats, marketing, bandeja multicanal, gestión de adjuntos y tracking de aperturas. Los puntos que dependen de AUT-17 siguen pendientes hasta implementar su flujo y verificarlo.

## Criterios para dar por construido

1. Con configuración ausente o apagada, ninguna llamada al servicio de envío; el panel explica qué falta.
2. Cron repetido o concurrente: una sola preparación y toma por destinatario/día; cuota compartida respetada incluso con concurrencia.
3. Pausa, baja o desactivación anteriores a la llamada impiden el envío. Resultado incierto no genera reenvío automático.
4. Horario de Jersey probado en invierno, verano y ambos cambios de hora; resumen caducado no se manda al día siguiente.
5. Handler MIME probado con duplicados, cabeceras hostiles, límite de tamaño, referencia ajena y error de persistencia; no ejecuta acciones de negocio.
6. Panel probado con datos sintéticos en 1280 y 390: configuración, activación, estados vacíos/de error, teclado, foco, zoom, consola y red. `npm test`, build y check:release; e2e según su cabecera, dejando explícitos los bloqueos reales del taller.
7. Migración aditiva con el siguiente número libre al implementar. Sin datos personales en documentos, capturas ni commits públicos.
8. La entrega real se valida después, con autorización para el SHA concreto y un destinatario del equipo controlado: un correo recibido y una respuesta visible en la app. Una simulación local no cumple este criterio externo.

## Estado de entrega y siguiente paso

Luis confirmó íntegramente la propuesta y autorizó plan, implementación, pruebas, revisión local y commit. [Plan](../plans/2026-11-06-hampton-app-email.md) y [ledger](../plans/2026-11-06-hampton-app-email-ledger.md) registran la construcción. Migración aditiva 0023, solo aplicada en bases de prueba locales; correo desactivado por defecto y preparación externa false. Las direcciones, cuota y conservación están fijadas por esta aprobación.

El Worker usa la hora de procesamiento para evitar que un trigger retrasado envíe el resumen del día anterior. Contenido HTML de entrada se conserva únicamente como fuente de texto cuando falta la parte plain text; nunca se interpreta. Un cambio o borrado durante una llamada ya iniciada conserva la incertidumbre y borra el contenido requerido, sin afirmar que el proveedor canceló la entrega. Hashes de deduplicación hasta 90 días; hashes de baja hasta retirada expresa. El panel configura y retira bajas introduciendo la dirección conocida, sin publicar una lista de direcciones suprimidas.

La revisión independiente y las correcciones H1/H2/H3 están registradas en el ledger, con sus regresiones y cierre local. Quedan fuera del encargo autorizado la configuración real de la cuenta/routing, publicación y migraciones de producción aprobadas para un SHA concreto, y entrega/respuesta reales. El taller no pudo verificar la cuenta ni los MX; no se afirma que falte el plan o el alta. La documentación consultada no garantiza reintentos tras un fallo de persistencia del handler: se rechaza su promesa sin ocultar el error, y la comprobación externa sigue pendiente.

Revisión de construcción del diseño: agente independiente, solo lectura, 6-nov-2026. Sus precisiones sobre contenido del resumen, pausa, trabajos caducados/atascados, topes por agencia y recepción no garantizada se incorporaron antes de la aprobación. Ninguna decisión imprescindible nueva para Luis.

## Fuentes consultadas el 6-nov-2026

- [Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/): binding, resultado `messageId` y errores.
- [Dominios](https://developers.cloudflare.com/email-service/configuration/domains/) y [subdominios](https://developers.cloudflare.com/email-service/configuration/subdomains/): separación de envío/recepción y conflicto de MX con el buzón externo.
- [Precios](https://developers.cloudflare.com/email-service/platform/pricing/): Paid para destinatarios arbitrarios y excepción de destinos verificados.
- [Bindings de Pages](https://developers.cloudflare.com/pages/functions/bindings/) y validación de Pages de Wrangler 4.148.0 instalada: no admite `send_email` en la configuración de Pages. Comprobado con el validador real `readPagesConfig`, expuesto en una copia del módulo en memoria y una configuración temporal: el control sin binding pasa y el mismo control con binding falla con `Configuration file for Pages projects does not support "send_email"`. Sin modificar Wrangler ni la configuración real. El build de Functions por sí solo compila sin ejecutar esta validación; no demuestra que el binding sea publicable.
