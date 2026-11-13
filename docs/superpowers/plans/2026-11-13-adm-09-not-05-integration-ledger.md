# ADM-09 / NOT-05 · Integración local parcial

Fecha: 13-nov-2026. Base comprobada: `9054dd1`. La última migración de esa base es `0044`; las migraciones `0045` y `0046` se ensayaron solamente en bases locales sintéticas. Esta sesión no ejecutó ninguna migración remota; su estado no se pudo verificar.

## Implementado en la copia

- Una proyección financiera interna calcula cargos, ajustes, pagos reales de renta, deuda, crédito y FIFO, también para contratos terminados. La proyección interna de pasos de atraso reutiliza esa misma base y deja sus parámetros posteriores libres para el consumidor.
- Las nuevas lecturas internas por tenancy comprueban la capacidad `sensitive_finance` y el propósito `arrears_management`, y revalidan la autorización en la misma transacción que la lectura. Las políticas, membresías y concesiones no se crean automáticamente.
- Los ajustes no crean pagos, son inmutables, rechazan importes fraccionarios y conservan una revisión financiera monotónica. Los lectores y el escaneo interno rechazan importes históricos no enteros, aun si las fracciones se compensan entre sí.
- La configuración de gracia afecta a la visibilidad del aviso, no a la fecha de vencimiento ni a los pasos de atraso. No se ha creado una ruta, aviso o interfaz nueva.

## Verificación y límites

Las pruebas locales cubren cálculos, comparación FIFO independiente de 40 cuentas, rechazo por caso o identidad, revocación entre comprobación y lectura, y serialización entre cobro y ajuste; la transacción y el rollback también se ensayaron en D1 local. La suite completa pasó con 1.316 pruebas Node y 25 Python, después de incorporar en la copia la corrección de espera de REG-06 ya publicada en `ff2374d`. Compilación y `check:release` pasaron. No se ejecutaron pruebas de navegador porque esta unidad no modifica interfaces.

La integración **no cierra ADM-09 ni NOT-05**. Las rutas existentes de detalle, listado, contador y conciliación todavía usan `ARREARS_SQL` o sumas antiguas y no tienen las nuevas guardas por caso. No se debe activar una escritura de ajustes ni conectar la proyección a esas rutas hasta migrar todos sus lectores de forma coherente y revisar sus permisos y comportamiento. La categoría, conciliación, vista y configuración de avisos siguen pendientes; la paginación aislada no constituye una instantánea global.

`source_revision` sigue movimientos financieros de la tenancy, no cambios en pasos de atraso ni en la política de avisos: cada operación futura debe revalidar todos sus predicados dentro de su transacción. `as_of` reevalúa los datos actuales con una fecha dada; no reconstruye una instantánea histórica inmutable. La retención y eliminación de ajustes inmutables requieren revisión antes de activarlos. La consulta común necesita perfilado D1 con volúmenes representativos antes de sustituir las rutas actuales.

## Revisión independiente y corrección

La revisión reprodujo que SQLite podía sustituir un ajuste por `INSERT OR REPLACE` cuando los triggers recursivos estaban desactivados. La prueba de colisiones de id, operación y reversión falló antes de la corrección y pasó después de añadir una guarda BEFORE INSERT; una prueba D1 local adicional comprueba que no se sustituya el ajuste por el identificador de operación. Las inserciones nuevas sin colisión siguen permitidas. No hay rutas nuevas conectadas; esta sesión no ejecutó 0045/0046 y su estado remoto no se pudo verificar.

Los futuros escritores deben resolver un reintento por su identificador antes de insertar: la guarda rechaza colisiones incluso con `OR IGNORE`. Aún no existe una API de escritura idempotente.

Sobre el main `2005312`, la suite integrada final pasó 1.349 pruebas Node y 25 Python; build, release y catálogo correctos. Esta sesión no activó ajustes ni rutas, ni ejecutó migraciones en producción; su estado remoto no se pudo verificar.

Consulta posterior de solo lectura de migraciones remotas: denegada por permisos. Esta sesión no ejecutó 0045/0046 y no pudo verificar su estado remoto.
