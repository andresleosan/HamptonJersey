# Cola de Luis

Lo que solo Luis, Hampton o un tercero pueden hacer o decidir. `/avanzar` añade filas aquí y **sigue trabajando**; no espera. Luis responde cuando quiera, en el chat o editando la fila, y la siguiente sesión aplica la respuesta y borra la fila.

Ordenado por cuántas tareas abiertas desbloquea cada cosa (`node scripts/avanzar-ruta.mjs`, bloque 3). Repositorio público: aquí no van claves, correos ni datos de personas.

## Lo que más desbloquea

| Tarea | Desbloquea | Qué hace falta |
| --- | --- | --- |
| PRE-32 | 60 | Decir qué plan de ChatGPT usa Hermes y qué datos puede tratar; sin eso ninguna automatización con modelo se conecta. |
| AUT-17 | 48 | Verificar cuenta y DNS de Cloudflare Email Service y autorizar encender `EMAIL_SERVICE_READY` con una prueba real de envío. Esa misma prueba cierra AUT-11 (barandillas de envío), que ya no tiene código pendiente. Poner `EMAIL_SERVICE_READY` a true **a la vez** en `wrangler.toml` y `jobs/wrangler.toml`. |
| AGE-12 | 8 | Decidir si encender `AGE12_PRESENTATIONS_READY` en `wrangler.toml`: abre la página pública `/presentation`, donde el cliente ve por enlace privado las casas que el equipo le presenta y responde a cada una (con nota libre). Recoge datos de clientes por la web pública, por eso solo lo enciendes tú. Ya está todo listo (migración 0086 aplicada, revisión de seguridad sin fallos graves). Decisión a confirmar: el enlace vale hasta que se revoca, sin caducidad (alcance del 9-nov); la sesión del cliente dura 7 días. Después, la prueba real (crear, enviar, responder y revocar) cierra AGE-12. |
| AGE-05 | 16 | Decidir si encender `AGE05_SEND_READY` (en `wrangler.toml` y `jobs/wrangler.toml` a la vez; una prueba exige que coincidan): con AUT-17 activo deja salir por correo las consultas a agencias, cada una con aprobación individual en la ficha. Para pararlo, apagarlo también en el reloj. Después, la prueba real cierra AGE-05. |
| PRE-03 | 21 | Hampton confirma sus registros en la JFSC (Schedule 2) y la JOIC. |
| PRE-33 | 11 | Preparar y enviar el paquete para el abogado de Jersey. |
| ADM-15 | 0 | Pedir al abogado de Jersey (puede ir en el paquete de PRE-33) la plantilla de carta de aviso de revisión de renta. El asistente, el RPI con fuente y el borrador para copiar ya están en Rentals › Change rent; con la plantilla se genera la carta y se cierra. |
| PRE-29 | 9 | Hampton responde la pregunta 13: registros y cobro de rentas en cuenta propia. |
| ANA-09 | 7 | Crear la regla de límite de peticiones en Cloudflare WAF. |
| PRE-28 | 7 | Verificar titularidad de las cuentas de Hampton y la operación de Optimyze. |
| BUS-13 | 3 | Hampton pone la categoría de vivienda de HE-R001, HE-R003 y HE-R027, y un abogado valida la tabla. |
| BUS-06 | 52 | Ya está en el panel (Settings › Automations › Market inventory). Cargar ahí el directorio privado de fuentes (`directorio-aceptado-verificado.local.json`) comparando la huella, abrir una tanda y subir el primer lote real de anuncios de un canal revisado. Con eso se cierra. |
| BUS-19 | 52 | En la misma pantalla, revisar cada canal que se vaya a usar: tipo «general», decisión (permitido, solo manual o denegado), referencia de evidencia, fecha de revisión y sitio. Los permisos por escrito solo hacen falta para las fuentes que los exijan. Con los primeros canales revisados se cierra. |
| PRE-06 | — | Configurar Cloudflare Access y comprobar la verificación en dos pasos de cada cuenta, cuando el código esté publicado. |
| VIS-12 | — | Dar acceso a la cuenta de Google Calendar para activar la integración, cuando el código esté publicado. |
| PRE-14 | 0 | Crear el bucket R2 privado de copias, un token con permiso solo de exportar D1 y la clave de recuperación que custodia Luis; sin eso la copia semanal cifrada no puede encenderse. |

El trámite de Meta (PRE-02) ya no está en la cola: el plan maestro lo retiró.

## Migraciones e interruptores que esperan su sí

Ninguno todavía. `/avanzar` añade aquí cada migración no aditiva o interruptor no autorizado, con el archivo, lo que cambia y la tarea que cierra.

## Decisiones de producto abiertas

| Tarea | Desbloquea | Qué hace falta |
| --- | --- | --- |
| AUT-10 | 1 | Decidido el 14-nov: todos los admins pueden cambiar modos. Falta una prueba real con tu sesión: Settings → Automations → Modes, cambiar un modo y volver a Draft. |

Solo entran las que los planes y la documentación no resuelven; mientras tanto se aplica la opción más simple y reversible y se anota aquí para que Luis pueda cambiarla.
