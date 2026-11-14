# email_outbound · correo saliente (resumen diario del equipo)

- **Id:** `email_outbound`
- **Estado:** apagada — `EMAIL_SERVICE_READY` = "false" en ambos Wrangler y preferencias apagadas por defecto; no se han enviado correos reales según AUT-17.
- **Tarea dueña:** AUT-17; su primer uso es el resumen de NOT-10 y sus barandillas son de AUT-11.
- **Propósito:** enviar desde la app el resumen de contadores de las 08:00 de Jersey a las direcciones del equipo aprobadas.
- **Disparador:** el reloj (`clock`), con la hora de proceso, a partir de las 08:00 de Jersey.
- **Entradas y clase de datos:** contadores del panel y direcciones del equipo (las direcciones son datos personales del equipo).
- **Salidas y efectos:** cola en D1 con instantánea aprobada e idempotencia, y envío por el binding `send_email` solo desde hello@hamptonestatesjersey.com. Sin reenvío automático de resultados inciertos.
- **Guardas humanas y modo:** una persona activa el resumen tras ver una muestra y elige los destinatarios; la pausa general (Pause all outbound) se comprueba antes de cada envío y solo el panel reanuda. Modo Draft/Approve/Auto: no aplica.
- **Interruptor:** `EMAIL_SERVICE_READY` = "true" (hoy "false") y el ajuste `email` con `enabled`, `summary` y aprobación.
- **Coste y límite:** `DAILY_LIMIT` = 100 intentos por día de Jersey, compartido; coste en dinero `null`.
- **Código:** `server/email.js`, `server/routes/email.js`, `migrations/0023_email.sql`
- **Pruebas que la cubren:** `tests/server/email.test.mjs`, `tests/server/email-admin.test.mjs`, `tests/server/jobs.test.mjs`
- **Criterio de hecho:** según AUT-17, una entrega real al equipo con el servicio montado y el interruptor encendido, sin doble envío y respetando la pausa y el tope.
