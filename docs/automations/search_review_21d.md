# search_review_21d · revisión interna a los 21 días

- **Id:** `search_review_21d`
- **Estado:** prevista — existe un cálculo puro del reloj de Jersey, sin productor ni consumidor.
- **Tarea dueña:** BUS-17
- **Propósito:** a los 21 días sin opción completa, abrir una revisión interna con hasta 20 alternativas explicables.
- **Disparador:** previsto: el reloj (`clock`) cuando una búsqueda activa lleva 21 días sin opción completa; repetición a los 7 días.
- **Entradas y clase de datos:** criterios y candidatos de la búsqueda (datos de aplicante; clase exacta desconocida).
- **Salidas y efectos:** prevista: una tarea interna en el Inbox. Nunca un correo al cliente ni un cambio de criterios.
- **Guardas humanas y modo:** el equipo elige qué alternativas tratar; no se aplica nada automáticamente. Modo: desconocido.
- **Interruptor:** ninguno todavía.
- **Coste y límite:** hasta 20 alternativas por revisión; coste en dinero `null`.
- **Código:** `server/search-review-clock.js`, `server/search-coverage.js`
- **Pruebas que la cubren:** `tests/server/search-review-clock.test.mjs`, `tests/server/search-coverage.test.mjs`
- **Criterio de hecho:** según BUS-17, al día 21 se crea una revisión interna explicable, sin correo al cliente ni cambio de criterios, y el día 22 continúa el matching.
