# AGE-14 · Construcción 14-nov-2026

Planes ejecutados: [plan 8-nov](../../../superpowers/plans/2026-11-08-age-14-advertiser-personal-data-suppression.md) + [cierre 9-nov](../../../superpowers/plans/2026-11-09-age-14-suppression-across-linked-copies-closure.md) (el índice TP-05 apunta a este último; se leen juntos). Mapa de copias: [data-map.md](data-map.md).

## Qué se construyó

- `migrations/0057_advertiser_suppression.sql` (aditiva): `advertisers.suppressed_at`, tabla `advertiser_suppressions` (actor, fecha, motivo fijo; nunca el dato) y trigger que rechaza cualquier UPDATE que cambie nombre, tipo, detalles o `suppressed_at` de una ficha suprimida. No depende de 0043/0045/0046/0049/0050/0051.
- `server/advertiser-privacy.js`: `previewAdvertiserSuppression` (GET `/admin/advertisers/:id/suppression`) y `suppressAdvertiserPersonalData` (POST). CAS por `version` + `preview_hash`; 409 si cambió la ficha o sus copias; repetición idempotente (200 `already`); un único batch D1 borra los campos, escribe la auditoría y cancela correos pendientes al contacto.
- `server/routes/advertisers.js`: PUT, actividad y motivo devuelven 409 en fichas suprimidas; el listado indica `suppression` según el flag.
- Panel: revisión previa con lo que se quita, lo que se conserva y copias fuera; motivo obligatorio por radio; estados de carga/error/conflicto; foco y teclado. `advertiserSession.js` guarda solo IDs suprimidos y los difunde por BroadcastChannel; respuestas antiguas se descartan; al ocultar la pestaña, `pagehide`, `offline` o volver desde bfcache, lista y ficha se ocultan hasta revalidar con el servidor.
- Flag `AGE14_SUPPRESSION_READY === '1'`: sin él no hay rutas y la UI conserva «Deletion is not available in this app.».

## Decisiones tomadas aquí (opción simple y reversible)

- Autorización: sesión staff existente (indicación del encargo).
- Motivo como enum (`no_longer_needed`, `person_request`) en vez de texto libre, para que la auditoría no pueda contener datos personales.
- Tras suprimir, la ficha queda en solo lectura (como el prototipo retirado de AGE-04).
- Notas libres, canales y razones de revisión se conservan (la spec define datos personales como nombre de particular/contacto, teléfono y correo); la UI avisa de editarlas antes.
- Las copias en correo/fuentes/mercado se informan y bloquean la afirmación de supresión completa, no la acción; solo se cancelan correos aún no enviados.

## Pruebas y resultados

- Rojo previo: 13 pruebas nuevas fallando por comportamiento ausente (404/funciones inexistentes).
- Focales: `tests/server/age-14-closure-1.test.mjs`, `age-14-closure-2.test.mjs`, `age-14-suppression-d1.test.mjs` (Miniflare D1: rollback atómico y trigger), `tests/age-14-session.test.js` + `advertisers.test.mjs`: 21/21.
- `npm test`: 2348 Node + 29 Python, 0 fallos. `npm run build` y `npm run check:release`: salida 0.
- E2E aislado Chromium `E2E_SCRIPT=tests/age-14-suppression.e2e.cjs` a 1280 y 390: salida 0 (confirmación por teclado, GET retenido en otra pestaña, evento perdido en otro contexto revalidado al volver, guardado obsoleto 409, recarga con 503, navegación atrás, conflicto 409 con foco, zoom CSS 200%).
- E2E aislado `E2E_PHASES=advertisers` con flag apagado: `e2e OK (advertisers)`.

## No verificado

- Producción, migración remota y activación del flag: no ejecutados ni autorizados aquí.
- Chromium emulado no dispara `offline`/`online` al usar `setOffline`; la prueba despacha el evento. La ocultación por `visibilitychange` se simula redefiniendo `visibilityState`.
- Zoom nativo del navegador, lector de pantalla y WebKit no probados. Pestañas suspendidas que ya mostraron el dato no se pueden borrar al instante; se ocultan al reanudar.
- Revisión independiente pendiente antes de ofrecer la supresión (criterio de aceptación de la tarjeta).
