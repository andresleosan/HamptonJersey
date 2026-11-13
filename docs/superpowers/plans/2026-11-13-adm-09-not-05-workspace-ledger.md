# ADM-09 / NOT-05 · Lectura financiera por caso

Fecha: 13-nov-2026. Base de desarrollo: `c42c8cb`; los cambios son locales y no incluyen migraciones, rutas, concesiones, escrituras financieras ni avisos activados.

## Preparado

`readFinanceWorkspace` reúne en un único batch los saldos registrados, el paso de atraso, el contador de pasos registrados y una página de movimientos de una tenancy. La autorización exige el actor, la tenancy, el propósito y la capacidad de ADM-18, y se vuelve a comprobar en el mismo batch. La respuesta no incluye nombres, motivos de ajustes ni evidencias.

La continuación, limitada a 50 movimientos, comprueba la posición, el caso, la fecha, la revisión financiera, el estado actual de los pasos y la concesión. Un cambio devuelve conflicto; una revocación deniega la lectura. La huella no sustituye la autorización, que se exige en cada página.

Sin cargos vencidos el saldo, los atrasos y el contador son desconocidos, no cero. Con cargos, el cálculo se identifica como basado únicamente en registros existentes; no acredita que el historial esté completo y `reconciliation_ready` permanece siempre en falso. No se cierra ninguna tarea por un cero calculado.

## Comprobación y límites

Las pruebas sintéticas comprueban permiso y caso equivocados, historial desconocido, datos fraccionarios, orden de páginas, modificación de pagos o pasos entre páginas, concesión reemitida, revocación y lectura concurrente. D1 local comprueba la coherencia del saldo con sus movimientos, 110 movimientos paginados sin duplicados y el rollback tras revocar la concesión. Pasaron 113 regresiones focales, la suite completa (1.359 Node y 25 Python), las 10 pruebas del adaptador tras la última corrección, `build` y `check:release`. No hubo cambios de interfaz; navegador no aplica.

La huella refleja el estado actual de los pasos; no detecta necesariamente un cambio transitorio de paso que se revierta antes de la siguiente lectura. Tampoco garantiza una instantánea entre varias tenancies. Antes de conectar productores o contadores globales hace falta una versión monotónica compartida que cubra movimientos, pasos, política y ámbito, y validarla en la transacción de escritura.

Las rutas existentes de detalle, listado, contador y conciliación siguen usando los cálculos anteriores. Sustituirlas requiere revisar autorización y privacidad de cada consumidor, obtener evidencia real de completitud histórica, conservar los contratos y probar rendimiento; no conectar ajustes o cierre de avisos hasta entonces. La fecha `as_of` debe elegirla el servidor en Jersey; no reconstruye un historial inmutable. La ruta futura deberá imponer `no-store`, auditar el acceso según la política aprobada y no aceptar el actor desde el cliente. La escritura de ajustes aún necesita operación idempotente, CAS y recibo/evento en un batch; no se habilita en este tramo.

Integración sobre el main `85e97b3`: 1.392 pruebas Node y 25 Python, build, release y catálogo correctos. El adaptador continúa sin ruta activa ni conciliación global.
