# PUB-11 · Guardado atómico del PUT de medios

Base: main `5c97061b15d560613d3913ada13b4fda2fc11288`. PUB-11 sigue parcial. No hay migración nueva, activación ni comprobación de datos reales.

## Comportamiento

El PUT existente de portada/orden/visibilidad/tipo/etiqueta utiliza un solo listingBatch. El CAS de updated_at, el evento aplicable de portada y los cambios de medios confirman juntos o revierten juntos. Tras el CAS y cada UPDATE de medio, cero filas aborta la transacción mediante la guarda de listing_event_context ya utilizada en updateListingEvent. No queda el segundo batch que permitía una portada confirmada y metadatos parcialmente guardados.

Antes de escribir cada medio, su predicado compara el snapshot servidor de pertenencia, origen, identidad de recurso y campos sobrescritos, con igualdad null-safe. La portada también se comprueba dentro de la transacción aunque no venga en items. Un cambio posterior al preflight produce conflicto sin sobrescribir el cambio concurrente. Los IDs duplicados se rechazan antes de escribir. Se conserva la prohibición de hacer públicos medios externos o elegirlos como portada.

Solo el error conocido de la guarda se convierte en 409; si la ficha desapareció, conserva el 404. Otros fallos siguen como error de servidor con rollback. No se habilitan permisos nuevos ni se modifica la política de mínimos o publicación.

## Verificación

- RED previo: 30 pruebas contando subtests, 8 aciertos y 22 fallos. Reproducción en SQLite y D1 local de guardado parcial, writes ignorados y deriva de pertenencia/portada.
- Focal final: 68/68, incluidos los 23 casos SQLite, seis subpruebas D1 efímero y las regresiones de administración e historial. El historial deja de exigir el guardado parcial y comprueba rollback, éxito posterior y retirada de portada.
- Revisión independiente: sin hallazgos Critical/Important/Minor. Comprueba encadenamiento CAS/guard, predicados null-safe, portada omitida y manejo de errores.
- Navegador Chromium aislado: PASS 1280/390/zoom y teclado, con subida/decodificación y dos PUT HTTP simultáneos: 200/409, contenido completo del ganador y reintento obsoleto 409 sin cambios. Capturas `/tmp/hampton-browser-captures/run-SubGxI`. Suite final: 2305 pruebas JavaScript y 29 Python PASS; build, release estricto, catálogo y paquetes PASS. La publicación y el tablero se verifican tras el commit.

## Límites y decisiones

- Ruling: cerrar exclusivamente la atomicidad de este PUT, sin añadir media_revision ni otra migración. Upload y remove no versionan uniformemente el conjunto; el snapshot del servidor detecta cambios posteriores a su lectura, no un navegador antiguo ante esos escritores. Coste residual: ese caso requiere la versión común futura.
- Ruling: conservar el trigger de eventos actual. Una portada modificada deja su evento en la misma transacción; cambiar solo orden/visibilidad con la misma portada no añade un evento completo de medios. No se declara auditoría completa.
- Ruling: conservar el contrato actual de auth y respuesta. No se aporta revocación durable ni idempotencia HTTP; las lecturas posteriores al commit pueden observar un cambio posterior y el editor mantiene su guardado separado de campos y fotos. Ninguno de esos límites se presenta como resuelto.
- P01 está resuelta: PUB-12 y PUB-02 constan hechos con mínimos y guardas ya integrados. Este cambio conserva esa política; no reabre la decisión ni acredita por sí solo la versión común futura de todos los escritores o pruebas nuevas de sus carreras de publicación. Las pruebas sintéticas no acreditan producción ni cierran PUB-11.

Siguiente paso: definir e integrar una versión común de medios con todos sus escritores y consumidores de publicación; después continuar PDF privado/staging con las autorizaciones y dependencias del plan.
