# sale_followup_weekly · revisión semanal interna de ventas

- **Id:** `sale_followup_weekly`
- **Estado:** activa — interruptor encendido en `hampton-jobs`, pero no crea tareas hasta que el equipo fija día y hora; si ya lo fijó en producción es desconocido.
- **Tarea dueña:** OFE-06; usa el productor de tareas de NOT-11.
- **Propósito:** recordar al equipo, una vez por semana de Jersey, revisar cada venta en curso.
- **Disparador:** el reloj (`clock`), a partir del día y la hora de Jersey guardados en `app_settings.sale_followup_schedule`.
- **Entradas y clase de datos:** ventas en curso y sus hitos (datos internos; clase exacta no fijada aquí).
- **Salidas y efectos:** una tarea compartida en el Inbox por venta y semana, idempotente; se resuelve al revisar o al cerrarse o caerse la venta. Nada se envía a nadie.
- **Guardas humanas y modo:** no aplica (sin IA). La revisión la hace una persona.
- **Interruptor:** `OFE06_WEEKLY_REVIEW_READY` = '1' en `jobs/wrangler.toml` y `wrangler.toml`, más el horario del equipo.
- **Coste y límite:** hasta 50 ventas por pasada; coste en dinero `null`.
- **Código:** `server/sale-followup.js`, `server/sale-followup-schedule.js`, `server/sale-followup-store.js`, `migrations/0053_sale_followup.sql`
- **Pruebas que la cubren:** `tests/server/ofe-06-sale-followup.test.mjs`, `tests/server/ofe-06-weekly-schedule.test.mjs`, `tests/server/ofe-06-store.test.mjs`, `tests/ofe06-weekly-review.e2e.cjs`
- **Criterio de hecho:** sin horario no crea nada; con horario, una tarea por venta y semana, sin duplicados en vueltas repetidas y sin envíos. Cumplido según OFE-06 (hecho); falta ver la primera tarea real cuando el equipo fije el horario.
