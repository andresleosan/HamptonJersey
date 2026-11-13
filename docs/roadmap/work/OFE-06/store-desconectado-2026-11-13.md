# OFE-06 · Productor semanal desconectado — 13 nov 2026

**Estado: prototipo parcial, no listo para conectar.** Base `fdb89948d38c020fa804593c20f960cc3ce04005`. `server/sale-followup-store.js` no está importado por el reloj ni por rutas; sus funciones **sí escriben si se invocan**, por lo que esta evidencia solo autoriza el ensayo en bases ficticias y desechables. No se han consultado datos reales ni aplicado migraciones remotas.

## Comportamiento ensayado

`prepareSaleFollowup` exige una venta, semana de lunes, generación y revisión de fuente, instante y configuración semanal, más un actor con `case_data_write`/`sale_review` para esa venta. El actor debe provenir de una sesión autenticada, nunca del cuerpo de una petición; la capacidad se vuelve a comprobar dentro del mismo lote que la escritura. Solo acepta una de las ventanas informativas vencidas del horario recibido. El esquema de fixture exige unicidad por venta y semana. Repetir el tick devuelve la misma tarea; no cambia Done, asignación, plazo humano ni revisión. Otra venta o semana produce su propia tarea.

Si cambió la revisión de fuente o el vencimiento configurado, un registro existente devuelve `needs_review` sin modificar la tarea. El vencimiento configurado se conserva por separado del plazo que una persona puede editar. Una venta cerrada, una generación o revisión obsoletas, una tarea/evento incongruentes o un resultado sin proyección no producen una tarea nueva. El evento solo contiene versión, ID de venta, semana e instante programado; no hay envío ni copia de datos de cliente.

`closeSaleFollowup` es una llamada explícita para una venta y semana, no una suscripción al cierre de ventas. Revalida estado cerrado, instante de cierre, generación, revisión, identidad del evento y capacidad; cierra la tarea una sola vez y conserva la decisión y asignación humanas. Si cambia la fuente antes del lote, no cierra con la revisión anterior. El cierre de varias semanas requeriría un consumidor acotado; no existe aquí.

Evento, proyección común, registro y comprobación de integridad se ejecutan en un único `DB.batch`. El marcador propuesto es `WITHOUT ROWID` para conservar el ID del evento para `taskStatements`; una proyección omitida o fallida hace fallar el lote en el fixture. Este mecanismo depende de las garantías y del esquema exacto de D1 y todavía requiere revisión independiente.

## Bloqueos para integrar o activar

- [`store-prototype.sql`](store-prototype.sql) es una **propuesta para fixtures**, no una migración. Añade una fuente con generación sintética y revisión incrementada por cambios de venta e hitos para ensayar carreras. No existe aquí una autoridad acreditada que emita generaciones para todas las ventas existentes y futuras, preserve identidad ante borrado/recreación o confirme que todos los cambios relevantes incrementan la revisión. El módulo tampoco verifica que ese esquema y sus triggers estén realmente instalados e íntegros.
- La propuesta conserva fuentes mediante referencias que pueden impedir el borrado de ventas; eso afecta al ciclo de vida y retención existentes y debe rediseñarse y aprobarse antes de proponer cualquier migración activa. La unicidad por ID y semana falla de forma conservadora si se reutiliza un ID; no demuestra la identidad de una venta recreada.
- La configuración y `at` entran como parámetros: el servicio no acredita quién los creó ni revalida una versión persistida en el lote. Comparar el vencimiento guardado detecta un cambio de hora, pero no todos los cambios de versión con el mismo vencimiento. Se requiere configuración/activación fiable, reloj autorizado y guardas transaccionales antes de usarlo.
- La prueba concede capacidades ficticias a un actor de personal. No define ni concede capacidad al actor automático del reloj; tampoco acredita el filtrado por caso de Inbox, detalle y contador. Hace falta una política de autoridad, revocación y visibilidad integral antes de conectar el consumidor.
- La función temporal solo ofrece semana actual y anterior. No hay decisión, cursor ni recuperación de más de una semana, ni recorrido de ventas/cola acotado, ni resolución automática al cerrar una venta. Revisión de permisos, datos históricos, reconciliación, retención, índice/escala, límites de tzdata, migración y despliegue siguen pendientes. OFE-06 no se considera completa.

## Pruebas locales

`node --test --test-concurrency=1 tests/server/ofe-06-store.test.mjs tests/server/ofe-06-weekly-schedule.test.mjs`: **32/32**. Los casos incluyen doble tick concurrente, venta y semana distintas, revisión de venta e hito, cierre y carreras, capacidades ajenas o revocadas, error y omisión silenciosa de proyección con rollback, identidad incongruente, cambio de horario y preservación de decisiones. Una prueba usa D1 efímero de Miniflare con las migraciones existentes y la propuesta SQL aplicadas solo al fixture, y verifica concurrencia, rollback y ausencia de filas de salida. Las primeras pruebas de creación, cierre e inconsistencias se observaron fallar antes de corregirlas.

No se ejecutaron suite completa, build ni E2E: no hay cambio de interfaz y la suite completa requiere coordinación. Estos resultados no prueban permisos, configuración, reloj ni estado de producción.
