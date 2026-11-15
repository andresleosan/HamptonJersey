# rental_closure_withdrawal · retirada de alquileres a las 24 horas

- **Id:** `rental_closure_withdrawal`
- **Estado:** apagada — `PUB16_TIMED_CLOSURE_READY` no está en el repositorio; el esquema es la migración 0087.
- **Tarea dueña:** PUB-16
- **Propósito:** retirar de la web un alquiler cuya ventana de corrección de 24 horas ha vencido y, 24 horas después de alquilar o vender, avisar al equipo de las demás visitas pendientes.
- **Disparador:** el reloj (`clock`) cuando hay ventanas vencidas, alquileres retirados o ventas completadas hace 24 horas.
- **Entradas y clase de datos:** ventanas de cierre de fichas, ventas completadas y visitas futuras de esa ficha (el título de la tarea lleva el nombre del cliente, como en EST-15).
- **Salidas y efectos:** retira la ficha; si falla, crea una tarea urgente «Automatic withdrawal needs review». Crea una tarea «Property let/sold, cancel the viewing: …» por cada visita futura reservada antes del cierre, una sola vez. No cancela visitas ni envía nada.
- **Guardas humanas y modo:** no aplica (sin IA). La corrección dentro de las 24 horas, la reapertura con «Return to market» y la cancelación de visitas son de una persona.
- **Interruptor:** `PUB16_TIMED_CLOSURE_READY` = '1'; ausente en el repositorio.
- **Coste y límite:** 25 ventanas y 50 visitas por pasada; coste en dinero `null`.
- **Código:** `server/rental-closure.js`, `server/rental-closure-job.js`, `migrations/0087_rental_closure.sql`
- **Pruebas que la cubren:** `tests/server/pub-16-closure-job.test.mjs`, `tests/server/pub-16-closure.test.mjs`, `tests/server/pub-16-closure-d1.test.mjs`, `tests/server/pub-16-public-visibility.test.mjs`, `tests/pub16-timed-closure.e2e.cjs`
- **Criterio de hecho:** migración 0087 aplicada, interruptor encendido en los dos `wrangler.toml` y recorrido comprobado en producción. El aviso por correo a los clientes de esas visitas es de AUT-17.
