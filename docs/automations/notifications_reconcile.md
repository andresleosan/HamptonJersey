# notifications_reconcile · conciliación de avisos del Inbox

- **Id:** `notifications_reconcile`
- **Estado:** activa — corre en cada vuelta del reloj, sin interruptor.
- **Tarea dueña:** NOT-01; producen o leen estos avisos también NOT-05, NOT-08 y NOT-11.
- **Propósito:** abrir, actualizar y cerrar los avisos de pendientes (plazos de alquiler, impagos, comprobaciones, ventas en espera, fichas por confirmar) sin depender de que alguien abra el panel.
- **Disparador:** el reloj (`clock`) con la hora de proceso, cada 10 minutos.
- **Entradas y clase de datos:** alquileres, contratos, cobros, comprobaciones, ventas y fichas (datos internos; clase exacta no fijada aquí).
- **Salidas y efectos:** genera los cobros pendientes con el cálculo existente y escribe avisos y observaciones en D1 por lotes con cursor; no envía nada fuera de la app.
- **Guardas humanas y modo:** no aplica (sin IA). Un aviso lo resuelve una persona o el cierre de su origen.
- **Interruptor:** ninguno.
- **Coste y límite:** 50 identidades por pasada; coste en dinero `null`.
- **Código:** `server/notification-reconcile.js`, `server/notification-tasks.js`, `server/jobs.js`
- **Pruebas que la cubren:** `tests/server/notification-reconcile.test.mjs`, `tests/server/notification-categories.test.mjs`, `tests/server/notification-tasks.test.mjs`, `tests/server/jobs.test.mjs`
- **Criterio de hecho:** pasadas repetidas no duplican avisos, una pasada concurrente no retrocede el cursor y un fallo no detiene el reloj. Cumplido según NOT-01 (hecho).
