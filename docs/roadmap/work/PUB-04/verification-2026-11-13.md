# PUB-04 · Verificación del navegador y foco del editor

13-nov-2026. La entrega `13a1a51486da948c9ed0a289b6cbb198c0fa81aa` y la migración 0040 constan históricamente como publicadas y verificadas en el [ledger](../../../superpowers/plans/2026-11-11-pub-04-internal-details-ledger.md). Ese registro también documenta el 403/1010 recibido por el smoke público; esta comprobación no lo repite ni acredita un recorrido autenticado en producción.

## Pruebas locales

En base `3e6191b`, 63 pruebas focales de dirección, historial y eventos pasaron. `tests/listing-address.e2e.cjs` se ejecutó con el lanzador aislado sin red y datos ficticios. Chromium pasó a 1280/390; WebKit inicialmente falló por avisos de preconexión a fuentes externas. Se adaptó la prueba al mismo filtro específico que usa el recorrido general: solo esos avisos de fuentes, y solo cuando `E2E_OFFLINE_FONTS=1`; La prueba conserva además sus exclusiones previas de carga de recursos y Turnstile; el resto de errores de consola y las excepciones de página siguen contabilizándose. No se acredita una consola o red sin incidencias.

La revisión visual de las capturas sintéticas detectó que a 390 píxeles y zoom nativo superior al 200 % la barra fija de acciones podía ocultar el campo inválido. Una prueba nueva reprodujo el fallo y pasó tras poner la barra en el flujo normal en ventanas estrechas o bajas. Otra prueba mostró que la etiqueta podía quedar fuera de pantalla; al devolver el foco, el editor centra el grupo que contiene el campo, la etiqueta y el mensaje. Las capturas finales se inspeccionaron: los tres quedan visibles sin solapamiento. En una pantalla pequeña los controles de guardar pueden requerir desplazamiento adicional.

WebKit aislado pasó a 1280/390 con zoom nativo superior al 200 %, foco y comprobación geométrica de campo/etiqueta/mensaje, borrador conservado y recuperación después de 409 simulado; la respuesta de validación se ensayó en la API local. La publicación, consentimiento y privacidad se probaron solo con datos ficticios. No se ha realizado smoke público de producción ni activación de fichas reales en esta entrega.

## Integración posterior

Sobre `85e97b3`, la suite integrada pasó 1.382 pruebas Node y 25 Python, build, release y catálogo. WebKit aislado volvió a pasar ambos anchos. Para la fecha `Available from` de SPR-01, una respuesta 400 sintética comprueba foco y visibilidad de campo, etiqueta y mensaje a zoom nativo en 1280/390. La misma aserción pasó en 1280 y falló en 390 sobre la base sin la corrección; pasó en ambas tras integrarla. Las capturas de fecha se inspeccionaron. El conflicto 409 de ese mismo editor se simula y verifica conservación y recuperación del borrador en ambas anchuras con zoom nativo. La validación de código postal, distinta de la fecha, usa la respuesta de la API local.

La repetición sobre `e296405` pasó 1.392 pruebas Node y 25 Python, build, release y `team:check`; WebKit aislado volvió a pasar los dos anchos y el recorrido de fecha y 409 descrito.

También pasó el E2E aislado de SPR-01 con WebKit a 1280/390 y las tres zonas horarias cubiertas por su fixture. El E2E de retirada PUB-09 pasó en Chromium a 1280/390 sobre la integración anterior `85e97b3`.
La repetición de PUB-04 en Chromium aislado sobre `e296405` también pasó a 1280/390; el zoom nativo de las regresiones específicas se comprobó en WebKit.

## Revisión independiente

Sin defectos bloqueantes observados en foco, CSS y compatibilidad con PUB-09. La medición geométrica comprueba el centro de campo, etiqueta y error; la visibilidad completa se valoró en capturas locales. El 409 simulado acredita conservación y reintento del borrador, no una carrera CAS real. La revisión no ejecutó navegador ni comprobó producción.
