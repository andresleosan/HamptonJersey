# Plan: Hermes lee el directorio y lo mantiene al día

23-nov-2026 · Tareas: BUS-09 (lectores), BUS-08 (pasada diaria), BUS-04 (cruce con búsquedas). Estado: **decisiones tomadas por Luis el 23-nov (sección 6); fase 0 en curso.** La puerta y el lector aún no están construidos.

## 1. Qué se consigue

Todas las casas que anuncian las webs del directorio entran en el inventario de mercado de la app, y cada día Hermes las vuelve a leer. Las casas nuevas se cruzan con las búsquedas de los aplicantes y las que dejan de aparecer se señalan como no encontradas.

## 2. De dónde se parte (comprobado el 23-nov)

- `Assets/property-directory/property-directory.sqlite3` **no contiene casas**: tiene 138 fuentes y 270 direcciones, con 0 propiedades. «Todas las propiedades del directorio» significa, por tanto, los anuncios publicados hoy en las webs de esas fuentes.
- Producción tiene cargado un directorio con 119 fuentes (199 canales). 75 fuentes están revisadas como **permitidas para lectura automática**, 23 son solo manuales y 21 siguen sin revisar.
- De las 75 permitidas, solo 3 tienen lector: Gaudin (544 lecturas), Keys (48) y Finders Keepers (0, por un fallo ya corregido en el commit `ca6c6478`, aún sin publicar).
- La pasada diaria ya funciona: abre a la 01:00 de Jersey, compara con el día anterior, guarda novedades, bajadas de precio y anuncios no encontrados, y recalcula las búsquedas afectadas. El alta de un aplicante ya cruza su búsqueda con el inventario en el momento.
- Lo único que falta es **quién lee las otras 72 fuentes**. Ese es el trabajo de este plan.

## 3. Cómo funcionará

Hermes no será un segundo sistema: será **un lector más de la pasada diaria que ya existe**. Así todo lo que la pasada ya hace (comparar, avisar, recalcular el matching) sirve sin cambios.

1. **La app reparte el trabajo.** La pasada diaria deja en espera los canales asignados a Hermes, en vez de marcarlos «sin lector».
2. **Hermes pide un canal.** Llama a `GET /api/hermes/market/next`. La app comprueba el interruptor y le reserva un canal: le da la dirección permitida, la página por la que va y un token de reserva.
3. **Hermes abre la web.** El agente Hermes, con una tarea programada diaria y una skill propia, abre solo esa dirección y las páginas de anuncios que cuelgan de ella, dentro del dominio y la ruta revisados.
4. **Hermes extrae los datos.** De cada anuncio saca solo hechos: operación (venta o alquiler), uso (vivienda o comercial), precio, parroquia, dormitorios, baños, aparcamiento, superficie si es comercial, y enlace. Sin descripciones ni fotos.
5. **La app comprueba lo que recibe.** Rechaza cualquier anuncio cuyo enlace salga del dominio y la ruta revisados, y comprueba por muestreo que los enlaces existen. Hermes no puede escribir en nada más: su llave solo abre estas dos rutas.
6. **Hermes devuelve la página.** Llama a `POST /api/hermes/market/:id/result` con hasta 10 anuncios y si quedan más páginas. La app la guarda por el mismo camino que usan Gaudin y Keys.
7. **La pasada compara y cruza.** Al acabar el día: casas nuevas y bajadas de precio → se recalculan las búsquedas y sale el aviso «New market homes for …» en el Inbox. Casas que ya no aparecen → quedan como no encontradas y sale una tarea en el Inbox.

Reglas que protegen los datos:
- Solo una lectura **completa** del canal puede dar una casa por no encontrada. Si Hermes se queda a medias, falla o la página viene cortada, las casas se conservan y la fuente aparece como «no leída».
- Tres fallos seguidos en un día dejan el canal bloqueado hasta el día siguiente (regla actual).
- Como mínimo 60 segundos entre dos lecturas del mismo canal (regla actual).

## 4. Fases

