# Plan: Hermes busca las casas del mercado y mantiene el inventario al día

23-nov-2026 · Tareas: BUS-09 (lectura), BUS-08 (pasada diaria), BUS-04 (cruce con búsquedas), BUS-12 (matching comercial). Estado: **fases 0-3 construidas el 23-nov; piezas del VPS instaladas esa noche para Hermes 2 (`@Carl_Bro_001_bot`); piloto de 3 agencias encendido; la primera lectura es la noche del 24-nov.**

## 1. Qué se consigue

**Hermes es el único que busca casas y actualiza el inventario.** Cada día recorre las webs permitidas del directorio. Las casas nuevas y las bajadas de precio entran en la app y se cruzan con las búsquedas. Las que dejan de aparecer se retiran solas de las propuestas. La app no lee ninguna web por su cuenta: solo reparte el trabajo, comprueba lo que Hermes entrega, lo guarda y hace el matching.

## 2. Decisiones de Luis

| Fecha | Decisión | Qué implica |
| --- | --- | --- |
| 20-nov | Solo los canales que se pueden leer; el resto, al final (BUS-24). | Entran las 75 fuentes revisadas como permitidas para lectura automática. |
| 23-nov | Las webs las abre **el agente Hermes** que ya trabaja con la app (contenedor `hermes`), no un lector enjaulado. | Riesgo aceptado: una web puede intentar darle instrucciones a un agente con terminal. Se limita con la sección 6. |
| 23-nov | Una casa que deja de aparecer **se retira sola**. | Tras dos lecturas completas seguidas sin aparecer. No se borra: deja de proponerse y vuelve si reaparece. |
| 23-nov | **El inventario incluye comerciales**: a quien busca comercial se le sugiere comercial. | Hay que guardar uso y superficie, y cruzar las búsquedas comerciales con el mercado (fase 2). |
| 23-nov | Las 44 fuentes no permitidas (23 solo manuales, 21 sin revisar) **quedan fuera por ahora**. | Sin cambios. |
| 23-nov | **Solo Hermes busca.** | Los lectores de código de Gaudin, Keys y Finders Keepers se retiran cuando Hermes los sustituya y lo demuestre (fase 4). |

Decisiones tomadas en este plan por ser la opción más simple y reversible (Luis puede cambiarlas):
- Hora: Hermes empieza cada día a las **02:00 de Jersey**, una hora después de que la app abra la pasada del día.
- La llave de la puerta del mercado la guarda **un custodio fuera de Hermes**, como la llave actual de la puerta (AUT-13, decisión H4).
- Las casas y los locales se leen con las mismas reglas; la app decide después con qué búsquedas se cruzan.

## 3. De dónde se parte (comprobado el 23-nov en producción, solo lectura)

- `Assets/property-directory/property-directory.sqlite3` tiene 138 fuentes y **0 casas**: es la lista de webs, no un inventario. Producción tiene cargado un directorio de 119 fuentes y 199 canales.
- Ya funcionan y **no cambian**: la pasada diaria (abre a la 01:00 de Jersey, compara con el día anterior), el registro de novedades y bajadas de precio, el aviso «New market homes for …» en el Inbox, el recálculo de las búsquedas afectadas y el matching en el momento del alta de un aplicante.
- Leen hoy 3 lectores de código: Gaudin, Keys y Finders Keepers. Los otros 72 canales con permiso quedan cada día como «sin lector».
- Clasificación de esas 72 fuentes: [clasificacion-fuentes.md](clasificacion-fuentes.md) — 27 de viviendas con anuncios visibles, 28 sin precios visibles en la página permitida, 10 comerciales y 7 con problema.
- El Hermes de Hampton tiene tareas programadas (cron) y herramientas de web, pero su proxy de salida solo deja pasar los proveedores de modelo, Telegram, GitHub y paquetes: hoy no puede abrir ninguna web de agencia.

## 4. Cómo funcionará cada día

```
01:00  La app abre la pasada del día y deja cada canal permitido «esperando a Hermes».
02:00  Tarea programada de Hermes → skill hampton-mercado:
         repetir hasta que la app diga «no queda nada»:
           1. pedir un canal          POST /api/hermes/market/next      (vía custodio)
           2. abrir la web            con sus herramientas de web, dentro del dominio y la ruta permitidos
           3. sacar los anuncios      solo hechos (lista de la sección 5)
           4. entregar una página     POST /api/hermes/market/:id/page  (≤ 10 anuncios, «quedan más» o «terminado»)
              → el custodio comprueba los anuncios contra la web antes de pasarlos a la app
           5. si falla                POST /api/hermes/market/:id/fail  (motivo: bloqueada, caída, ilegible)
Fin del día  La app compara con el día anterior, retira lo que falta dos veces, recalcula y avisa en el Inbox.
08:00  El resumen del equipo dice cuántas fuentes se leyeron enteras, cuántas no y por qué.
```

