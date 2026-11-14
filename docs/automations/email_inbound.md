# email_inbound · correo entrante

- **Id:** `email_inbound`
- **Estado:** apagada — sin `EMAIL_SERVICE_READY` = "true" todo mensaje se rechaza.
- **Tarea dueña:** AUT-17
- **Propósito:** recibir respuestas en replies@app.hamptonestatesjersey.com y mostrarlas en la sección Email del panel.
- **Disparador:** cada correo que Cloudflare entrega al Worker del reloj (manejador `email`).
- **Entradas y clase de datos:** correos de terceros (pueden traer datos personales; remitente no fiable).
- **Salidas y efectos:** guarda texto y cabeceras acotados (máximo 1 MiB, sin adjuntos) y una pista de hilo; no ejecuta acciones de negocio.
- **Guardas humanas y modo:** una persona lee y decide; el emparejamiento de hilo es solo una pista. Modo: no aplica.
- **Interruptor:** `EMAIL_SERVICE_READY` = "true" (hoy "false").
- **Coste y límite:** 1 MiB por mensaje; coste en dinero `null`.
- **Código:** `server/email-inbound.js`, `server/jobs.js`
- **Pruebas que la cubren:** `tests/server/email-inbound.test.mjs`, `tests/server/jobs.test.mjs`
- **Criterio de hecho:** según AUT-17, una respuesta real visible en Email con la recepción del subdominio configurada, y su contenido borrado a los 30 días.
