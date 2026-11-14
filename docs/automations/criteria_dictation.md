# criteria_dictation · dictado de criterios con confirmación

- **Id:** `criteria_dictation`
- **Estado:** prevista — sin código.
- **Tarea dueña:** AUT-19
- **Propósito:** preparar, a partir de lo que dicta el empleado, los valores anteriores y propuestos de los criterios para que los confirme.
- **Disparador:** previsto: el empleado dicta o escribe los cambios que aceptó el cliente.
- **Entradas y clase de datos:** criterios de búsqueda del aplicante (datos personales; clase exacta desconocida). No por Telegram.
- **Salidas y efectos:** prevista: una propuesta antes/después y un aviso en el Inbox; nada cambia hasta confirmar.
- **Guardas humanas y modo:** confirmar criterios dictados es siempre humano (`dictated_criteria_confirmation` en `server/operation-policy.js`). Modo: desconocido.
- **Interruptor:** desconocido.
- **Coste y límite:** desconocido; coste en dinero `null`.
- **Código:** ninguno
- **Pruebas que la cubren:** ninguna
- **Criterio de hecho:** según AUT-19, dictar subir el presupuesto no cambia datos hasta confirmar, no altera otros imprescindibles y al confirmar recalcula sin duplicados.