Reglas que protegen el inventario (las de hoy, más la decisión 2):
- Solo una lectura **completa** de un canal sirve para dar una casa por no encontrada. Si Hermes se queda a medias, falla o no llega, las casas se conservan y la fuente sale como «no leída».
- Tres fallos seguidos en un día bloquean el canal hasta el día siguiente.
- Al menos 60 segundos entre dos páginas del mismo canal.
- La reserva de un canal caduca a los 30 minutos: si Hermes se cae, el canal vuelve a la cola.
- Un canal que cuelga de otro (por ejemplo `/lettings/` cuando `/` también está permitido) se da por cubierto con el principal, como ya hace Finders Keepers.

## 5. Qué entrega Hermes por cada anuncio

| Campo | Obligatorio | Regla |
| --- | --- | --- |
| `listing_url` | Sí | Enlace del anuncio, en el dominio y la ruta permitidos. Identifica la casa. |
| `operation` | Sí | `rent` o `sale`. |
| `use` | Sí | `residential` o `commercial`. |
| `price_text` | Si hay precio | El texto tal cual aparece («£1,950 pcm»). La app calcula importe y periodo. Si la página leída es un feed JSON del propio sitio (no trae «£» ni «pcm»): «£», el importe del anuncio y, en un alquiler, el periodo que diga el sitio (`pcm`, `pw` o `pa`); el custodio pasa a la app solo ese texto, rehecho por él: el importe sale de un campo de precio del mismo objeto (nunca de un id o de los dormitorios) y el periodo solo si el propio feed lo da; si no, el alquiler llega sin cifra mensual («£2,265»). Si el objeto dice «For let» o «For sale» y no coincide con la operación de Hermes, se rechaza. |
| `parish` | No | Una de las 12 parroquias. Si no lo dice, vacío. |
| `bedrooms`, `bathrooms` | No | Solo viviendas. |
| `parking` | No | Solo `true` si lo dice; nunca «no» por omisión. |
| `area_sqft` | No | Solo comerciales. |
| `title` | No | Corto, sin texto comercial. |

Nunca descripciones, fotos, nombres ni teléfonos. Lo que no esté claro queda vacío: la app ya trata los datos desconocidos como «to confirm».

## 6. Seguridad

| Riesgo | Barrera |
| --- | --- |
| Hermes se inventa o copia mal un anuncio. | **El custodio comprueba**, sin IA, antes de pasar la página a la app: descarga una vez la página que Hermes dice haber leído y rechaza todo anuncio cuyo enlace o texto de precio no aparezca literalmente (y el precio, junto a su propio enlace). Si esa página es JSON válido (el feed del propio sitio, cuando la lista se carga con JavaScript; siempre dentro de los dominios y rutas revisados del canal), nada es literal: el anuncio solo pasa si su enlace y su importe son valores del **mismo objeto** del JSON, y a la app llega el precio rehecho por el custodio con ese importe, nunca el texto de Hermes. El periodo de un alquiler (`pcm`, `pw`, `pa`) lo declara Hermes, como la operación o la parroquia: el feed no lo trae y el custodio no puede comprobarlo; sin periodo, el alquiler llega sin cifra mensual. Un solo enlace o precio que no cuadre, o más de la mitad rechazada, y el canal entero cuenta como fallo. |
| Una web intenta darle instrucciones a Hermes. | La skill trata el contenido de las webs como datos, nunca como órdenes. La llave del mercado solo abre las tres rutas del mercado: no puede tocar aplicantes, fichas ni correo. El proxy de Hermes solo deja salir a los dominios del directorio. Sus otras capacidades (terminal del taller, GitHub) no cambian; ese es el riesgo que Luis aceptó. |
| Hermes sale de las webs permitidas. | La app solo le da dominios y rutas revisados; el custodio y la app rechazan enlaces fuera de ellos; el proxy no deja salir a otros dominios. |
| Una lectura mala borra casas. | Nada se borra. Retirar exige dos lecturas completas seguidas sin la casa; una lectura sospechosa (primera página vacía cuando antes había casas) cuenta como fallo, regla que ya existe. |
| Coste. | Cada día gasta uso del plan de ChatGPT de Hermes. Se mide en la fase 4 y el panel muestra las fuentes no leídas por falta de uso. |

