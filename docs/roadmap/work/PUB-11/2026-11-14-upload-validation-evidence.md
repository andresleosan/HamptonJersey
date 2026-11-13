# PUB-11 · Validación de fotos en la ruta de subida

Base: `2b4c224bf3ac48c44d470a396090d37dab39b2b2`. Estado de la tarea: parcial. Solo datos sintéticos locales; no se consultó ni modificó producción.

## Alcance en construcción

La ruta existente de fotos incorpora la inspección del contenedor completo de la foto y la miniatura antes de escribir R2 o D1. Las dimensiones y el tipo almacenados proceden de las cabeceras del archivo y no del formulario. El MIME declarado debe ser compatible; ausencia o tipo genérico no sustituyen la verificación de bytes. Se conservan los límites de 10 MiB por archivo, 16 millones de píxeles y miniatura de lado máximo 640. No se reduce la resolución ni se recodifican los bytes aceptados en el servidor.

La política admite imágenes estáticas JPEG, PNG y WebP con una lista acotada de estructuras; rechaza EXIF, XMP, texto/comentarios y perfiles ICC opacos, además de estructuras desconocidas o animación. El panel sigue recodificando las fotos mediante canvas antes de subirlas. El canvas se crea explícitamente en sRGB y, sobre su JPEG recién generado, se retiran los segmentos de metadata anteriores al scan conservando sus bytes comprimidos; no se aplica este paso al archivo original ni sustituye la validación del servidor. Un rechazo devuelve un error sin copiar metadatos al mensaje ni crear archivos o filas. Los perfiles de color o metadatos no admitidos requieren usar la preparación del panel.

Referencias primarias de formatos: [PNG, W3C](https://www.w3.org/TR/png-3/) y [contenedor WebP, Google](https://developers.google.com/speed/webp/docs/riff_container). Los fixtures de pruebas están generados localmente con Pillow y no contienen datos reales.

## Comprobaciones

- Antes de implementar, las pruebas de ruta reprodujeron 20 fallos (incluidos subtests) y 25 aciertos: se aceptaban firmas aisladas, truncamientos, EXIF y MIME contradictorio, y se guardaban las dimensiones declaradas. Log local: `/tmp/hampton-avanzar-20261114-upload-red.log`.
- Módulo: 44/44 tras corregir orden PNG con IDAT vacío (regresión RED observada). Ruta y módulo: 70/70 repetidos por revisión independiente. Focal integrado previo al último caso IDAT: 103/103 incluyendo regresiones de administración y calidad.
- Revisión independiente: sin hallazgos de código pendientes; aptitud condicionada a navegador, suite integrada y build/release.
- El primer intento del lanzador no inició el fixture porque node_modules era un enlace al host; se sustituyó solo ese enlace de esta sesión por una copia local de las mismas dependencias. Los controles del contenedor se conservaron.
- El navegador aislado detectó una incompatibilidad de encoder: Chromium añade APP2/ICC al JPEG de canvas. Se conservó una captura sintética de 1800 × 1200 como regresión; falló antes de corregir y pasó después. La comparación byte a byte conserva todo salvo el APP2 de 474 bytes. El ajuste de cliente también tuvo revisión independiente sin hallazgos. Referencia de color: [canvas sRGB, HTML Standard](https://html.spec.whatwg.org/multipage/canvas.html#canvascolorspacesettings).
- Focales finales de módulo/ruta/administración/calidad/preparación: 105/105.
- Chromium aislado: PASS 1280/390, teclado y zoom, reencode de fuente con GPS sintético, rechazo API directa EXIF/truncado/MIME, y upload/serve/decodificación de seis formatos sintéticos. Capturas inspeccionadas en `/tmp/hampton-browser-captures/run-KT5Dnr`. La primera pasada WebKit completó las aserciones de fotos, pero terminó roja por el preconnect de Google Fonts en el contenedor sin red; se alineó únicamente esa condición con la exclusión de fixture ya usada por el E2E general. La pasada final WebKit es PASS a 1280/390 con teclado/zoom, misma ruta real y decodificación de fixtures; capturas `/tmp/hampton-browser-captures/run-Obthas`. La primera suite integrada terminó con 2272/2273: faltaba jsqr, una dependencia 1.4.0 ya declarada. Se recuperó una copia instalada localmente de esa misma versión, sin tocar el lockfile ni otros árboles; la repetición íntegra pasó 2275 pruebas JavaScript y 29 Python. Build, release estricto, catálogo y paquetes: PASS. Se conserva el aviso previo de tamaño de chunk del panel.

## Límites pendientes

La inspección valida estructura y cabeceras: no decodifica por completo los bitstreams JPEG/PNG/WebP ni garantiza que todo flujo comprimido aceptado sea decodificable o esté libre de contenido encubierto. Las imágenes sintéticas aceptadas se comprobarán con decodificación de navegador; ese control no se extiende a todo archivo posible. No elimina datos de objetos existentes, inspecciona producción ni invalida cachés anteriores.

Siguen pendientes el flujo PDF privado y staging durable, limpieza recuperable tras fallos o respuestas inciertas, guardado atómico de orden/visibilidad/portada, autorización durable y revocación durante el efecto, límites totales de multipart y calibración con fotografías representativas. Los controles actuales de sesión y origen se conservan; esta entrega no acredita esas garantías nuevas ni cambia su contrato. PUB-11 permanece parcial, sin migración ni activación remota.

Siguiente tramo concreto: Tarea 3 del plan PUB-11, agrupar el guardado de medios y su versión en el mismo batch, con rollback y conflicto comprobados; no confundirlo con la política de mínimos de publicación todavía pendiente.

## Decisiones de la revisión

- Ruling: se mantiene la inspección estructural sin decoder íntegro. Un flujo comprimido inválido puede superar cabeceras/estructura; el coste residual es una foto no decodificable, por lo que no se declara validación universal ni PUB-11 completa.
- Ruling: rechazar perfiles ICC y metadata opaca puede rechazar una API directa con una imagen legítima. Se mantiene el reencode por Photos como vía existente y se exige comprobarlo con los navegadores aislados; no se promete compatibilidad universal.
- Ruling: PDF privado, staging, atomicidad, permisos durante el efecto y calibración siguen en sus tramos del plan. No se atribuyen a este cambio garantías que no implementa ni se abren servicios para completarlas.
- Ruling: los objetos existentes, cachés y producción permanecen sin evaluar; ninguna prueba sintética acredita su estado.

Resultado del lote: PUB-11 permanece parcial. Catálogo local: 68/215 (31,63 %), sin cierres nuevos. No se aplicaron migraciones remotas, no se activaron servicios ni se verificaron datos reales. La publicación y el tablero se verifican después del commit.
