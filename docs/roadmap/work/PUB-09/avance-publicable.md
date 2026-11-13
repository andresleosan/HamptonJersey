# PUB-09 · Avance local de trazabilidad de la web propia

**Actualización posterior:** los checks de Pages y Jobs de `9054dd1` terminaron correctamente. La migración, activación y uso en producción no se verifican con esos checks; véase la [conciliación de despliegue](../conciliacion/2026-11-13-release-reg11-pub.md). Las secciones siguientes registran la construcción y pruebas locales anteriores.

13 de noviembre de 2026. Se construyó en una copia local la retirada editorial con motivo y nota privada desde el editor y la lista, junto con el historial privado y las correcciones que conservan el registro original. La retirada no cambia la disponibilidad física ni atribuye motivos a datos históricos desconocidos. Las métricas sin productor real siguen como desconocidas o no registradas.

La retirada, su evento y su recibo se guardan en un único lote; las correcciones usan una revisión esperada y no generan otra retirada. Las comprobaciones locales cubren operaciones repetidas, respuesta perdida y republicación, conflictos, revocación de acceso antes de confirmar, aislamiento por ficha y ausencia de notas privadas en respuestas públicas y eventos generales. El historial permanece restringido al equipo autenticado.

La migración aditiva `0044_listing_withdrawals.sql` se ha aplicado únicamente a bases ficticias de prueba, incluida D1 local. El flujo nuevo está desactivado por defecto mediante `PUB09_WITHDRAWALS_READY`; también se verificó la retirada anterior sin las tablas nuevas. No se ha aplicado la migración remota ni activado la funcionalidad por este avance.

En la copia de desarrollo pasaron 1.264 pruebas Node y 25 pruebas Python; entre ellas se comprobaron 15 casos focales, incluidas transacciones y revocación en D1 local. El navegador aislado con datos ficticios comprobó editor y lista a 1280 y 390 píxeles, teclado, foco, zoom al 200 %, correcciones y reconciliación tras una respuesta perdida. También pasaron compilación y control de release. Estas pruebas no acreditan el despliegue ni el recorrido autenticado en producción.

Tras integrar el código en una copia basada en `b25d0b4`, pasaron 77 pruebas focales y de regresión, `team:check` y de nuevo el navegador aislado en ambos tamaños.

Quedan pendientes verificar la integración y el despliegue, la migración y activación correspondientes, la comprobación real del recorrido y la supresión física de notas según la política PRE-12. La tarea permanece parcial y no aumenta el número de tareas terminadas. PUB-15, sus portales, feeds e identificadores están retirados del alcance vigente y no son una dependencia de PUB-09.
