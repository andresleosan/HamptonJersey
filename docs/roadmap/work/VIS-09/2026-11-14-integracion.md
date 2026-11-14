# VIS-09 · Integración de la política de visitas

14-nov-2026, copia aislada. Sin push, sin despliegue, sin migraciones remotas. La migración `0047` sigue sin aplicar en producción; el interruptor `VIS09_VIEWING_POLICY_READY` queda apagado (no se tocó `wrangler.toml`).

## Qué se construyó

- `loadAvailability` (disponibilidad pública y del panel) lee, con el interruptor encendido y en el mismo batch, las reglas guardadas por negociador, la parroquia de la propiedad y las visitas no canceladas del día anterior al siguiente con su instantánea. Los huecos de un negociador con reglas usan su duración (en la rejilla de 30 minutos), sus márgenes por parroquia y su máximo diario mediante `canReserveViewing`; la ventana horaria de la propiedad usa la misma duración.
- Las tres escrituras (reserva del panel, reserva web y reprogramación) usan `slotGuard`: con reglas, `reservationPolicyGuard` revalida dentro del INSERT/UPDATE la revisión, la actividad del negociador, la parroquia, el máximo y los vecinos; sin reglas, `clash()` como hoy más «no se guardaron reglas entretanto». En el panel también se revalida que el admin siga existiendo. Cada escritura con reglas guarda su instantánea (parroquia, márgenes y revisión) en el mismo batch, y el evento sigue ligado a la escritura.
- `PUT /admin/negotiators/:id/viewing-policy` con bloqueo por revisión (0 = sin reglas); `GET /admin/negotiators` añade `viewing_policy`. Interruptor apagado: 404 y respuesta sin cambios.
- Panel, Disponibilidad: formulario «Viewing rules» (duración, margen, margen extra por parroquia, máximo diario), visible solo con el interruptor encendido.

## Decisiones

- Ruling: sin reglas guardadas se mantienen exactamente las reglas fijas de hoy (30 min, margen 15, sin extra por parroquia ni máximo), aunque el interruptor esté encendido; los valores aprobados 30/15/15/8 solo se proponen en el formulario. Es lo más reversible.
- Ruling: cambio horario. La hora de la candidata se valida con su único offset explícito (GMT o BST) vía `jerseyViewingInstant` y se rechaza solo si hay un cambio horario a menos de 6 h; así la aritmética en hora civil es exacta y no se guarda offset. Las reservas históricas no se reescriben y se comparan en hora civil como hoy. Sustituye el rechazo de ±42 h, que bloqueaba sábados y lunes junto al cambio.
- Ruling: la rejilla de inicio sigue siendo de 30 minutos para cualquier duración.
- Ruling: el panel no revalida horarios ni excepciones del negociador dentro de la transacción; hoy tampoco se hace.

## Pruebas

- Primero fallaron: `tests/server/viewing-policy-routes.test.mjs` (9 pruebas nuevas) y la prueba de cambio horario añadida a `viewing-policy.test.mjs`.
- Focales: 173/173 (`viewing*`, `negotiators`, `public*`, `property-viewing*`, `pub-16`, `est-15`).
- Navegador aislado (Chromium, fixture local sin red): `tests/vis-09-viewing-rules.e2e.cjs` PASS a 1280 y 390.
- `npm test` (una vez): 2.316 de 2.319 pruebas Node. Las 3 que fallaron son pruebas Miniflare D1 de EST-01 y MSG-02, que no tocan visitas; al repetirlas solas pasaron 3/3 (dependen de tiempos bajo carga). La parte Python no se ejecutó porque la cadena se corta al fallar Node.

## No verificado

D1 remoto, migración 0047 aplicada, datos reales, tzdata de producción, revisión independiente. La web pública no muestra la duración por negociador (no usa `slot_minutes`).
