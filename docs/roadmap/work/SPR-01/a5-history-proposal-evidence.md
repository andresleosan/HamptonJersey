# SPR-01 · Propuesta desconectada para historial de fecha

Base local: `cd4413347f835076c73324903cb61636438bbd5f`. Este documento y `available-on-history.proposed.sql` son una propuesta: no están en `migrations/`, no los carga ninguna ruta y no se han aplicado remotamente. SPR-01 sigue parcial.

## Hallazgo y propuesta A5

El diseño A5/D9 pide la fecha real en `after` de creación y en `before`/`after` de cambios y limpieza. El contrato existente usa el nombre `available_on`. En la base de esta propuesta, los triggers derivados de 0042 incluyen ese nombre en `fields` y detectan su cambio, pero no incluyen su valor en las instantáneas. Una prueba con SQLite en memoria confirmó que un PUT válido devuelve 200 y registra el campo sin registrar su valor anterior ni el nuevo. La prueba existente de economía comprueba la inclusión en `fields`, no los dos valores.

El SQL propuesto copia ambos triggers vigentes de 0042 y añade únicamente `NEW.available_on` a la creación y `OLD.available_on`/`NEW.available_on` a los objetos de actualización. Los tests comparan las definiciones de ambos triggers en SQLite y D1 antes y después, retirando únicamente esas tres entradas; las demás expresiones, condiciones y campos quedan iguales. También comprueban que los campos de texto libre continúan sin copiarse al evento. Es una prueba sobre los triggers de esta base, no una comprobación del esquema remoto.

Los eventos y avisos anteriores no se reescriben. La propuesta no recupera las fechas antiguas que no se registraron y no contiene un backfill. Una futura integración exige comparar primero el esquema real con los triggers de referencia, revisar retención y uso de las fechas en el historial, adaptar el SQL si hay cambios posteriores y diseñar una migración nueva y atómica con revisión y autorización. No debe aplicarse copiando ciegamente definiciones históricas sobre triggers distintos.

## A4: estado y filtros

Con una ficha ficticia ya normalizada, guardar solo la fecha conserva disponibilidad, publicación, archivo, `confirmed_at`, `to_confirm`, estado de la lista y resultados de filtros de operación, dormitorios y precio. La ficha sigue apareciendo en la API pública local y su proyección solo cambia en la fecha; el evento de esa ficha enumera únicamente `available_on`. Se comprobó además que el filtro existente de «cambios en los últimos 7 días» puede cambiar de resultado porque un guardado actualiza `updated_at`; no es una confirmación de disponibilidad.

No se puede afirmar ausencia universal de efectos ajenos. Con parroquia desconocida y una ubicación reconocible, el guardado existente deriva la parroquia, cambia la pertenencia al filtro correspondiente y registra `parish` como campo derivado junto a `available_on`. El plan D4 conserva el recálculo habitual y advierte que no garantiza invariancia de todos los efectos de guardar. Esta propuesta no modifica esa conducta ni decide si el texto de A4 debe reconciliarse con D4. La prueba usa una ficha sin solicitantes; no demuestra ausencia de otros efectos del recálculo sobre relaciones reales.

## Pruebas locales

`node --test --test-concurrency=1 tests/server/spr01-history-proposal.test.mjs`: **6/6**. Cubre los dos casos A4 anteriores, creación/cambio/borrado de fecha, conservación de eventos y referencias previas, comparación de triggers, texto libre, guardado sin cambio, 409 y fallo sintético del evento con rollback de fecha, versión y contexto. La prueba de creación falló antes de preparar el SQL por faltar `after.available_on` y pasó con la propuesta.

Las mismas operaciones de creación, cambio, borrado, no-op, conflicto y fallo del evento se repitieron contra D1 efímero de Miniflare con datos y sesión ficticios, junto a la comparación de triggers, historial anterior y `foreign_key_check`. Los errores de evento impresos durante las pruebas de rollback son deliberadamente sintéticos. Ninguna de estas comprobaciones consulta ni acredita producción.

La suite local coordinada, ejecutada con `node --test --test-concurrency=2 tests/*.test.js tests/server/*.test.mjs`, pasó **1699/1699**; `python3 -m unittest tests/test_import.py tests/test_directory_manifest.py` pasó **25/25**. Después se reforzaron las aserciones focales de visibilidad pública e integridad de filas históricas completas y se repitieron las focales **6/6**; el SQL propuesto no cambió entre ambas ejecuciones. No se ejecutó navegador para esta propuesta SQL y no se afirma un smoke autenticado remoto.
