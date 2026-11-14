# hampton_intent_v1 · propuesta de intención de chat

- **Id:** `hampton_intent_v1`
- **Estado:** prevista — propósito para MSG-04; no se habilitan respuestas automáticas, cuenta, canal ni modelo.
- **Tarea dueña:** MSG-04; canal y política de datos en sus propios servicios.
- **Propósito:** proponer una intención del mensaje al flujo de chat cuando se cumplan las políticas y autorizaciones del canal y del propósito.
- **Disparador:** previsto: un propósito de chat revisado (`reviewed_chat_purpose`).
- **Entradas y clase de datos:** ninguna clase de datos queda acreditada (lista vacía en el registro); clasificación, finalidad, política y autorización deben verificarse sobre la entrada real. C3 no se habilita.
- **Salidas y efectos:** prevista: una intención propuesta al servicio dueño; errores, idioma no soportado o falta de vía llevan a una persona. No guarda criterios ni crea una cita o un cierre de búsqueda.
- **Guardas humanas y modo:** el equipo conserva las decisiones de match, consulta con imprescindible desconocido, cierre de búsqueda y revisión de presentación. Modo inicial Draft en `operation_policies`.
- **Interruptor:** ninguno conectado; `AUT10_MODES_READY` solo gobierna los modos.
- **Coste y límite:** tope y moneda `null`; coste desconocido requiere revisión.
- **Código:** `server/automation-contracts.js`, `server/operation-policy.js`
- **Pruebas que la cubren:** `tests/server/automation-contracts.test.mjs`, `tests/server/aut-10-operation-policy.test.mjs`
- **Criterio de hecho:** casos reales y adversarios, criterio por versión y evidencia en `acceptance.json` (hoy `pending`); las pruebas sintéticas no acreditan proveedor, latencia ni atención real.
