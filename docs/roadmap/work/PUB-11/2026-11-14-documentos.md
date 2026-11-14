# PUB-11 · Documentos PDF privados por ficha (14-nov-2026)

Plan: [2026-11-08-pub-11-media-quality-private-documents.md](../../../superpowers/plans/2026-11-08-pub-11-media-quality-private-documents.md), Tarea 2. Spec: [own-publication-completion §3](../../../superpowers/specs/2026-11-08-own-publication-completion-design.md). Maestro 10-nov: ADM-05 (repositorio genérico) sigue fuera; esto son solo documentos privados de la ficha.

## Qué se construyó

- `migrations/0058_listing_documents.sql` (aditiva: una tabla y un índice). Tabla propia `listing_documents`, separada de `media`: ningún lector público, sitemap, `/api/listings` ni `/media/:id` la consulta. CHECK de prefijo `private-docs/*`, `visibility='staff'` única, tamaño ≤ 20 MiB, estado `pending|stored|removing`. FK a `listings` sin cascada.
- `server/listing-documents.js` y `server/routes/listing-documents.js`: `GET/POST /api/admin/listings/:id/documents`, `GET/DELETE …/documents/:docId`. Sesión staff, mismo origen (router existente), SQL parametrizado.
- Subida: cuerpo PDF crudo leído en streaming con tope duro de 20 MiB (con o sin `content-length`), `content-type` debe ser `application/pdf` (415), firma `%PDF-` al inicio y `%%EOF` en los últimos 1024 bytes (400), SHA-256 calculado y pasado a R2 (`put … { sha256 }`), que rechaza bytes distintos. Nombre en cabecera `x-document-label` (codificado), nunca en la URL; máximo 50 por ficha.
- Intención durable: fila `pending` → objeto R2 → `stored` + evento en un batch. Fallo de R2 o del commit: se borran objeto e intención. Borrado: `removing` + evento en un batch (deja de listarse y descargarse), luego objeto y fila. Una intención `pending` de más de 10 min o un `removing` pendiente se reconcilian (solo en escrituras de esa ficha, nunca en GET) sin leer otros archivos. No se afirma atomicidad entre D1 y R2.
- Descarga: `attachment`, `nosniff`, `private, no-store` (el router fuerza `no-store`), `CSP: default-src 'none'; sandbox`; nombre de archivo saneado; se revalida la fila tras leer el objeto.
- Eventos `listing_document.added/removed` con `entity_type='admin'` (mismo patrón que email) y solo `{listing_id, document_id, bytes}`: sin nombre, clave ni contenido; no entran en la historia de la ficha.
- `server/media.js`: `/media/:id` devuelve 404 a cualquiera (también staff) si la clave o miniatura empieza por `private-docs/`.
- Borrar una ficha archivada con documentos devuelve 409 (y la FK es la última barrera).
- Panel: `admin/src/ListingDocuments.jsx`, sección «Private documents» bajo Photos, solo si `GET /admin/listings/:id` trae `documents_enabled` (flag activo). Lista, subida múltiple, descarga y borrado con confirmación; vacío, carga, error con «Try again».
- Interruptor `PUB11_DOCUMENTS_READY === '1'`: sin él no se montan rutas ni aparece la UI. No se tocó `wrangler.toml`.

## Decisiones

- Autorización = sesión staff existente (encargo).
- Tabla separada en vez de `media.kind='document'`: la spec prohíbe que la media pública con kind=document sea permiso; separarla evita cualquier ruta pública por construcción (opción más simple y reversible).
- «20 MiB stream» se cumple como lectura en streaming con corte inmediato al superar el tope; el PDF aceptado se mantiene en memoria (≤ 20 MiB) para verificar firma y huella antes de escribir en R2 (decisión propia, reversible).
- Eventos fuera de la historia de la ficha: la historia trata tipos desconocidos como `listing.unknown` (decisión propia).

## Pruebas y resultados

- RED: `node --test tests/server/pub-11-documents.test.mjs` antes de implementar: 1 pasa (flag apagado), 13 fallan.
- Final: `tests/server/pub-11-documents.test.mjs` 14/14; `tests/server/pub-11-documents-d1.test.mjs` (D1 y R2 locales de Miniflare, R2 real verificando sha256) 7/7.
- `npm test`: 2355 pruebas JS, 2351 pasan; 4 fallos por carga del host (load ≈ 32: sockets de Miniflare cerrados y un timeout de DOM) en `reg06-review-dom`, `est-01-progress-d1`, `msg-02-semantic-d1` y `notification-reconcile`, ajenos a este cambio; reejecutados uno a uno pasan los cuatro (1/1, 1/1, 1/1, 10/10). Python incluido en la suite.
- `npm run build` y `npm run check:release`: correctos.
- E2E aislado Chromium (`E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/pub-11-documents.e2e.cjs npm run test:e2e:isolated`) a 1280 y 390: subida, rechazo de PDF falso, descarga (attachment/nosniff/no-store), 404 en `/media/:id`, 401 anónimo, borrado con teclado y confirmación, error de carga con «Try again», foco visible, objetivos ≥ 32 px, zoom 200 % sin desbordar y consola limpia. WebKit no se ejecutó.

## No verificado

- Producción: migración 0058 no aplicada, flag no activado, sin `--remote`.
- Calibración de avisos de calidad de fotos con material real: no hay fotos representativas; los avisos siguen siendo orientativos.
- No se analiza el interior del PDF (JavaScript, `/Launch`, adjuntos); se mitiga con `attachment`, `nosniff` y CSP sandbox.

## Mejoras

- Barrido periódico de intenciones huérfanas (hoy solo se reconcilian en la siguiente escritura de esa ficha).
- Análisis estructural del PDF (objetos activos) y firma/procedencia/`rights_ref`/tipo de documento previstos en la spec.
- Subida directa a R2 con `FixedLengthStream` para no mantener 20 MiB en memoria.
- Objetivos táctiles de 44 px en móvil para Download/Delete (hoy ~38 px, ≥ 32 px).
- Entrada «Private documents» en la navegación de secciones del editor.
