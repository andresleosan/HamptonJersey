# ANA-01 · evidencia de construcción agregada

Base de trabajo: `587f744901693801bf1ed0f2cc05bafdda09f8cf`, copia aislada. El maestro sustituyó la antigua ficha de actividad por persona por estadísticas generales; esta entrega no implementa seguimiento individual. Esta evidencia describe construcción y pruebas locales, no integración, publicación ni activación. La conciliación de la ficha corresponde al coordinador.

## Alcance y revisión local de privacidad

- `daily_stats` sigue siendo el único almacenamiento web utilizado. La consulta devuelve solo sumas por tipo, una fila agregada y fechas, sin identificadores de fichas ni unión a contactos. La información histórica por ficha y día ya existente permanece en `daily_stats`.
- No se añadieron cookies, sesiones, identificadores de visitante, IP, URL, referrer, beacon, eventos nuevos, tablas, correlación con negocio ni contadores nuevos de tours. El emisor web existente sigue enviando únicamente ficha y métrica con credenciales omitidas. La aplicación no guarda el cuerpo de solicitud ni la IP en esta modificación; esto no certifica los registros de red de la plataforma.
- `/stats` acepta exclusivamente `listing_id` y `metric`, con límite de 1.024 bytes en el cuerpo y las protecciones de origen existentes. Un 204 sigue sin garantizar registro: la ficha puede no ser elegible o haberse alcanzado el tope diario de 20.000. No se presenta ese tope como defensa contra bots.
- La primera fecha observada es la primera fila con acciones positivas **dentro del periodo**, no una fecha de inicio o prueba de continuidad. Cero es una suma almacenada y no equivale a cero personas. La cobertura de las dos fuentes existentes es `unknown`, estado válido que no se convierte en completa. El marcador de filtros es `null`/`not_configured` porque no está integrado en este informe; Web Analytics tampoco está integrado aquí. Un fallo de consulta devuelve error.
- La tabla del panel muestra fuente, unidad, cobertura y periodo; las acciones no se vinculan a personas ni a Timeline. La tabla histórica de Insights conserva sus datos anteriores, sin añadir nuevos indicadores de tours.

## Coste sintético y atomicidad local

`tests/server/measurement-d1.test.mjs` usa un binding D1 local con una tabla sintética de la misma clave primaria por día/ficha/métrica: 180 días × 250 fichas × 3 métricas = 135.000 filas. Para 90 días la consulta lee 67.500 filas, escribe 0 y devuelve una fila agregada; `EXPLAIN QUERY PLAN` confirma búsqueda por rango de la clave primaria. Una muestra local de la suite completa tardó 44,9 ms. La versión previa con agrupación leía 112.500 filas en la misma muestra; es una observación local, no una tarifa ni una medición remota.

El mismo binding local mantuvo el tope de 20.000 ante 25 solicitudes concurrentes partiendo de 19.990, todas con respuesta 204. El fixture usa un esquema reducido: no certifica todas las migraciones, las condiciones operativas ni la concurrencia de D1 remoto. El coste real depende de filas, periodos y frecuencia de uso; no se consultaron consumo, cuotas, tarifas o latencia de la cuenta real.

## Verificación local

- `npm test`: 1.493 pruebas Node y 25 Python, sin fallos.
- `npm run build`: correcto; Vite advierte de un chunk superior a 500 kB.
- `npm run check:release`: correcto, sin marcadores `TO CONFIRM` en `site/`.
- `E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/ana01-activity.e2e.cjs npm run test:e2e:isolated`: Chromium en contenedor temporal sin red con datos ficticios. Comprueba 1.280 y 390 px, periodos, estados de error/reintento, foco y desplazamiento con teclado, consola y zoom 200 %. Google Fonts produjo `ERR_INTERNET_DISCONNECTED` por la red desactivada: el test sustituye solo esa hoja por CSS vacío, por lo que no verifica la tipografía remota real. No es una prueba de producción.

La revisión independiente de privacidad y coste se completó sobre el cambio inicial. Luis autorizó los commits y push; el estado publicado y la operación real se verifican por separado. La cobertura `unknown` es una limitación expresada por el contrato, no una condición que obligue a inventar datos de salud. No se configuró ningún servicio externo ni se acreditó el coste o la cobertura real de D1 remoto.

## Conciliación y coste de lectura

La ficha ANA-01 se renombra para reflejar la decisión posterior del maestro: sustituye el antiguo seguimiento por persona por estadísticas generales, sin afirmar que aquel seguimiento exista. Durante la integración, la UI dejó de llamar automáticamente al endpoint separado y utiliza la misma agregación que ya calculaba las vistas de Insights. En la muestra sintética D1 de 135.000 filas, la agregación combinada y la consulta anterior leyeron cada una 67.500 filas para el mismo periodo de 90 días. El endpoint separado permanece disponible para solicitudes directas autorizadas; su uso puede añadir lecturas. No se conoce el plan, consumo, volumen, latencia ni coste reales de la cuenta, y no se han consultado datos remotos.

En la copia integrada sobre `b1c474259852095a01d19b8079618becf2d47da7`, `npm test` aprobó 1.508 pruebas JavaScript y 25 Python; `build`, `check:release`, `team:check` y `check:packages` aprobaron. El E2E de ANA-01 confirmó 1280/390, teclado, zoom y que la UI no llama automáticamente al endpoint separado; también pasaron los E2E aislados de PUB-17 encendido y apagado. Son pruebas locales con fixtures, no smoke autenticado de producción.

## Publicación y cierre del alcance revisado

El commit `d03f0d36511f361f3f3e0a951c97943b0ffeea3d` está en main; los checks de Cloudflare Pages y Workers Builds `hampton-jobs` terminaron correctamente. Se cierra ANA-01 para el alcance agregado decidido posteriormente por Luis, no para la antigua propuesta de seguimiento por persona. Las pruebas funcionales fueron locales; no se ha comprobado la pantalla autenticada ni el consumo/latencia reales de D1 en producción. El contador separado puede añadir lecturas cuando un cliente staff lo invoca directamente.
