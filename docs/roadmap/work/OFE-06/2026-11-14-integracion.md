# OFE-06 · Integración del seguimiento interno semanal — 14 nov 2026

Estado: **construido y probado en local, detrás de `OFE06_WEEKLY_REVIEW_READY` (apagado por defecto)**. Falta aplicar la migración 0053, encender el interruptor en Pages y en el Worker del reloj, y que el equipo fije día y hora.

## Qué se construyó

- `migrations/0053_sale_followup.sql` (aditiva): `sale_followups` (una fila por venta y semana Jersey, `UNIQUE(sale_id, week_key)`, estado `open|reviewed|cancelled`) y `sale_external_contacts` (parte, fecha y referencia corta). Ambas siguen a su venta con `ON DELETE CASCADE`, igual que `sale_milestones`.
- `server/sale-followup.js`:
  - Configuración en `app_settings.sale_followup_schedule`, sin fila = apagado. `PUT /admin/sale-followups/schedule` valida el día (`mon`…`sun`) y la hora (`HH:MM`). Un día u hora nuevos ponen `activatedAt` = ahora; volver a guardar el mismo horario conserva su inicio.
  - `saleFollowupPass(env, at)` en el reloj (`server/jobs.js`, solo con el interruptor). Usa `saleFollowupWindow` (semana de lunes Jersey; semana actual y anterior). Por cada venta en curso creada antes del vencimiento escribe, en un único batch, el evento `sale.followup_due`, la tarea común de NOT-11 (`taskStatements`, `task_key = sale-followup:<venta>:<semana>`, categoría `task`, destino la venta) y la fila de seguimiento. Todo va protegido, así que repetir el tick no escribe nada. Primero resuelve las tareas abiertas de ventas completadas o caídas (`sale.followup_closed`, `resolved:true`, estado `cancelled`). Procesa como máximo 50 de cada tipo por tick.
  - `POST /admin/sales/:id/followups/:fid/review`: solo vale para una revisión abierta de esa venta en curso y exige la instantánea de hitos leída, comprobada en el mismo `UPDATE`. Si un hito cambió, responde 409. Marca la revisión como `reviewed` con una nota interna opcional (≤300) y resuelve la tarea por `taskStatements`. Nunca cambia un hito.
  - `POST /admin/sales/:id/contacts`: guarda la referencia mínima de una gestión externa. No marca hitos y no envía nada.
  - `GET /admin/sales/:id/followup`: devuelve las revisiones, las gestiones y la instantánea.
- Interfaz: `admin/src/SaleFollowup.jsx`. En Automations, la tarjeta «Weekly sale review» con día, hora, Turn on y Turn off. En la ficha de venta, «Weekly review» y «Steps taken outside the app». Ninguna se muestra si el servidor responde 404, es decir, con el interruptor apagado.
- Rutas en `server/api.js` y pase en `server/jobs.js`, ambos condicionados a `OFE06_WEEKLY_REVIEW_READY === '1'`. No se editó `wrangler.toml`.

## Pruebas

- RED: `node --test tests/server/ofe-06-sale-followup.test.mjs` falló en 5 de 7 casos antes del código. Las 2 que pasaron comprueban ausencias.
- GREEN: el mismo archivo pasa 7 de 7. Cubre: sin interruptor no hay rutas ni tareas; apagado hasta configurar y validación; una tarea por venta y semana, con ticks repetidos idempotentes y la semana siguiente con tarea propia; venta nacida después del vencimiento; resolución al completar o caer la venta; revisión con instantánea obsoleta (409, sin escritura), otra venta (404), nota demasiado larga (400) y doble revisión (409); la gestión externa no toca los hitos; sin sesión, 401. En todos los casos `outbound` queda en 0 filas.
- Focales: ofe-06 (store y schedule), jobs, sales, schema y automations, 77 de 77.
- E2E aislado (`E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/ofe06-weekly-review.e2e.cjs npm run test:e2e:isolated`, Chromium, contenedor sin red, datos ficticios): pasó a 1280 y a 390 px. Recorre encender y apagar el horario, marcar la revisión, el error de foco y el registro de la gestión, sin scroll horizontal ni errores de página. El seguimiento abierto del fixture se insertó por SQL porque el reloj no corre en el fixture.
- `npm test`: 2.316 de 2.316 en Node y 29 de 29 en Python.

## Decisiones (fuente)

- Tabla `sale_followups` y contrato `taskStatements` con `ifInserted` (plan de OFE-06, tarea 1).
- Horario en `app_settings`, sin tabla nueva (opción más simple y reversible).
- Un solo interruptor para rutas, interfaz y reloj, para que nada lea 0053 antes de aplicarla (opción más simple y reversible).
- La tarea no lleva plazo y el texto de la semana va en el motivo: se crea en el momento del vencimiento y el equipo puede fijar plazo en Inbox (opción más simple).
- Las semanas anteriores sin revisar siguen abiertas; no hay recuperación de más de una semana (límite de `saleFollowupWindow`; la señal `olderWindowsNotExamined` no se usa).
- El cierre de la venta resuelve la tarea en el siguiente tick, como mucho 10 min después, y no en la ruta de cierre (opción más simple: no toca `routes/sales.js`).
- La instantánea es la cadena canónica de los nueve hitos; si cambian, la revisión queda obsoleta (foco `milestone_change_invalidates_snapshot` del plan).
- Permisos: sesión de personal como el resto de Sales; no se usan capacidades por caso porque no se guarda contenido C3 (alcance del plan: referencia mínima).
- Las gestiones externas no tienen `operation_id`; la interfaz desactiva el botón mientras guarda (opción más simple).
- El prototipo `server/sale-followup-store.js` y su SQL quedan sin usar. No se borran.

## No verificado

- Migración 0053 en D1 remoto, interruptor en Pages y en `hampton-jobs`, y un horario real del equipo. Nada se aplicó ni desplegó.
- El coste real en D1 por tick: hasta unas 150 sentencias por batch, como en el pase de colas existente.
- Con las tareas en Inbox, la ruta de notificaciones solo se comprobó en la prueba de Node.
