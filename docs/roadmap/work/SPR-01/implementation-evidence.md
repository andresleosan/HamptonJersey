# SPR-01 · Baños y fecha de disponibilidad en Listings

Implementación local sobre `b25d0b4` (13-nov-2026). No se ha publicado, aplicado ninguna migración remota ni realizado ninguna prueba en producción. La revisión independiente y la integración corresponden al siguiente turno.

## Alcance y adaptación del diseño

- La consulta normal de Listings devuelve `bathrooms` y `available_on`; la variante `slim=1` conserva su contrato. La lista distingue 0, 1, varios y baños desconocidos.
- La fecha solo se presenta en propiedades no archivadas cuyo estado está en `ON_MARKET`; sigue siendo una fecha civil, no una confirmación. No se infiere una fecha para datos desconocidos. El editor explica esta distinción.
- Ruling: el diseño anterior proponía una nueva columna `available_from` y excluirla de la proyección pública. PUB-06 ya proporciona `available_on`, su editor y su proyección pública con 0042; se reutilizan sin segunda columna, editor ni migración. Coste: los planes antiguos que mencionan `available_from` deben adaptarse al contrato real; ninguna proyección pública existente se modifica.
- El validador existente aceptaba `0000-01-01`; ahora rechaza el año cero en este campo. Una respuesta inválida no modifica la ficha ni agrega eventos. Los valores no inferidos y el contrato del resto de fechas se conservan.
- Las fuentes y el inventario externos no están cubiertos por esta entrega.

## Reflujo preexistente

En WebKit aislado, al aplicar zoom nativo superior al 200 % en el viewport móvil de 390 px, el viewport CSS quedó en 188 px y Listings desbordaba a 255 px. Al retirar del DOM los nuevos datos de baños y fecha, el desbordamiento siguió en 255 px: era preexistente. Se ajustaron exclusivamente filtros y filas de Listings para anchuras estrechas; el mismo recorrido posterior no desborda y el enlace sigue accesible por teclado. Las capturas del recorrido final se guardaron en `/tmp/hampton-browser-captures/run-h4JQ34`.

## Verificación local

- Tests focales API/fecha/formato: 26/26 aprobados. Se comprobó primero que las pruebas de proyección, baños y año cero fallaban por la funcionalidad ausente.
- `npm test`: 1.253 JavaScript y 25 Python aprobadas; build, `check:release`, `team:check`, `check:packages` y comprobación de espacios aprobados. El build conserva la advertencia de un chunk mayor de 500 kB.
- `E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/spr01-listings.e2e.cjs npm run test:e2e:isolated`, con Chromium y con `HAMPTON_E2E_BROWSER=webkit`: ambos aprobaron 1280/390, cero/desconocido, estados retirados/archivados, guardado y descarte, foco de teclado y días civiles en Jersey, Los Ángeles y Kiritimati. WebKit comprobó zoom nativo superior al 200 %; Chromium comprobó el ancho de viewport equivalente. Las respuestas 400/409 de recuperación del editor fueron inyectadas en el fixture; la validación del servidor se probó aparte mediante la API local real.
- El log del fixture de Chromium contiene avisos de certificado TLS local pese a la salida 0; no se atribuye una causa adicional no investigada. MCP no se ejecutó y ninguna prueba local certifica producción.

SPR-01 permanece parcial hasta revisión independiente, integración, publicación y comprobaciones que correspondan. No se ha actualizado el checklist ni se ha declarado hecho.

## Integración y revisión independiente

Sobre la base 1813b01 se conservan los controles de retirada PUB-09 junto a baños y fecha en la lista. Revisión independiente sin defectos funcionales bloqueantes; 34 pruebas focales adicionales aprobaron. Tras resolver el solapamiento de imports, la suite integrada aprobó 1.292 pruebas Node y 25 Python, build, release y catálogo; los recorridos aislados SPR-01 y PUB-09 también aprobaron.

Pendiente menor de cobertura: la prueba del editor verifica el error y ARIA, pero no acredita el foco efectivo del campo inválido ni la recuperación 400/409 del editor con zoom al 200 %. No se presenta como validado. La integración externa de inventario y fuentes pertenece a BUS-10/EST-16/SPR-07.

Sobre el main `0c11720`, la suite final pasó 1.296 Node y 25 Python, build, release y catálogo. WebKit aislado volvió a aprobar el recorrido integrado con PUB-09 y zoom nativo.

El commit `2005312e2f3551043ccc62928fc5c334736f5a76` está en main; GitHub registra Cloudflare Pages y Workers Builds `hampton-jobs` completed/success. No se ha repetido un smoke funcional en producción. Los límites de foco/zoom y de integración externa permanecen.

El recorrido de PUB-04 cubrió además Available from con 400 simulado y recuperación de borrador tras 409 simulado, con foco, etiqueta y error visibles a zoom nativo en 1280/390. La validación de servidor se comprobó aparte; no es prueba funcional de producción. La integración de fuentes externas sigue pendiente.
