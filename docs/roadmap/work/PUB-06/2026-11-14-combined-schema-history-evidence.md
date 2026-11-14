# PUB-06 / SPR-01 · Integración del esquema y del historial

14-nov-2026. Base de implementación `981cc20`; copia aislada propia. Estado: preparado localmente para integración y verificaciones finales del padre. No se marcan hechas las fichas ni se acredita aplicación, publicación o activación desde esta evidencia.

## Migración canónica y contrato

`migrations/0052_listing_economics_history.sql` añade los cinco campos estructurados opcionales a `listings`, sus dos guardas de consistencia y un marcador de compatibilidad. Sustituye los triggers de alta/actualización de 0042 para combinar esos importes/periodos con snapshots validados de `available_on`. Conserva la fecha y los textos públicos existentes; no crea otra columna de fecha, no interpreta textos anteriores y no hace backfill de importes o eventos.

Las definiciones completas de los cuatro triggers coinciden con el contrato revisado ya existente; el generador ahora las extrae de 0052. Una definición modificada, aunque conserve comentarios, cierra tanto la lectura de capacidad como el WHERE de escritura. El marcador no es autorización. `PUB06_STRUCTURED_ECONOMICS_READY` sigue apagado si no se configura expresamente; este commit no lo configura.

Las propuestas anteriores quedan como referencias históricas sin SQL ejecutable. Tests y generador consumen 0052; el recorrido SPR-01 History exige la cadena canónica y no reemplaza otra vez los triggers. El padre debe retirar la instalación auxiliar PUB-06 de `tests/run-e2e.cjs` al integrar, porque ese archivo pertenece al trabajo concurrente. No se editó desde esta copia.

La base mínima probada es la cadena hasta 0042 más 0048, sin 0043–0047 ni 0049–0051. No es necesario ejecutar esas pendientes para aplicar 0052. También se comprueba la cadena local anterior completa hasta 0051. La publicación del archivo no autoriza `migrations apply` sobre toda una cola; el dueño debe seleccionar, revisar y acreditar la operación real.

## Contraste del DDL

El padre proporcionó una captura exclusivamente DDL obtenida mediante su acceso autorizado de solo lectura. Se comparó con una reconstrucción local hasta 0042: los ocho objetos proporcionados coinciden exactamente. No se publican el archivo privado, filas o contenido de fichas; aquí solo se registra resultado y huella SHA-256 de cada definición coincidente.

| Objeto | Coincidencia exacta | SHA-256 |
| --- | --- | --- |
| `history_viewing_event_insert` | Sí | `c97f3304996217b90a47d9f3e0e115b9e63d46ea8e81f853764397fc66e56dfb` |
| `listing_event_context` | Sí | `aee36b769e288215bf393729f2d8de0a4e56b9f039114dc1b1dfa37e319a9364` |
| `listing_event_delete` | Sí | `fbb59d21470ee10804cd07a69041abfe2ae9e815422a18e810bf49d4bce3a161` |
| `listing_event_insert` | Sí | `416a5bb144a7ce86b22c44704a61f62c081dcb3cb9496ef55589ba8044539425` |
| `listing_event_update` | Sí | `b21f4afcc69dbf9f31a93fa09be17ab07ede5ef44af7cd2070e90619f102a031` |
| `listings_match_inputs` | Sí | `8b50a8fb2540ecb91b70f7dfb4bd1c2d7daff8987c993e6d188430510458664f` |
| `notification_event_feed` | Sí | `2a75e06a578246a3fd21859e6abe5698a8c3127fe5d0714bac4488cdd69d05c7` |
| `notification_listing_deleted` | Sí | `0f16a88f359996f4091c672c12a0a8f87f1e1b172580d23d3b2317b37553b518` |

0042 sigue siendo el dueño de los dos triggers de auditoría antes de esta migración; las pendientes 0043–0051 no los reemplazan. Si el DDL cambia después de esta captura, hay que comparar de nuevo antes de aplicar. Esta comprobación de entrada no acredita una migración ejecutada.

## Revisión concreta de retención

Los nuevos valores son condiciones de la ficha: depósito ofertado, parish rates, service charge y sus periodos. No son pagos, cuentas, contratos de personas, identidades nuevas ni texto libre. La fecha civil ya existe en `listings`; A5 exige registrar sus valores anterior y nuevo con minimización. Los valores pueden vincularse a una propiedad identificable: no se califican universalmente como anónimos.

Se mantiene la misma finalidad y ciclo de la ficha y de los eventos actuales:

