# weekly_insights · resumen semanal de Insights

- **Id:** `weekly_insights`
- **Estado:** activa — tramo Inbox; el envío por correo a la dirección sigue pendiente.
- **Tarea dueña:** ANA-08
- **Propósito:** dejar cada lunes desde las 08:00 de Jersey una foto fija de la semana anterior en el Inbox del equipo.
- **Disparador:** el reloj (`clock`); la primera vuelta desde el lunes a las 08:00 de Jersey crea la semana.
- **Entradas y clase de datos:** totales agregados (vistas, solicitudes de visita, aplicantes nuevos, visitas hechas) y referencias de fichas; sin datos de personas.
- **Salidas y efectos:** una fila inmutable en `weekly_insights` y su aviso en Messages; ningún correo.
- **Guardas humanas y modo:** no aplica (sin IA).
- **Interruptor:** ninguno.
- **Coste y límite:** una foto por semana; coste en dinero `null`.
- **Código:** `server/weekly-insights.js`, `migrations/0036_weekly_insights.sql`, `server/jobs.js`
- **Pruebas que la cubren:** `tests/server/weekly-insights.test.mjs`, `tests/weekly-insights.e2e.cjs`, `tests/server/jobs.test.mjs`
- **Criterio de hecho:** una sola foto por semana, correcta en semanas con cambio de hora y con reintento tras fallo; para cerrar ANA-08 falta la entrega por correo a la dirección con AUT-17 operativo.
