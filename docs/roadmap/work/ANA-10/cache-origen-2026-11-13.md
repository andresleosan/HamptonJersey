# ANA-10 · Alcance y caché de origen — 13 nov 2026

## Decisión vigente

El [plan del 10-nov](../../../superpowers/plans/2026-11-10-ana-10-qr-agregado.md) sustituye la atribución individual del [plan anterior](../../../superpowers/plans/2026-11-08-ana-10-typed-contact-acquisition-source.md): Luis decidió un QR por póster de propiedad y contar aperturas solo de forma agregada. No atribuir procedencia a contactos ni seguir visitantes; no hacer folletos de reparto. El [diseño de analítica](../../../superpowers/specs/2026-11-10-tanda7-analitica-design.md) ratifica que las aperturas son aproximadas y no personas únicas. Se corrige la ficha del tablero para que no invite a construir el alcance sustituido.

## Avance local

Se preparó el gate `ANA10_QR_NO_STORE`, **no configurado ni activado**. Solo su valor exacto `1` indica `Cache-Control: no-store` en el catálogo `/api/listings` y en las respuestas 200 y 404 de la ficha `/p/<id>`. Por defecto se conservan las cachés previas de 60 segundos para el catálogo y el 404, y 300 para la ficha publicada; las fichas y catálogos con dirección exacta y el 503 de la ficha continúan siempre `no-store`. No se modificaron la configuración remota ni otras páginas.

La revisión advirtió que aplicar `no-store` incondicionalmente aumentaría las consultas D1 para todas las visitas al catálogo y a fichas antes de existir el QR. El gate conserva el comportamiento previo por defecto. Antes de activarlo faltan una medición representativa de carga y coste, revisión de capacidad y verificación de CDN; no hay una estimación real en esta entrega.

Las pruebas del comportamiento predeterminado fallaron primero ante el cambio de caché incondicional y después pasaron con el gate cerrado. `node --test --test-concurrency=1 tests/server/public.test.mjs tests/server/seo.test.mjs tests/server/listing-address.test.mjs`: **54/54** con SQLite en memoria y datos sintéticos. Cubren ambos estados, valores inesperados del gate, direcciones exactas, GET/HEAD con `HTMLRewriter` simulado y publicación, retirada y republicación en peticiones nuevas. No se ejecutaron D1/Miniflare, navegador, proxy/CDN ni pruebas físicas en esta entrega. Playwright: no aplica a este cambio de cabeceras de servidor; la comprobación de caché con navegador y proxy del plan sigue pendiente.

## Límites y siguientes pasos

Este avance **no completa ANA-10**: no crea ni activa QR, redirección, tablas, contador o consulta Staff. Faltan el flujo íntegro y sus permisos, atomicidad y límite de escritura, revisión de privacidad y retención, y las pruebas exigidas por el plan. La retirada al cumplirse las 24 horas de `Let agreed`, la coherencia de medios y otras condiciones de PUB-16 no quedan acreditadas aquí. La captación de propietarios y las verificaciones PRE-03/PRE-09 siguen fuera de esta entrega; no se presupone consentimiento.

`no-store` no borra copias anteriores ni demuestra que una regla CDN lo respete, ni elimina contenido que ya está abierto en una página. Antes de activar QR hay que verificar las reglas y la invalidación o vencimiento de todas las cachés previas, probarlas con reloj, proxy y navegador, y no activar si una duración o política se desconoce. La prueba física del QR sigue pendiente y no se ha consultado producción.

## Integración posterior

Sobre main `7eed88e38292adc7809e9c12e55a4c4171321649`, después de la corrección que deja el gate apagado por defecto, pasaron **54/54** focales de caché, proyección pública y dirección; la suite integrada pasó **1.791/1.791** pruebas Node y **25/25** Python. También pasaron build, `check:release`, `team:check`, `check:packages` y `git diff --check`. Playwright: no aplica a esta entrega sin interfaz; sigue pendiente la prueba futura de caché con proxy/navegador del plan. Los ensayos usaron únicamente datos ficticios y no acreditan configuración, rendimiento o cachés reales.
