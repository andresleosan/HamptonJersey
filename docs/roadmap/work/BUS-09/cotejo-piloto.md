# Cotejo de las dos noches de BUS-09

El piloto requiere dos días consecutivos de Jersey. En cada uno, Hermes debe encontrar al menos el 95 % de las casas de cada agencia y todas las que entregue deben estar respaldadas por la referencia. El cotejo usa el mismo enlace normalizado que la app para reconocer una casa.

## Preparar las seis comparaciones

Guarda un archivo JSON privado con un array de dos objetos. Cada objeto contiene `date` (día de Jersey, `YYYY-MM-DD`) y `sources`. Dentro de `sources` incluye `src-gaudin-co`, `src-keys-properties` y `src-finders-keepers`. Esta es la forma de la entrada de una agencia, con un enlace ficticio:

```json
{
  "reference": { "complete": true, "urls": ["https://www.gaudin.je/property/example/123"] },
  "hermes": { "complete": true, "urls": ["https://gaudin.je/property/example/123/"] }
}
```

- En `reference.urls` pon los enlaces de la lectura completa independiente con la que se coteja ese día. Para Finders Keepers usa `parseFindersKeepers` sobre todas las páginas del feed de ese día. Para Gaudin y Keys usa la última pasada completa del lector de referencia. Conserva fecha y procedencia de cada referencia para revisar altas y bajas.
- En `hermes.urls` pon los enlaces aceptados en la pasada de Hermes de esa fecha. En D1 corresponden a `raw_json.listing_url` de las observaciones de las páginas de esa pasada. Junta todos los canales del piloto de cada agencia, incluidos venta y alquiler cuando correspondan. La vista de inventario actual también conserva casas de días anteriores.
- Marca `complete: true` solo cuando dispongas de todos los canales previstos y sus páginas completas. Para una noche ausente usa `{"complete":false,"urls":[]}`. Una referencia vacía deja la cobertura sin demostrar.

## Ejecutar desde la raíz

```sh
node scripts/compare-market-pilot.mjs /ruta/privada/piloto.json
```

El informe indica los anuncios cotejados (`matched`), los que faltaron (`missing`) y los pendientes de corroborar (`unexpected`). Los duplicados cuentan una vez. Revisa los enlaces inesperados contra la fuente del día, por ejemplo si un anuncio se publicó después de la referencia anterior. Conserva el informe y las listas fuera del repositorio público.

El proceso sale con código `0` si pasan las seis comparaciones, `1` si alguna queda pendiente y `2` si la entrada es inválida. El comando trabaja sin red y no cambia los lectores ni los interruptores del mercado.

## Recuperar la lectura de un día

La siguiente consulta de solo lectura toma un parámetro `:jersey_day` en formato `YYYY-MM-DD`. En una consola sin parámetros sustituye `:jersey_day` por la fecha entre comillas simples. Ejecútala una vez por fecha de Hermes y, para Gaudin y Keys, sobre las fechas conocidas de sus últimas pasadas completas del lector de código.

```sql
SELECT r.jersey_day, sr.source_ref, sr.channel_id, sr.status,
       (sr.status = 'complete' AND sr.last_full_pass_at IS NOT NULL
        AND MAX(COALESCE(p.exhausted, 0)) = 1) AS complete,
       COUNT(DISTINCT p.id) AS pages,
       json_group_array(DISTINCT json_extract(o.raw_json, '$.listing_url'))
         FILTER (WHERE o.id IS NOT NULL) AS urls
FROM market_runs r
JOIN market_source_runs sr ON sr.run_id = r.id
LEFT JOIN market_pages p ON p.run_id = sr.run_id
  AND p.source_ref = sr.source_ref AND p.channel_id = sr.channel_id
LEFT JOIN market_observations o ON o.page_id = p.id
WHERE r.kind = 'daily' AND r.jersey_day = :jersey_day
  AND sr.source_ref IN ('src-gaudin-co', 'src-keys-properties', 'src-finders-keepers')
GROUP BY r.jersey_day, sr.source_ref, sr.channel_id, sr.status, sr.last_full_pass_at
ORDER BY sr.source_ref, sr.channel_id;
```

Para cada agencia junta los arrays `urls` de sus canales asignados. Usa `complete: true` cuando todos los canales previstos figuren con `complete = 1` y puedas atribuir la lectura al lector correcto. Una fila con cero páginas identifica un canal previsto sin entrega aceptada. La ausencia de una fila prevista o de la pasada entera deja la lectura incompleta. Los subcanales cubiertos por una raíz autorizada se completan vacíos por diseño. Identifica esa relación con las rutas revisadas de la fecha y comprueba la lectura de la raíz.

**Qué conserva D1.** Al confirmar una página, `commitObservationPage` inserta la página y cada observación con su enlace, aunque el anuncio siga igual que ayer. En el mismo lote actualiza el cursor y marca el canal completo solo al aceptar la página final. Tras un fallo la lectura puede continuar en el cursor pendiente. Repetir una entrega ya aceptada conserva la página original. Por eso la consulta reúne todas las páginas de la pasada y usa el estado final del canal. Los hashes sirven para verificar el contenido, y la tabla `market_latest_observations` actualiza el puntero a la lectura más reciente. El historial por página conserva el material del cotejo.

**Cómo acreditar quién leyó.** Hermes y el lector de código graban como `system` y pueden compartir la misma `external_key`. Conserva la asignación desplegada durante la pasada y la constancia fechada de `done` del custodio por canal principal. Si hubo un cambio de lector con la pasada en curso, o solo hay una cuenta global de anuncios, queda pendiente atribuirla. El archivo temporal de la cola del custodio se elimina al terminar. Sus registros indican cantidades y rechazos, y los enlaces aceptados se recuperan de D1. Para anuncios rechazados por el custodio, revisa sus contadores por motivo. La app puede registrar el fallo general del canal sin guardar los enlaces rechazados. Para Finders Keepers conserva el mismo día los enlaces obtenidos con el lector independiente, antes de que cambie el feed. La entrega de Hermes nunca sirve como referencia de sí misma.

La prueba local `node --test --test-name-pattern='pilot SQL' tests/server/bus-09-hermes-door.test.mjs` ejecuta esta consulta en el esquema migrado. La primera noche recibe A, reintenta la misma página, supera un fallo y recibe B. A la siguiente recibe B y C. Al consultar de nuevo las fechas se recuperan A y B para la primera, B y C para la segunda y el canal sin entrega figura incompleto.
