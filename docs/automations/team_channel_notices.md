# team_channel_notices · avisos y resumen en el canal del equipo

- **Id:** `team_channel_notices`
- **Estado:** activa — fase 1a, sin IA, desde el 3-nov-2026 según AUT-14 (no comprobado en esta entrega); el avisador vive en el VPS, fuera de este repositorio.
- **Tarea dueña:** AUT-14; la puerta de la app es de AUT-13.
- **Propósito:** avisar al canal privado de Telegram de cada aplicante nuevo y solicitud de visita, y publicar el resumen de las 08:00 de Jersey.
- **Disparador:** el avisador pregunta a la puerta `news` cada minuto y `status` a las 08:00 de Jersey.
- **Entradas y clase de datos:** C0 y contadores: tipo de novedad, referencia y título de la ficha publicada, enlace al panel. Nunca quién.
- **Salidas y efectos:** mensajes de texto fijo en el canal; la app solo responde, no envía a Telegram. Si un envío falla, el avisador avisa a Luis en privado.
- **Guardas humanas y modo:** desde el canal nadie da órdenes; el avisador no lee Telegram. Modo: no aplica (sin IA).
- **Interruptor:** el secreto `HERMES_KEY` de la puerta (sin él, cerrada) y el propio avisador en el VPS.
- **Coste y límite:** una consulta por minuto; coste en dinero `null`. Sin límite de peticiones en el WAF todavía (pendiente en AUT-13).
- **Código:** `server/routes/hermes.js`, `hermes/key-proxy.mjs`
- **Pruebas que la cubren:** `tests/server/hermes.test.mjs`, `tests/server/key-proxy.test.mjs`
- **Criterio de hecho:** según AUT-14, un aplicante nuevo produce su aviso en el canal en uno o dos minutos sin datos personales y el resumen llega a las 08:00 de Jersey; falta comprobar el resumen y el aviso de fallo. El código del avisador no tiene prueba en este repositorio.
