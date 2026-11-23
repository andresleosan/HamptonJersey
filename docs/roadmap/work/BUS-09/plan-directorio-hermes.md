# Plan: Hermes lee el directorio y lo mantiene al día

23-nov-2026 · Tareas: BUS-09 (lectores), BUS-08 (pasada diaria), BUS-04 (cruce con búsquedas). Estado: **propuesta, pendiente de las decisiones de Luis** (sección 6). Nada de esto está construido.

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
3. **El lector abre la página.** Descarga solo esa dirección, dentro del dominio y la ruta revisados.
4. **La IA extrae los datos.** De cada anuncio saca solo hechos: operación (venta o alquiler), precio, parroquia, dormitorios, baños, aparcamiento y enlace. Sin descripciones ni fotos, igual que los lectores actuales.
5. **Comprobación contra invenciones.** Un programa fijo, sin IA, descarta cualquier anuncio cuyo enlace o cuyo texto de precio no aparezca literalmente en la página descargada, o cuyo enlace salga del dominio revisado.
6. **Hermes devuelve la página.** Llama a `POST /api/hermes/market/:id/result` con hasta 10 anuncios y si quedan más páginas. La app la guarda por el mismo camino que usan Gaudin y Keys.
7. **La pasada compara y cruza.** Al acabar el día: casas nuevas y bajadas de precio → se recalculan las búsquedas y sale el aviso «New market homes for …» en el Inbox. Casas que ya no aparecen → quedan como no encontradas y sale una tarea en el Inbox.

Reglas que protegen los datos:
- Solo una lectura **completa** del canal puede dar una casa por no encontrada. Si Hermes se queda a medias, falla o la página viene cortada, las casas se conservan y la fuente aparece como «no leída».
- Tres fallos seguidos en un día dejan el canal bloqueado hasta el día siguiente (regla actual).
- Como mínimo 60 segundos entre dos lecturas del mismo canal (regla actual).

## 4. Fases

| Fase | Qué se hace | Quién | Se da por hecha cuando |
| --- | --- | --- | --- |
| 0. Preparación | Publicar el arreglo de Finders Keepers. Clasificar las 72 fuentes: ¿es de viviendas?, ¿la dirección permitida es una lista de anuncios?, ¿se lee sin JavaScript? Comparar el directorio local (138 fuentes) con el de producción (119). | Desarrollo; el push, Luis | Hay una tabla con cada fuente y su destino: lector de Hermes, lector de código, o fuera. |
| 1. Puerta en la app | Las dos rutas de la puerta, su llave propia (`HERMES_MARKET_KEY`), el interruptor `HERMES_MARKET_READY` apagado, y el cambio en la pasada para que espere a Hermes. Sin migración si se reutilizan los resultados de lectura que ya existen. | Desarrollo | Pruebas con un Hermes simulado: página buena, página inventada, reserva caducada, lectura a medias, interruptor apagado. |
| 2. Lector en el VPS | El programa que pide canal, descarga, pasa el texto a la IA, comprueba y devuelve. | Desarrollo lo prepara; Luis lo instala | Lee de punta a punta 3 fuentes reales con el interruptor encendido solo para la prueba. |
| 3. Primera carga | Encender por tandas de unas 10 fuentes al día, revisando cada tanda. | Luis enciende; desarrollo revisa | Cada fuente clasificada en la fase 0 tiene una lectura completa o un motivo anotado. |
| 4. Diario | La pasada de cada día incluye las fuentes de Hermes. El resumen de las 08:00 dice cuántas fuentes no se pudieron leer. | Automático | Siete días seguidos con comparación hecha y sin fuentes bloqueadas sin explicar. |

Las fuentes grandes o que fallen con la IA pasan a tener un lector de código, como Gaudin: es más barato y no se equivoca.

## 5. Lo que es de Luis

- Publicar los commits (hoy GitHub rechaza el push desde el VPS).
- Añadir los dominios de las fuentes a la lista de salida del proxy del lector.
- Crear y guardar la llave `HERMES_MARKET_KEY`.
- Encender `HERMES_MARKET_READY`.
- Si el directorio local es más nuevo que el de producción, aceptarlo en Settings › Automations › Market inventory y revisar los canales nuevos.

## 6. Decisiones que necesito

| # | Decisión | Recomendación |
| --- | --- | --- |
| 1 | **Quién abre las webs.** (a) Un lector enjaulado y sin herramientas, como el que ya lee las carpetas (`hampton-lector`). (b) El agente Hermes directamente. | **(a).** Una web ajena es texto que no controlamos, y el agente Hermes tiene terminal, la llave de GitHub y la de la base de datos. Es la misma elección que hiciste para los documentos el 6-nov. |
| 2 | **Qué pasa con una casa que ya no aparece.** (a) Queda como no encontrada y una persona la confirma, como hoy. (b) Tras dos lecturas completas seguidas sin aparecer, se retira sola de las propuestas. | **(b)**, sin borrar nada: con 70 fuentes, confirmar a mano cada casa no es viable. |
| 3 | **Qué fuentes entran.** (a) Solo agencias de viviendas, primero las de más anuncios. (b) También oficinas y coworking. | **(a).** El matching de mercado no cruza búsquedas comerciales, así que hoy esas casas no servirían. |
| 4 | **Las 44 fuentes que no están permitidas** (23 solo manuales, 21 sin revisar). | Quedan fuera, como decidiste el 20-nov (BUS-24). Entran cuando las revises. |

## 7. Riesgos

- **Límite del plan de ChatGPT.** Unas 70 fuentes con varias páginas cada día consumen uso del plan de Hermes. Se medirá en la fase 3; si no alcanza, las fuentes mayores pasan a lector de código.
- **Webs que cambian o bloquean.** Una fuente que falle queda «no leída» y sus casas se conservan; no se pierde nada.
- **Webs que cargan los anuncios con JavaScript.** El lector no las verá. La fase 0 las detecta y van a lector de código (si tienen un feed) o quedan fuera.
- **Categoría de vivienda (Qualified, Registered…).** Los listados no suelen darla; esas casas saldrán como «Requirements to confirm», como hoy.
