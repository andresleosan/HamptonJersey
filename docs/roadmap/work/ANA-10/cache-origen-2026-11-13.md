# ANA-10 · Alcance y caché de origen — 13 nov 2026

## Decisión vigente

El [plan del 10-nov](../../../superpowers/plans/2026-11-10-ana-10-qr-agregado.md) sustituye la atribución individual del [plan anterior](../../../superpowers/plans/2026-11-08-ana-10-typed-contact-acquisition-source.md): Luis decidió un QR por póster de propiedad y contar aperturas solo de forma agregada. No atribuir procedencia a contactos ni seguir visitantes; no hacer folletos de reparto. El [diseño de analítica](../../../superpowers/specs/2026-11-10-tanda7-analitica-design.md) ratifica que las aperturas son aproximadas y no personas únicas. Se corrige la ficha del tablero para que no invite a construir el alcance sustituido.

## Avance local

`GET /api/listings` devuelve `Cache-Control: no-store` desde origen. La ficha `/p/<id>` usa también `no-store` tanto para respuesta 200 como 404; su 503 ya lo usaba. Esto afecta la respuesta entregada por el código local integrado en las rutas existentes, sin datos adicionales ni seguimiento. Otras páginas mantienen su política actual. Como deja de poder reutilizarse la respuesta de catálogo y ficha donde se respeten las cabeceras, puede aumentar lecturas y carga; no se ha estimado el impacto real.

Dos pruebas nuevas fallaron primero por las antiguas cabeceras de 60 y 300 segundos y después pasaron. `node --test --test-concurrency=1 tests/server/public.test.mjs tests/server/seo.test.mjs tests/server/listing-address.test.mjs`: **52/52** con SQLite en memoria y datos sintéticos. Cubren las cabeceras, GET/HEAD con `HTMLRewriter` simulado y publicación, retirada y republicación en peticiones nuevas. No se ejecutaron D1/Miniflare, navegador, proxy/CDN ni pruebas físicas en esta entrega. Playwright: no aplica a este cambio de cabeceras de servidor; la comprobación de caché con navegador y proxy del plan sigue pendiente.

## Límites y siguientes pasos

Este avance **no completa ANA-10**: no crea ni activa QR, redirección, tablas, contador o consulta Staff. Faltan el flujo íntegro y sus permisos, atomicidad y límite de escritura, revisión de privacidad y retención, y las pruebas exigidas por el plan. La retirada al cumplirse las 24 horas de `Let agreed`, la coherencia de medios y otras condiciones de PUB-16 no quedan acreditadas aquí. La captación de propietarios y las verificaciones PRE-03/PRE-09 siguen fuera de esta entrega; no se presupone consentimiento.

`no-store` no borra copias anteriores ni demuestra que una regla CDN lo respete, ni elimina contenido que ya está abierto en una página. Antes de activar QR hay que verificar las reglas y la invalidación o vencimiento de todas las cachés previas, probarlas con reloj, proxy y navegador, y no activar si una duración o política se desconoce. La prueba física del QR sigue pendiente y no se ha consultado producción.
