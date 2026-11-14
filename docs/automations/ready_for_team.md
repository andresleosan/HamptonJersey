# ready_for_team · «Ready for the team» en el resumen de las 08:00

- **Id:** `ready_for_team`
- **Estado:** prevista — sin código.
- **Tarea dueña:** AUT-18
- **Propósito:** que el resumen de las 08:00 del canal diga cuántos aplicantes tienen propuestas listas para el equipo.
- **Disparador:** previsto: una persona marca al aplicante; el avisador lo cuenta en `status` a las 08:00 de Jersey.
- **Entradas y clase de datos:** previsto: solo el número de aplicantes marcados (contador, C0).
- **Salidas y efectos:** prevista: una línea fija más en el resumen del canal con enlace al panel; sin nombres ni texto libre.
- **Guardas humanas y modo:** la marca la pone y la quita una persona. Modo: no aplica (sin IA).
- **Interruptor:** desconocido.
- **Coste y límite:** desconocido; coste en dinero `null`.
- **Código:** ninguno
- **Pruebas que la cubren:** ninguna
- **Criterio de hecho:** según AUT-18, Luis marca un aplicante y el resumen siguiente lleva esa línea y el enlace; otra cuenta del canal no ve más que eso.