| Fase | Qué se hace | Quién | Se da por hecha cuando |
| --- | --- | --- | --- |
| 0. Preparación | Publicar el arreglo de Finders Keepers. Clasificar las 72 fuentes ([primera pasada](clasificacion-fuentes.md)). Comparar el directorio local (138 fuentes) con el de producción (119). | Desarrollo; el push, Luis | Hay una tabla con cada fuente y su destino: lector de Hermes, lector de código, o fuera. |
| 1b. Comercial | Guardar uso y superficie de los anuncios de mercado y cruzar las búsquedas comerciales con ellos. | Desarrollo | Una búsqueda comercial de prueba recibe una oficina del mercado y una de vivienda no. |
| 1. Puerta en la app | Las dos rutas de la puerta, su llave propia (`HERMES_MARKET_KEY`), el interruptor `HERMES_MARKET_READY` apagado, y el cambio en la pasada para que espere a Hermes. Sin migración si se reutilizan los resultados de lectura que ya existen. | Desarrollo | Pruebas con un Hermes simulado: página buena, página inventada, reserva caducada, lectura a medias, interruptor apagado. |
| 2. Hermes | La skill de Hermes (pedir canal, abrir, extraer, devolver) y su tarea programada diaria. | Desarrollo lo prepara; Luis lo instala | Lee de punta a punta 3 fuentes reales con el interruptor encendido solo para la prueba. |
| 3. Primera carga | Encender por tandas de unas 10 fuentes al día, revisando cada tanda. | Luis enciende; desarrollo revisa | Cada fuente clasificada en la fase 0 tiene una lectura completa o un motivo anotado. |
| 4. Diario | La pasada de cada día incluye las fuentes de Hermes. El resumen de las 08:00 dice cuántas fuentes no se pudieron leer. | Automático | Siete días seguidos con comparación hecha y sin fuentes bloqueadas sin explicar. |

Las fuentes grandes o que fallen con la IA pasan a tener un lector de código, como Gaudin: es más barato y no se equivoca.

## 5. Lo que es de Luis

- Publicar los commits (hoy GitHub rechaza el push desde el VPS).
- Añadir los dominios de las fuentes a la lista de salida del proxy de Hermes e instalar su skill y su tarea diaria.
- Crear y guardar la llave `HERMES_MARKET_KEY`.
- Encender `HERMES_MARKET_READY`.
- Si el directorio local es más nuevo que el de producción, aceptarlo en Settings › Automations › Market inventory y revisar los canales nuevos.

## 6. Decisiones de Luis (23-nov-2026)

| # | Decisión | Qué implica |
| --- | --- | --- |
| 1 | **Las webs las abre el agente Hermes directamente** (no un lector enjaulado). | Se construye como skill y tarea programada de Hermes. Riesgo aceptado: una web podría intentar darle instrucciones a un agente que tiene terminal. Se limita con una llave que solo abre las dos rutas del mercado, la lista de dominios del proxy y la comprobación de la app. |
| 2 | **Una casa que deja de aparecer se retira sola** tras dos lecturas completas seguidas sin aparecer. | No se borra nada: deja de proponerse y vuelve sola si reaparece. Cambio en la comparación diaria (BUS-08). |
| 3 | **El directorio incluye propiedades comerciales**; a quien busca comercial se le sugiere comercial. | Trabajo añadido (fase 1b): hoy el cruce con el mercado se salta las búsquedas comerciales. Hay que guardar el uso y la superficie de cada anuncio y cruzar las búsquedas comerciales con el inventario de mercado. |
| 4 | **Las 44 fuentes no permitidas quedan fuera por ahora.** | Sin cambios (BUS-24). |

## 7. Riesgos

- **Límite del plan de ChatGPT.** Unas 70 fuentes con varias páginas cada día consumen uso del plan de Hermes. Se medirá en la fase 3; si no alcanza, las fuentes mayores pasan a lector de código.
- **Webs que cambian o bloquean.** Una fuente que falle queda «no leída» y sus casas se conservan; no se pierde nada.
- **Webs que cargan los anuncios con JavaScript.** El lector no las verá. La fase 0 las detecta y van a lector de código (si tienen un feed) o quedan fuera.
- **Categoría de vivienda (Qualified, Registered…).** Los listados no suelen darla; esas casas saldrán como «Requirements to confirm», como hoy.