| Dato / acción | Tratamiento vigente conservado |
| --- | --- |
| Cinco columnas nuevas | Nullable, sin backfill; edición parcial conserva omitidos; borrar el valor actual guarda null sin borrar el evento anterior. Al borrar la fila `listings` desaparecen sus columnas. |
| `available_on` | Columna única de 0042; fecha válida/null. Snapshots rechazan texto arbitrario, fechas imposibles y sufijos ocultos con marcador desconocido, sin copiar el contenido. |
| Auditoría de la propiedad | Valores estructurados revisados, actor/contexto existentes, acceso staff e historial por la misma ficha. Los eventos antiguos no se reconstruyen ni se reescriben. |
| Limpieza PRE-12 de contactos/visitas | Mantiene sus sujetos, anclas y excepciones; no añade una limpieza de `listings` o de sus eventos. La regresión existente y la nueva integración lo comprueban. |
| EST-19 / seis meses | Solo fotos y derivados acordados; no cubre columnas, documentos, personas ni historial. No se añade ningún consumidor de purga en este tramo. |
| Borrado manual de propiedad | Requiere archivo y confirmación; una venta impide ese borrado por las reglas actuales. Elimina fila y medios propios según el flujo existente, mantiene tombstone y eventos. El historial sigue accesible como propiedad borrada. |

La regla del maestro y EST-19 preserva historial/referencias; no establece una conservación personal perpetua. PRE-12 conserva la tramitación humana y las políticas sectoriales por sus propios sujetos. Esta integración no declara PRE-12 completa ni fija un TTL nuevo para propiedades, ni traslada los doce meses de contactos a ellas. No hay una política nueva material necesaria para estas columnas y snapshots: la revisión pendiente queda resuelta mediante este mapa y sus regresiones, sin usar una pregunta genérica como bloqueo. Un uso futuro para pagos, datos de arrendatarios, cuerpos privados u otra finalidad requeriría su propio contrato.

## A4 / D4 y aceptación

A4 se precisa manteniendo sus invariantes: confirmed_at, estado y visibilidad no cambian por la fecha; los filtros conservan sus reglas y evalúan los valores vigentes. D4 exige conservar el control updated_at y el recálculo normal. El filtro de cambios recientes puede reflejar el guardado; una parroquia desconocida puede derivarse de la ubicación existente y cambiar ese filtro, con atribución derivada en el evento. Ambas conductas se prueban expresamente, junto al caso normalizado en que solo cambia la fecha/versión. No se suprime el recálculo, ni se convierte la fecha en confirmación.

A5 se integra en el esquema real de migraciones: alta/cambio/borrado de fecha, null distinto de ausente/desconocido, fila poblada y eventos/notificaciones anteriores preservados, FK e integridad, no-op/409 sin evento y fallo de evento con rollback completo. Los importes se auditan sin copiar textos públicos libres. La conciliación premium/renta y ratios A3/A4 de PUB-06 conserva la decisión expresa de Luis del 13-nov; no se vuelve a reinterpretar.

## Pruebas locales de esta unidad

- RED observado: las dos pruebas nuevas de migración canónica fallaron `false !== true` al consultar capacidad tras la cadena anterior, antes de crear 0052. No se fabricó RED de los módulos ya construidos. Log privado local: `/tmp/pub06-spr01-migration-red.log`.
- Primer GREEN de ciclo nuevo: 2/2, SQLite poblado y D1 efímero con <=0042 +0048. Incluye escritura solo de fecha, costes, clear/no-op/409/rollback, retención sin nueva purga y archivo/borrado/historial conservado. Los dos ajustes intermedios fueron fixtures: la edición de precio previa ya había actualizado confirmed_at y el adaptador D1 requiere enviar explícitamente la versión de archivo.
- Regresión focal integrada: 110/110 con `node --test --test-concurrency=1 tests/server/pub06-spr01-migration.test.mjs tests/server/pub-06-schema.test.mjs tests/server/pub-06-routes.test.mjs tests/server/spr01-history-proposal.test.mjs tests/server/pub-06-structured-values.test.mjs tests/server/listing-economics.test.mjs tests/server/listing-events.test.mjs tests/server/listing-history.test.mjs tests/server/retention.test.mjs`. Los errores sintéticos impresos proceden de pruebas deliberadas de rollback.
- `node scripts/generate-pub06-schema-contract.mjs --check` y sintaxis del E2E History aprobados. No se ejecutaron navegador, suite global o checks de publicación desde esta unidad; los coordina el padre sobre el resultado integrado.

## Despliegue y recuperación pendientes del padre

Aplicar solo 0052 después del contraste DDL y verificación integral, sin activar las otras migraciones pendientes. Comprobar columnas, marcador y las cuatro identidades completas antes de configurar la capacidad. La aplicación y activación real no se infieren de las pruebas locales.

Ante un problema de puesta en marcha, apagar el gate conserva el flujo anterior y las columnas/valores ya guardados. La base `981cc20` ya protege cambios de moneda con costes existentes cuando el gate está apagado y mantiene columnas omitidas; un rollback de código debe conservar esas protecciones. No proponer DROP de columnas, restauración o borrado de eventos como rollback automático. Recuperación de datos/DDL y cualquier uso de copias son operaciones separadas del dueño, con autorización y evidencia; no se ejecutaron aquí.

Pendientes de cierre: revisión independiente del commit, suite/build/release integrados, navegador aislado de lista/Price/History, operación D1 y activación verificadas por el padre, y conciliación final de ledgers/fichas/tablero según resultados reales. No se acredita smoke autenticado remoto con fixtures ni se inventan valores de registros históricos.
