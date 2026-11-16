# REG-15 · «Save this search» para visitantes · plan de una página

Construido **apagado** (`REG15_ALERTS_READY="0"` en los dos `wrangler.toml`). Apagado: ninguna ruta nueva existe (404), el reloj no hace nada nuevo, `/api/config` dice `savedSearches: false`, la web no muestra el enlace y nada lee ni escribe la tabla nueva.

## Alcance

1. Un visitante deja **solo email y criterios** (operación, presupuesto máximo, dormitorios mínimos, parroquias, tipos) y marca un consentimiento explícito. Fuente: arquitectura `2026-10-23-arquitectura-hampton-app.md:222`.
2. **Doble opt-in**: recibe un correo con un enlace; hasta confirmarlo no hay contacto, ni consentimiento, ni alertas.
3. Al confirmar se crea (o se reutiliza por email) un **contacto** y se registra el permiso `property_alerts` por `email` con la versión del aviso: el visitante pasa a ser un contacto que el equipo ve («convierte visitantes en aplicantes», arquitectura:222). Un aviso en la bandeja (`new_applicant`, sin acción obligatoria) lo dice.
4. El reloj cruza, una vez al día por búsqueda, las propiedades publicadas nuevas o cambiadas con cada búsqueda activa y deja **un correo resumen** en la cola de envío.
5. Cada correo lleva un enlace de baja: registra la oposición `property_alerts`/`email` y borra las búsquedas del contacto.

Fuera de alcance: panel propio para estas búsquedas (el contacto y su preferencia ya se ven en el panel), formulario dentro de la ficha de cada propiedad, exportación en solicitudes de acceso PRE-12 (va a MEJORAS).

## Datos que se guardan (migración aditiva `0107_saved_searches.sql`)

| Campo | Por qué | Hasta cuándo |
|---|---|---|
| `email` | enviar la confirmación y crear el contacto | se borra al confirmar (queda solo en `contacts`) o con la fila pendiente a los 7 días |
| `email_hash` (SHA-256) | límite por dirección y lista de supresión, como `outbound.recipient_hash` | con la fila |
| `criteria` (JSON, ≤2000 caracteres) | el cruce | con la fila |
| `notice_version` | prueba del aviso aceptado | con la fila y en `marketing_preferences` |
| `confirm_hash` | el enlace de confirmación (solo el hash; el token va en el correo) | se borra al confirmar |
| `unsubscribe_token` | el enlace de baja de cada alerta (el reloj lo escribe en el correo, por eso no se guarda con hash) | con la fila |
| `contact_id`, `alerted_through` | a quién y desde cuándo se alerta | con la fila |

Retención: pendiente sin confirmar, 7 días (lo borra el reloj); activa, mientras exista el contacto: la retención G2 borra contactos sin actividad en 12 meses (`server/retention.js:45`) y la tabla se borra en cascada; la baja borra la fila al momento. Fuente de la regla de 7 días: ninguna; opción simple y reversible (skill §4.5).

## Consentimiento y aviso

- Consentimiento solo desde el formulario web con versión del aviso: la regla de PRE-10 (`server/communication-preferences.js:67`, `migrations/0096_marketing_preferences.sql:18`). Se reutiliza `setCommunicationPreference` para conceder (al confirmar) y para oponerse (baja), con `evidence_ref = saved_search:<id>`.
- La versión del aviso y la aprobación del envío salen de una fila `app_settings.saved_searches` = `{enabled, privacy_version, approved_by, approved_at}`, el mismo patrón que `owner_enquiries` de PUB-10 (`server/owner-requests.js:21`). Sin esa fila, aunque el interruptor esté encendido, el formulario dice que no está disponible y el reloj no prepara nada. El aviso de privacidad debe mencionar estas alertas antes (PRE-09).
- Requiere PRE-10 encendido (`PRE10_PURPOSE_READY=1`): con él apagado nada de REG-15 se monta.

## Envío: el canal existente, sin remitente nuevo

- Todo pasa por `outbound` y `dispatchEmail` (`server/email.js`), que no envía nada mientras `EMAIL_SERVICE_READY` no sea `true` (AUT-17).
- Confirmación: plantilla `saved_search_confirm`, añadida a la lista de transaccionales (`server/email.js:82`, que dice que una nueva transaccional se añade ahí).
- Alertas: plantilla `marketing.property_alerts`, `entity_id` = contacto. El canal ya exige, en cada reclamación y justo antes de enviar, que el destinatario sea el email actual del contacto y que su permiso `property_alerts`/`email` siga concedido (`server/email.js:83-87`).
- Aprobación: la fila `queued` lleva `approved_by/approved_at` de la persona que abrió el formulario en `app_settings.saved_searches`: una aprobación permanente de dos plantillas fijas, como el resumen diario del equipo (`server/email.js:47-69`). Excepción explícita al comentario `server/email.js:72` («nunca una ruta pública»), anotada allí: la confirmación es la única fila que una ruta pública pone en cola, tras Turnstile y los límites. El plan maestro pide revisión humana individual de cada correo de negocio (`2026-11-10-plan-maestro-vigente.md:19`, alquileres y ventas); estas alertas son promocionales con plantilla fija, y la decisión de Luis al encender incluye aceptar esta aprobación permanente.
- Sin datos personales en registros: los eventos guardan id de búsqueda y operación; `console.error` sin direcciones.

## Protecciones del formulario público (reutilizadas)

- Turnstile tras la validación barata, como `createApplicant` y `createViewing` (`server/routes/public.js:156`, `:230`).
- Tope diario en SQL, como `countStat` (`server/routes/public.js:183-197`): 200 búsquedas nuevas por día y 3 por dirección. Cuando un tope corta, la respuesta es la misma (202), así no se revela si una dirección ya está.
- La lista de supresión de correo se respeta al poner en cola (`email_suppressions`), igual que el resumen del equipo.
- Confirmar y darse de baja: el enlace abre una página sin JavaScript con un botón (POST); un GET nunca cambia nada (los escáneres de correo abren enlaces).

## Cruce: el mismo motor

`evaluate()` de `server/matching.js:179`, con la búsqueda traducida a la forma de un aplicante residencial sin prioridades. Alerta solo si `pass` y ninguna comprobación sale `fails` (lo desconocido no excluye: `server/matching.js:6`). Candidatas: las publicadas que la web muestra (`readLive`, con su revisión de dirección) y que el cruce ofrece (`CANDIDATES_SQL` + EST-15). Nuevas o cambiadas = `listings.updated_at` posterior a `alerted_through`; un correo por búsqueda y día (clave `dedupe_key`), hasta 10 casas, 50 búsquedas por tic.

## Web pública

Página lateral `#/alerts` (`site/alerts.js`, mismo patrón que `site/owner.js`) y un enlace «Email me new homes» junto a «Register your search» solo cuando `/api/config` dice `savedSearches: true`.

## Para encender (Luis)

Aplicar `0107`; decidir abrir un formulario público que recoge emails (CONTINUIDAD «No autorizado», línea 31); AUT-17 activo; aviso de privacidad (PRE-09) que mencione las alertas; escribir `app_settings.saved_searches`; poner `REG15_ALERTS_READY="1"` en los dos `wrangler.toml`.
