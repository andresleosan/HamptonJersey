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
