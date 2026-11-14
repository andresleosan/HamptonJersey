# PUB-06 · Costes estructurados y alcance pendiente

13-nov-2026. Base de integración `13d55f5f080aabc51e3007058dcb6026d660521b`, descendiente de `dd63b56` y con la propuesta SPR-01 de historial. PUB-06 continúa **parcial**.

## Alcance real

La aceptación histórica A3 exige editar y mostrar premium junto a renta. A4 también pide un ratio separado de premium. El cambio publicado posterior `041188e` retiró ese campo y seleccionó venta o renta por tenencia. No se ha encontrado una decisión de producto que concilie ambos contratos: esta entrega conserva íntegro `041188e`, no restaura premium y no afirma que existan datos reales afectados. Los ratios de venta y renta construidos anteriormente no acreditan el ratio histórico de premium.

Los textos existentes de depósito, parish rates, service charge y suministros siguen siendo públicos y se conservan sin convertir ni interpretar. Se prepararon cinco campos estructurados separados para uso del personal: importes de depósito, parish rates y service charge, y periodos independientes para estos dos últimos. Son opcionales; `null` es desconocido y `0` es declarado. Se exige moneda GBP/EUR para cualquier importe y mes/año para cada coste recurrente declarado. No hay conversión de moneda ni suma de conceptos. Los valores nuevos no se añaden a la proyección pública; la interfaz explica que el texto público no se actualiza automáticamente.

La capacidad `PUB06_STRUCTURED_ECONOMICS_READY` está apagada por defecto. Con ella apagada o con esquema/auditoría incompletos, las peticiones que intenten escribir estos campos reciben 503; el editor previo mantiene sus guardados y valores existentes. Una copia antigua no borra importes omitidos; si hay importes guardados y la capacidad está apagada, un cambio de moneda se rechaza para evitar reinterpretarlos sin mostrarlos. El gate comprueba el marcador, las columnas y la definición completa de los cuatro triggers en una lectura primaria; la sentencia de escritura vuelve a comparar exactamente esas definiciones. El contrato se genera desde la propuesta revisada y `scripts/generate-pub06-schema-contract.mjs --check` detecta desviaciones. Un cambio inocuo de formato también deshabilita la capacidad hasta reconciliar el contrato: es una decisión conservadora, no autenticación ni autorización. Las rutas mantienen sesión, origen, whitelist y control `updated_at` existentes.

## SQL y auditoría

`structured-economics.proposed.sql` está fuera de `migrations/`; no se ha aplicado a ninguna base remota. Añade columnas sin backfill, guardas de tipo/rango/moneda/periodo y un marcador de compatibilidad. Sus triggers combinan los bloques de fecha de `SPR-01/available-on-history.proposed.sql` con los cinco campos nuevos, sin tocar 0042 ni 0049–0051. El historial contiene valores numéricos y periodos, pero no copia el texto libre. `json_patch` mantiene el objeto de cambios bajo el límite de argumentos SQL. Aplicar después por separado cualquiera de las dos propuestas podría reemplazar el trigger de la otra: antes de una futura migración hay que revisar el esquema y el SQL remotos, reconciliar ambos cambios en una sola migración con ordinal libre, revisar otras pendientes y comprobar recuperación. La presencia del archivo o del gate no autoriza ni acredita esa operación.

## Correcciones tras revisión independiente

La revisión de `e465522b` detectó tres problemas. Primero, un panel antiguo podía cambiar la moneda con costes existentes si el gate estaba encendido. Ahora el servidor exige los cinco campos estructurados, una confirmación explícita y la versión actual; el editor muestra la confirmación y la liga a esa versión, moneda y valores. Los importes se conservan sin conversión. Una petición antigua o incompleta se rechaza, y la confirmación es una declaración del empleado, no una prueba independiente de identidad.

