# market_ambiguity_v1 · propuesta ante ambigüedad del mercado

- **Id:** `market_ambiguity_v1`
- **Estado:** prevista — propósito para BUS-09; no hay lector ni conexión de modelo activados.
- **Tarea dueña:** BUS-09; política de fuente en BUS-19 y envío autorizado en AUT-13.
- **Propósito:** proponer una interpretación de un extracto de observación revisado cuando una extracción necesite aclaración.
- **Disparador:** previsto: una observación revisada con ambigüedad (`reviewed_observation`).
- **Entradas y clase de datos:** únicamente un extracto clasificado y revisado como C0 conforme al diseño; un texto público no es C0 por sí solo si incluye datos personales o ubicación precisa. Deben respetarse fuente, política, territorio y revisión de la observación.
- **Salidas y efectos:** prevista: una propuesta acotada con citas verificables; una persona decide si incorpora los hechos. No confirma disponibilidad ni permiso.
- **Guardas humanas y modo:** revisar el extracto y el resultado. No se aprueba un match o una consulta con imprescindible desconocido, ni se resuelve una búsqueda o revisa una presentación automáticamente. Modo inicial Draft en `operation_policies`.
- **Interruptor:** ninguno conectado; `AUT10_MODES_READY` solo gobierna los modos.
- **Coste y límite:** tope y moneda `null`; coste desconocido requiere revisión y no habilita una llamada.
- **Código:** `server/automation-contracts.js`, `server/operation-policy.js`
- **Pruebas que la cubren:** `tests/server/automation-contracts.test.mjs`, `tests/server/aut-10-operation-policy.test.mjs`
- **Criterio de hecho:** casos reales y adversarios, criterio propio y evidencia en `acceptance.json` (hoy `pending`); los ejemplos sintéticos no prueban acceso, cobertura ni funcionamiento de un proveedor.
