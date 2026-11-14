# listing_text · borrador de texto de ficha

- **Id:** `listing_text`
- **Estado:** apagada — el tipo de trabajo existe en la puerta de Hermes, pero ningún modelo lo toma hasta la fase 1b (PRE-32) y la lista de borradores está vacía; no se acredita conexión de un modelo.
- **Tarea dueña:** AUT-13; autorización del modelo en AUT-05, modo en AUT-10 y lista de borradores en AUT-15.
- **Propósito:** preparar una propuesta de texto para una ficha a petición del equipo o de Hermes, con los datos públicos que permite el servicio propietario.
- **Disparador:** una persona de la lista de borradores pulsa «Ask Hermes for a draft», o Hermes pide trabajo (`/api/hermes/jobs`, `/api/hermes/jobs/next`).
- **Entradas y clase de datos:** solo el DTO público de la ficha publicada que entrega la ruta existente; clase prevista C0. La clasificación y la versión concretas deben comprobarse antes de cualquier ejecución futura.
- **Salidas y efectos:** un borrador en la tabla `jobs` para revisión; nunca publica ni aprueba un texto por sí mismo.
- **Guardas humanas y modo:** una persona usa o descarta el borrador en el panel. Una propuesta no aprueba un match, una consulta con imprescindibles desconocidos, el cierre de una búsqueda ni una presentación. Modo inicial Draft en `operation_policies` (migración 0054); el modo no autoriza ninguna de esas decisiones.
- **Interruptor:** `HERMES_KEY` para la puerta, lista de borradores (AUT-15) y, para los modos, `AUT10_MODES_READY`.
- **Coste y límite:** tope y moneda `null` (sin autorizar gasto); al alcanzar el tope futuro pasa a Draft y un coste desconocido requiere revisión. Un trabajo abierto por ficha y fallo al tercer intento.
- **Código:** `server/routes/hermes.js`, `server/automation-contracts.js`, `migrations/0018_jobs.sql`, `migrations/0054_operation_policies.sql`
- **Pruebas que la cubren:** `tests/server/hermes.test.mjs`, `tests/server/automation-contracts.test.mjs`, `tests/server/aut-10-operation-policy.test.mjs`, `tests/server/aut-10-modes.test.mjs`
- **Criterio de hecho:** casos reales y adversarios con umbral propio y evidencia en `acceptance.json` (hoy `pending`); los fixtures de este repositorio no demuestran conexión, calidad ni recepción real.