Segundo, `JSON.parse` podía convertir `1e-400` a cero o perder decimales antes de validar. Alta y edición examinan el token numérico original mediante `context.source` y aritmética entera antes de aceptar un importe; si el runtime no proporciona el token, los importes numéricos se rechazan en lugar de inventar un valor. La cola no admite estos campos y los rechaza antes de modificar su fila. El runtime aislado local confirmó que conserva el token, acepta cero y rechaza `±1e-400` y `1.00000000000000001`; esto no acredita el runtime remoto.

Tercero, un trigger podía conservar el comentario SPR-01 mientras omitía la fecha. La comprobación de identidad completa lo rechaza en la lectura y en el `WHERE` de la escritura, incluso si cambia entre ambas. Se añadió además una regresión de rollback cuando falla la inserción del evento, en SQLite y D1 local. El esquema y la bandera continúan sin activarse remotamente.

## Verificación local

- Validación y regresiones puras tras la corrección: **60/60**, incluyendo precio/tenencia de `041188e`, límites, cero y aislamiento. Las rutas sobre SQLite ficticio pasaron **11/11**, incluidas creación, no-op, 400, 409, revisión de moneda, tokens JSON literales, cola, gate apagado, rollback y alteración de un trigger entre comprobación y escritura.
- SQL propuesto en SQLite y D1/Miniflare local: **3/3**. Se conservaron filas, textos, FK, eventos y fechas; se comprobó 401/403, actualización, 409, rollback de evento y que una carrera con trigger alterado no escribe ni el importe ni la dirección. No acredita estado remoto.
- `npm run build` y `npm run check:release` pasaron; Vite conserva el aviso anterior de chunk grande. La suite general queda para la integración final.
- Navegador con `E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/pub06-structured.e2e.cjs npm run test:e2e:isolated`: la ejecución posterior a la revisión pasó a 1280 y 390 px, con guardado, recarga, error, Discard, conflicto, revisión de moneda, tokens JSON literales, teclado, reflujo con zoom **CSS** 200 % y ausencia de los importes privados en la web. No es una prueba de zoom nativo ni de producción. El fixture local emitió avisos TLS de su certificado efímero sin errores de página y con salida 0.
- La primera ejecución del navegador falló porque el fixture de conflicto omitía `/api`; la segunda, porque el segundo tamaño intentaba guardar valores idénticos y el botón estaba correctamente desactivado. Se corrigió el test, sin presentar esas ejecuciones como aprobadas. El SQL y la bandera solo se cargan para esta prueba en el contenedor local aislado; el modo de producción se comprobó rechazado antes de preparar el fixture.

Pendientes: revisión independiente del diff y del guardado, suite completa integrada, reconciliación de A3/A4, decisión y verificación del esquema remoto, migración/publicación si se autorizan, y cualquier recorrido autenticado real que se decida exigir. No se han consultado cuentas, datos reales ni producción, ni se ha hecho push.

## Integración posterior

Sobre `8ceb36b414f22864ca4e7ff35b0aa37b4ce65deb`, la revisión independiente identificó los tres casos corregidos arriba. La integración aprobó **1.852/1.852** pruebas Node y **25/25** Python, además del contrato generado, build, `check:release`, `team:check`, `check:packages` y `git diff --check`. Los recorridos aislados de costes estructurados y de la ficha BUS-10 terminaron con código 0 en Chromium con datos ficticios. El zoom comprobado fue CSS; no se verificaron WebKit, el runtime remoto ni producción. La capacidad permanece apagada, el SQL no está en la cola de migraciones y A3/A4 siguen pendientes.

## Continuidad · 14-nov-2026

La integración posterior prepara la migración canónica `0052_listing_economics_history.sql`, conjunta para PUB-06/SPR-01. La propuesta SQL de esta entrega queda histórica y no se debe aplicar por separado. La comparación DDL, el mapa concreto de retención, la conciliación A4/D4 y las pruebas actuales se registran en [evidencia conjunta](../PUB-06/2026-11-14-combined-schema-history-evidence.md). Esta nota no afirma aplicación ni activación remotas y conserva las comprobaciones anteriores como fotografía histórica.
