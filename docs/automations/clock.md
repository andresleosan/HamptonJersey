# clock · el reloj de hampton-jobs

- **Id:** `clock`
- **Estado:** activa — en producción desde el 29-oct-2026 según AUT-07 (no comprobado en esta entrega).
- **Tarea dueña:** AUT-07; la pantalla Automations que lo vigila es AUT-01.
- **Propósito:** despertar cada 10 minutos lo que está vencido, con un solo reloj, y dejar constancia de cada vuelta.
- **Disparador:** cron de Cloudflare `*/10 * * * *` (UTC) sobre el Worker `hampton-jobs`, sin URL pública.
- **Entradas y clase de datos:** solo la hora del disparo; cada pasada que lanza lee sus propios datos (ver sus fichas).
- **Salidas y efectos:** escribe `app_settings.clock` con la hora de la vuelta y llama, en orden, a las pasadas de retención, demanda, avisos, Insights semanal, revisión semanal de ventas, retirada de alquileres y correo. Las pasadas de avisos, Insights, ventas y alquileres tienen su propio try/catch, así que su fallo no detiene las siguientes.
- **Guardas humanas y modo:** no aplica (sin IA, sin fila en `operation_policies`). Automations avisa si lleva más de 30 minutos sin vuelta.
- **Interruptor:** ninguno propio; cada pasada tiene el suyo.
- **Coste y límite:** 144 vueltas al día; coste en dinero `null` (desconocido).
- **Código:** `server/jobs.js`, `jobs/wrangler.toml`, `server/routes/automations.js`
- **Pruebas que la cubren:** `tests/server/jobs.test.mjs`, `tests/server/automations.test.mjs`
- **Criterio de hecho:** cada vuelta deja su hora; un fallo de una pasada protegida no impide las demás; Automations marca el reloj como parado pasados 30 minutos. Cumplido según AUT-07 (hecho).
