# retention_daily · borrado diario por conservación

- **Id:** `retention_daily`
- **Estado:** activa — corre en el primer tic de cada día de Jersey; primer borrado real el 30-oct-2026 según AUT-07.
- **Tarea dueña:** PRE-12; también aportan tramos AUT-01 (trabajos de Hermes), MSG-02 (chats web) y AUT-17 (correo).
- **Propósito:** borrar lo que ha superado su plazo de conservación sin que nadie tenga que acordarse.
- **Disparador:** el reloj (`clock`), una vez por día de Jersey con hasta 3 intentos; si el reloj se para, la consulta del panel hace de respaldo.
- **Entradas y clase de datos:** contactos y solicitudes de visita (datos personales; clase exacta no fijada aquí), trabajos de Hermes, chats web, correo y métricas de búsqueda.
- **Salidas y efectos:** borra contactos con 12 meses sin actividad y visitas de más de 12 meses (salvo ventas, ofertas abiertas y búsquedas activas o en revisión), trabajos de Hermes 90 días después de su última actividad (nunca un borrador), chats a los 30 días y contenido de correo a los 30 días y metadatos a los 90. Los registros solo dicen cuántos.
- **Guardas humanas y modo:** no aplica (sin IA). Las excepciones de conservación están en SQL; la revisión de vencimientos en Applicants es manual.
- **Interruptor:** ninguno.
- **Coste y límite:** `RETENTION_CAP` = 500 por tipo y pasada, lo demás al día siguiente; coste en dinero `null`.
- **Código:** `server/retention.js`, `server/email-retention.js`, `server/jobs.js`
- **Pruebas que la cubren:** `tests/server/retention.test.mjs`, `tests/server/jobs.test.mjs`, `tests/server/email.test.mjs`, `tests/server/pub19-retention-isolation.test.mjs`
- **Criterio de hecho:** una sola pasada por día de Jersey, reintento tras fallo, respeto de todas las excepciones y del tope, y registros sin datos de personas. Los plazos legales definitivos dependen de PRE-12 y PRE-33 (abiertas).
