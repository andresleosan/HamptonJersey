# ADM-18 / ADM-09 / NOT-05 · Identidad y lectura financiera por caso

Fecha: 13-nov-2026. Base local `e296405`; la migración `0049` es provisional y debe reconciliarse con el main al integrar. Esta sesión no ejecutó migraciones remotas. La consulta del estado remoto fue denegada, por lo que no se conoce qué migraciones están aplicadas allí.

## Preparado

- La revisión financiera de una tenancy avanza también al insertar, modificar o borrar pasos de atraso; una modificación transitoria revertida invalida una continuación anterior. El incremento y el paso se confirman o revierten juntos.
- La lectura interna de hasta diez tenancies explícitas usa la misma proyección que el detalle y comprueba cada capacidad en el mismo batch. Un caso denegado o inválido impide entregar resultados parciales. Los importes desconocidos no se convierten en cero y `reconciliation_ready` continúa en falso. Es una selección acotada, no un listado completo ni una instantánea global.
- Para `tenancy`, `rental` y `sale`, borrar el caso o reinsertar un ID revoca su autoridad; se impide transferirla por cambio de ID, alias de rowid, `INSERT OR REPLACE` o `UPDATE OR REPLACE` en las claves únicas conocidas. Política, membresía y concesión no pueden sustituirse o borrarse para revivir versiones antiguas. Las escrituras de autoridad fallan si aparecen índices únicos no revisados. No se crean concesiones ni datos de caso.
- `rental_application` permanece denegado aun si aparece una tabla con ese nombre: requiere un contrato de tabla y protección de ciclo de vida propios. Si faltan protecciones o aparece un índice único no revisado en un caso o en la autoridad, la guarda deniega el acceso; vuelve a verificarlo en el batch.

## Impacto y decisiones pendientes

`0049` conserva las membresías existentes con `lifecycle_generation=0`, pero la guarda no las acepta: una membresía antigua podría apuntar a un ID reutilizado antes de esta protección. Para recuperar acceso se necesita revocarla y reaprobarla explícitamente con referencia nueva y generación 1, y emitir una concesión nueva ligada a su versión. No existe aún una interfaz de gestión ni se ha hecho esa operación. Este cambio puede interrumpir accesos existentes y requiere revisión de impacto antes de aplicarse.

La prohibición provisional de borrar filas de política, membresía y concesión conserva versiones y evita revivir snapshots, pero puede entrar en conflicto con futuras obligaciones de supresión. Antes de activar hace falta una política aprobada y un diseño de tombstones o borrado que preserve la no reutilización. Los bloqueos de colisión son deliberadamente conservadores y rechazan también inserciones con resolución de conflicto sobre casos ya existentes; revisar compatibilidad con cualquier nuevo importador o índice único.

Las rutas legadas, el contador global, la conciliación, avisos y escritura de ajustes siguen sin conectar. No existe reloj global ni prueba de integridad completa del historial. Antes de habilitarlos hacen falta políticas, revisión de retención, identidad y permisos por caso, operación idempotente con CAS/recibo, controles de error y rendimiento, y comprobación real de las migraciones aplicadas. La fecha debe elegirla el servidor en Jersey y `as_of` no reconstruye una instantánea histórica inmutable.

## Verificación local

Pasaron 135 regresiones de permisos, finanzas, alquileres y notificaciones; las 28 pruebas de esquema pasaron tras conservar el contrato de errores de unicidad. Después de las últimas protecciones, 86 pruebas focales y la suite completa (1.416 Node y 25 Python) pasaron, igual que `build` y `check:release`. En D1 local se probaron rollback, snapshots anteriores, borrado y recreación de los tres tipos, colisiones `REPLACE`, actualización con datos ficticios previos y lectura conjunta de diez casos. Las pruebas de ciclo de vida también cubren alias de rowid e índices únicos desconocidos. No hubo cambios de interfaz; navegador no aplica.
