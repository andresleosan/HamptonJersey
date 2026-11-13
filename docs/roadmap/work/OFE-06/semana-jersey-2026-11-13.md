# OFE-06 · Semana y horario local

> Nota: el contrato descrito aquí fue sustituido por la [revisión de ventanas](revision-ventanas-2026-11-13.md).

Se preparó una función pura y desconectada que devuelve semana de lunes de Jersey y estado de espera o vencimiento con día y hora explícitos. La ausencia de configuración mantiene el horario desactivado; una configuración o reloj inválidos no habilitan trabajo. El cálculo no lee ni escribe D1, no crea tareas, no usa correo y no está conectado al reloj.

Las pruebas locales cubren cambio de año, horario de invierno, salto de primavera y repetición de otoño. Si el reloj salta una hora local, el primer instante observado posterior puede quedar vencido; las dos ocurrencias de una hora repetida comparten la misma semana. La futura integración debe confirmar estas semánticas y garantizar unicidad por venta/semana en la escritura: el cálculo por sí solo no ofrece idempotencia.

Persistencia, revisión humana, cierre de ventas, identidad, permisos, retención y configuración real siguen pendientes. No se han aplicado migraciones ni consultado cuentas o producción. La tarea permanece parcial y no añade un cierre.