Interruptores, apagados por defecto: `HERMES_MARKET_READY` (la puerta y la espera de Hermes) y `MARKET_AUTO_WITHDRAW_READY` (la retirada automática). Llave propia: `HERMES_MARKET_KEY`, distinta de `HERMES_KEY` y `HERMES_MAIL_KEY`.

## 7. Fases

| Fase | Qué se construye | Quién | Hecha cuando |
| --- | --- | --- | --- |
| 0 | Clasificar las fuentes permitidas; arreglar Finders Keepers. | Desarrollo | **Hecha el 23-nov** (`ca6c6478`, `92fb0e0e`). |
| 1 | **Puerta del mercado en la app**: rutas `next`, `page` y `fail`, llave e interruptor; la pasada deja los canales «esperando a Hermes» en vez de «sin lector» y abre una sola reserva por fuente; Settings › Automations muestra cuándo leyó Hermes por última vez y qué fuentes quedaron sin leer. Sin migración si basta con las tablas de 0043/0095; si hace falta, solo aditiva. | Desarrollo | Pruebas con un Hermes simulado: página buena, anuncio fuera del dominio, más de 10, reserva caducada, lectura a medias que no retira nada, interruptor apagado sin efecto. |
| 2 | **Retirada automática y comerciales**: la comparación diaria retira de las propuestas la casa que faltó en dos lecturas completas seguidas y la devuelve si reaparece; el inventario guarda uso y superficie; las búsquedas comerciales se cruzan con los locales del mercado. | Desarrollo | Pruebas: falta una vez → sigue; dos → retirada; reaparece → vuelve. Una búsqueda de oficina recibe un local y no una vivienda, y al revés. |
| 3 | **Piezas del VPS**: el custodio del mercado (llave + comprobación), la skill `hampton-mercado` con su tarea programada a las 02:00, y la lista de dominios para el proxy de Hermes y el del custodio, generada desde el directorio. Todo en el repositorio, listo para instalar. | Desarrollo prepara; **Luis instala** (es configuración de Hermes y del VPS) | Prueba en local con una web ficticia: Hermes simulado entrega, el custodio rechaza lo inventado, la app guarda lo bueno. |
| 4 | **Piloto con las 3 fuentes que ya conocemos**: Hermes lee Gaudin, Keys y Finders Keepers dos días seguidos mientras los lectores de código siguen. Se comparan casa por casa. | Luis enciende; desarrollo compara | Hermes encuentra al menos el 95 % de las casas de cada fuente, sin ninguna inventada. Entonces se apagan y borran los lectores de código. |
| 5 | **Primera carga por tandas** de unas 10 fuentes al día: primero las 27 de viviendas, después las 28 sin precios visibles, después las 10 comerciales. | Automático; desarrollo revisa cada tanda | Cada fuente tiene una lectura completa o un motivo anotado (bloqueada, sin anuncios, necesita revisión). |
| 6 | **Régimen diario**: todas las fuentes cada día. | Automático | Siete días seguidos con comparación hecha, sin fuentes bloqueadas sin explicar y con el uso de ChatGPT dentro del plan. |

Fuera de este plan: las 7 fuentes con problema y los dominios nuevos a los que redirigen (`propertystorejersey.com`, `radmanagement.info`) esperan a que Luis los revise en Market inventory. La categoría de vivienda (Qualified, Registered…) casi nunca sale en los listados; esas casas seguirán como «Requirements to confirm».

## 8. Lo que hace Luis

1. Instalar las piezas de la fase 3 con una guía paso a paso: custodio del mercado, llave, skill y tarea programada de Hermes.
2. Añadir los dominios del directorio a la lista de salida del proxy de Hermes (el archivo se genera; Luis lo pega y reinicia el proxy).
3. Encender `HERMES_MARKET_READY` para el piloto (fase 4) y `MARKET_AUTO_WITHDRAW_READY` cuando el piloto pase.
4. Revisar en Market inventory las fuentes pendientes cuando quiera ampliar el directorio.

## 9. Volver atrás

- Apagar `HERMES_MARKET_READY`: la app deja de esperar a Hermes, los canales vuelven a «sin lector» y el inventario se queda como estaba.
- Apagar `MARKET_AUTO_WITHDRAW_READY`: las casas que faltan vuelven a quedar solo como «no encontradas», como hoy.
- Quitar la tarea programada de Hermes o su skill.
- Hasta que acabe la fase 4, los lectores de código siguen existiendo y se pueden volver a usar.
