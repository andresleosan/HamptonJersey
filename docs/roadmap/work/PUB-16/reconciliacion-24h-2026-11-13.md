# PUB-16 · Conciliación del plazo de 24 horas

13-nov-2026. La ficha mostraba como pendientes la comprobación en producción y las restricciones VIS-10, pero omitía decisiones explícitas posteriores del plan de estados. Esta conciliación aclara el alcance; no cambia el producto ni afirma que el plazo esté activo.

## Decisiones que siguen pendientes

El [plan de estados](../../../superpowers/plans/2026-11-08-pub-16-estados-canales.md) recoge que, al confirmar el cierre de alquiler de una ficha identificada, esta permanece con «Let agreed» durante 24 horas exactas desde la marca del servidor. El equipo puede corregir el cierre durante ese plazo. Al vencer, si no se corrigió, la ficha debe dejar de ser pública incluso si el reloj aún no corrió; el historial y los medios se conservan. El reloj retira de forma idempotente y un fallo crea tarea urgente. La corrección conserva cambios posteriores o devuelve conflicto.

Tras esas 24 horas sin corrección, deben cancelarse las otras visitas afectadas y prepararse o enviar los avisos conforme al canal disponible y con tratamiento de resultados inciertos; una corrección válida impide esa cancelación. Luis también decidió esperar 24 horas tras completar una venta para cancelar las otras visitas y avisar, sin alterar por inferencia los demás efectos existentes de Sales. AUT-17 condiciona el envío real, no justifica afirmar que ocurrió.

El plan vigente de [ANA-10](../../../superpowers/plans/2026-11-10-ana-10-qr-agregado.md) también exige verificar la retirada temporal y todas las cachés antes de activar QR. La lectura de `server/listing-editorial.js` muestra transiciones manuales con evidencia e idempotencia, pero `return_to_market` establece `to_let` y no acredita restauración del estado previo ni un plazo que venza. `server/routes/public.js` y `server/seo.js` no contienen esa regla temporal en la proyección examinada; `server/media.js` conserva caché pública de medios. El rechazo de nuevas reservas durante `let_agreed` ya está cubierto por la entrega anterior y no demuestra los demás efectos.

Faltan vínculo y marca inequívocos de cierre, escritura y corrección concurrentes, visibilidad consistente a los 24 horas en todas las superficies y cachés, cron recuperable, tarea urgente, cancelación y avisos idempotentes. Deben probarse con datos ficticios y revisar su coordinación con EST-17, VIS-10, NOT-11 y AUT-17. No se inspeccionó D1 remoto ni se modificaron ventas, visitas, servicios o datos reales.
