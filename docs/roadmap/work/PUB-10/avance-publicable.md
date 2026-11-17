# PUB-10 · avance parcial

## 17-nov · construida y apagada

- **Migración 0118, aditiva** (`migrations/0118_owner_requests.sql`): tablas `owner_requests` y `owner_request_receipts` (borrado en cascada), un índice y tres triggers. No toca `events` ni `notifications`: el evento es una entidad `collection` con id `owner-request:<id>` (como `backups:*`) y la tarea no lleva `target_kind`. No instala la fila `owner_enquiries`. No se ha aplicado en remoto.
- **Retirada** la propuesta de reconstrucción (`server/proposed-schema/owner-requests*.sql`) y sus pruebas: reescribía tablas con datos y ya había deriva con migraciones posteriores.
- **Supresión**: Staff borra una solicitud desde su detalle. Se borra el recibo, la tarea de Inbox queda cerrada y sin enlace, y un evento `owner.erased` guarda quién lo hizo, sin datos personales.
- **Conciliación**: el detalle enlaza las demás solicitudes con el mismo correo o teléfono. El estado (New, Contacted, Closed) solo cambia con una acción explícita y queda como evento `owner.status_changed`.
- **Interruptor**: `OWNER_REQUESTS_READY = "0"` en `wrangler.toml`. Ya no hay un cierre fijo en el código: abren la recepción ese interruptor y la fila `owner_enquiries` con la versión del aviso publicado. Solo lo enciende Luis.

## Queda para encender

1. Aplicar 0118 en remoto con el procedimiento de la skill.
2. Aviso de privacidad para propietarios con el número JOIC real (PRE-09, PRE-03). No se redactó texto legal; el formulario enlaza a `#/privacy`.
3. Plazo de conservación decidido por Hampton. Mientras tanto, el borrado es manual.
4. Luis crea la fila `owner_enquiries = {"enabled":true,"privacy_version":"<versión del aviso>"}` y pone `OWNER_REQUESTS_READY = "1"`.

Para PRE-12 (no es de esta tarea): la copia de una petición de acceso todavía no incluye `owner_requests`.

## Pruebas

Pruebas focales con datos ficticios: interruptor apagado o sin fila → 503, encendido con fila → 201 y repetición 200, origen cruzado 403, 20 envíos simultáneos con un solo recibo, un cambio de aviso durante Turnstile no deja efectos, un fallo del trigger revierte todo, estado y borrado con 401, 403, 404 y 409, y sin datos personales en eventos. D1 local (Miniflare) con todas las migraciones. Ninguna prueba acredita la recepción en producción.
