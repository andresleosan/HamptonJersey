# Conciliación de registro, estados y notificaciones

13 de noviembre de 2026. Revisión documental en una copia aislada integrada después sobre la base local `1813b01`, sin consultar ni modificar producción. Los resultados históricos y las pruebas locales se distinguen a continuación; los compromisos posteriores del tablero pueden cambiar las cifras de progreso antes de publicar esta actualización.

## REG-08 · Requisitos y hogar

El código `cfb3d3c` y la migración `0031_requirement_priorities.sql` son anteriores a la base revisada. El [registro de REG-05](../REG-05/acceptance.md) documenta que el 11 de noviembre Pages servía `b544c2e` y que la consulta de migraciones no mostraba pendientes, incluida 0031. La [verificación anterior](../../../superpowers/plans/2026-11-09-reg-08-verificacion-continuidad-ledger.md) recoge pruebas de conservación, prioridades, parking, edades y recorrido local; no constituye una nueva consulta remota.

El 13 de noviembre `tests/reg08-e2e.cjs` pasó en navegador aislado con datos ficticios a 1280 y 390 píxeles, incluidos prioridades, edades, validación, teclado, envío, reintento y zoom. Se ejecutó sobre la base `b5a6334` con los ajustes de pruebas después guardados en `603c237`. La versión antigua esperaba un interruptor de mascotas ya sustituido: la prueba actual comprueba el aviso y la regla vigente de mascotas declaradas como imprescindibles. No se atribuye a esa ejecución una prueba autenticada nueva en producción.

## REG-11 · Registro por modalidad

La [conciliación de registro](../../../superpowers/plans/2026-11-10-paq-02-registro-ledger.md) registra la publicación de `9b8dbd41` y la aplicación de 0025. El [ledger original](../../../superpowers/plans/2026-11-07-reg-11-registration-ledger.md) conserva la prueba local posterior con envíos ficticios de traspaso y de compra/alquiler con presupuestos separados. El 13 de noviembre pasó `tests/reg11-review-e2e.cjs` en navegador aislado para hogar y selección de ventas sobre `b5a6334` con los ajustes después guardados en `603c237`. Esa prueba no repitió todo el registro público ni un envío en producción.

Durante esta conciliación se reprodujo que la API respondía 500 a una fecha imposible con mes fuera de rango. La corrección candidata local `841f8be` devuelve errores de campo, conserva las fechas históricas válidas y comprueba años bisiestos. En la copia anterior basada en `9054dd1` pasaron 110 pruebas focales, 1.268 Node y 25 Python, compilación y control de release; sobre `1813b01` volvieron a pasar las 110 pruebas de registro. La corrección no se ha integrado ni verificado en producción en esta copia. REG-11 permanece parcial hasta integrar y comprobar esa corrección. El matching comercial pertenece a M04 y no es un requisito para cerrar el registro.

## EST-17 · Estados de la ficha

La [evidencia de implementación](../EST-17/implementation-evidence.md) registra la publicación `f211376` y la aplicación remota de 0034 el 9 de noviembre, con 53 tablas conservadas, comprobación de claves foráneas y verificaciones de Pages y Jobs. También distingue el recorrido local del intento MCP que no pudo iniciar. El 13 de noviembre `tests/listing-editorial.e2e.cjs` pasó en navegador aislado a 1280 y 390 píxeles: revisión, versión obsoleta, estados de alquiler, errores, teclado y zoom. El inventario compartido y los productores futuros de contratos son entregas independientes; no se declaran funcionando ni se vuelven condición de cierre de este alcance. No se repitió una prueba autenticada de producción.

## NOT-01 y NOT-08 · Estado de publicación

`79ddcb0` y `2084cb9` son antecesores del árbol revisado; el [estado histórico](../../ESTADO.md) registra respectivamente el Inbox de eventos de NOT-01 y las categorías manuales de NOT-08 en main. El árbol `b544c2e`, cuya publicación y consulta de migraciones sin pendientes se documentan en [REG-05](../REG-05/acceptance.md), contiene `0033_notification_events.sql` y `0035_notification_categories.sql`. Esa evidencia histórica respalda que ambas migraciones estaban aplicadas en esa consulta; no se ha realizado una consulta remota nueva en esta conciliación.

Las fichas NOT-01 y NOT-08 siguen parciales: los productores y canales reales que aún no existen requieren sus propias entregas. Sus pruebas históricas de construcción no se presentan como pruebas nuevas de producción. Meta está fuera de la fase vigente, conforme al [plan maestro](../../2026-11-10-plan-maestro-vigente.md); no bloquea el Inbox manual ni se reactiva aquí.

## Tablero y alcance del resultado

El test DOM del tablero fallaba también en la base `1813b01`: al buscar NOT-01 exigía una única tarjeta, aunque el paso siguiente de NOT-11 contiene ese texto y es otra coincidencia válida. Se ajustó la aserción para comprobar ambas tarjetas y ocultar una ajena, sin modificar la búsqueda. `team:check`, el test DOM y 121 pruebas de catálogo y tablero pasaron. El navegador aislado comprobó la búsqueda, el teclado y el reflujo a 1280, 390 y ancho efectivo de 640 píxeles usando respuestas ficticias; esto no comprueba el tablero público.
