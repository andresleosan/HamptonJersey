# Cola de Luis

Lo que solo Luis, Hampton o un tercero pueden hacer o decidir. `/avanzar` añade filas aquí y **sigue trabajando**; no espera. Luis responde cuando quiera, en el chat o editando la fila, y la siguiente sesión aplica la respuesta y borra la fila.

Ordenado por cuántas tareas abiertas desbloquea cada cosa (`node scripts/avanzar-ruta.mjs`, bloque 3). Repositorio público: aquí no van claves, correos ni datos de personas.

## Lo que más desbloquea

| Tarea | Desbloquea | Qué hace falta |
| --- | --- | --- |
| PRE-32 | 60 | Decir qué plan de ChatGPT usa Hermes y qué datos puede tratar; sin eso ninguna automatización con modelo se conecta. |
| AUT-17 | 48 | Verificar cuenta y DNS de Cloudflare Email Service y autorizar encender `EMAIL_SERVICE_READY` con una prueba real de envío. |
| PRE-03 | 21 | Hampton confirma sus registros en la JFSC (Schedule 2) y la JOIC. |
| PRE-33 | 11 | Preparar y enviar el paquete para el abogado de Jersey. |
| PRE-29 | 9 | Hampton responde la pregunta 13: registros y cobro de rentas en cuenta propia. |
| ANA-09 | 7 | Crear la regla de límite de peticiones en Cloudflare WAF. |
| PRE-28 | 7 | Verificar titularidad de las cuentas de Hampton y la operación de Optimyze. |
| BUS-13 | 3 | Hampton pone la categoría de vivienda de HE-R001, HE-R003 y HE-R027, y un abogado valida la tabla. |
| BUS-19 | — | Permisos por escrito de las fuentes del mercado que los exijan; el resto de fuentes y el código ya no esperan. |
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
