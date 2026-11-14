# rental_closure_withdrawal · retirada de alquileres a las 24 horas

- **Id:** `rental_closure_withdrawal`
- **Estado:** apagada — `PUB16_TIMED_CLOSURE_READY` no está en el repositorio y el esquema es una propuesta fuera de migraciones.
- **Tarea dueña:** PUB-16
- **Propósito:** retirar de la web un alquiler cuya ventana de corrección de 24 horas ha vencido.
- **Disparador:** el reloj (`clock`) cuando hay ventanas vencidas.
- **Entradas y clase de datos:** ventanas de cierre de fichas (datos de la ficha; sin datos de personas).
- **Salidas y efectos:** retira la ficha; si falla, crea una tarea urgente «Automatic withdrawal needs review». Todavía no cancela visitas ni avisa a nadie.
- **Guardas humanas y modo:** no aplica (sin IA). La corrección dentro de las 24 horas y cualquier reapertura son de una persona.
- **Interruptor:** `PUB16_TIMED_CLOSURE_READY` = '1'; ausente en el repositorio.
- **Coste y límite:** desconocido; coste en dinero `null`.
- **Código:** `server/rental-closure.js`, `server/rental-closure-job.js`, `docs/roadmap/work/PUB-16/rental-closure.proposed.sql`
- **Pruebas que la cubren:** `tests/server/pub-16-closure-job.test.mjs`, `tests/server/pub-16-closure.test.mjs`, `tests/server/pub-16-closure-d1.test.mjs`, `tests/server/pub-16-public-visibility.test.mjs`, `tests/pub16-timed-closure.e2e.cjs`
- **Criterio de hecho:** lo que pide PUB-16 antes de activar: esquema, identidad, retención, coste y vigilancia del reloj revisados, reapertura diseñada, y cancelación de visitas y avisos idempotentes.
