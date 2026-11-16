# PRE-12 · Registro interno de solicitudes de privacidad (16-nov-2026)

Ejecuta el tramo manual del plan vigente ([plan](../../../superpowers/plans/2026-11-08-l1b-privacy-requests.md), [diseño](../../../superpowers/specs/2026-11-08-l1b-privacy-requests-design.md)): Task 1 (recepción, vínculo, asignación, identidad) y la parte de copia revisada de Task 2. Sin correo saliente (AUT-17 apagado), sin portal y sin aviso previo a la limpieza (Task 3 toca `server/jobs.js`, fuera de este encargo).

## Qué se construye

- Migración aditiva `0101_privacy_requests.sql`: `privacy_requests` (tipo, recepción, vía, plazo legal introducido por el equipo, referencia, contacto opcional con `ON DELETE SET NULL`, responsable, identidad verificada por quién/cómo/cuándo, revisión de copia con huella, estado y resultado, revisión CAS) y `privacy_request_audit` (solo ids, acción, actor, revisión y hora).
- `server/privacy-requests.js` con rutas `/admin/privacy-requests…` (todas `requiresAdmin`; escrituras con `sameOrigin` del enrutador) montadas solo con `PRE12_REQUESTS_READY=1` (apagado por defecto en código; `wrangler.toml` no se toca).
- Holds: los mismos que ya respeta la limpieza (`NO_SALE`, `HAS_OPEN_OFFER`, `HAS_OPEN_SEARCH` de `server/retention.js`), leídos en vivo. Los alquileres no están vinculados a contactos: se avisa de revisarlos a mano, sin inferir vínculos.
- Supresión: solo una lista de lo que se borraría y lo retenido por hold. Ningún DELETE; el borrado sigue siendo el Delete existente del solicitante archivado.
- Copia de acceso/portabilidad: columnas explícitas (contacto, búsquedas, ofertas, visitas con su email/teléfono, preferencias de marketing), manifiesto de lo no incluido (notas internas, correos, chats, eventos). Vista previa → «revisada» con huella SHA-256 y quién → descarga JSON/CSV solo si la huella sigue vigente (si los datos cambian, 409 y nueva revisión).
- Panel `#/privacy` (menú Settings cuando el contador `privacy` existe) en inglés con el estilo actual.

## Plazo legal

El repositorio no documenta ningún plazo de respuesta de la Data Protection (Jersey) Law 2018 (aviso de privacidad, arquitectura y planes revisados). No se inventa: el equipo introduce la fecha límite de cada solicitud y la app solo la muestra.

## Pruebas

RED primero en `tests/server/privacy-requests.test.mjs` (apagado = 404 y contadores iguales; 401 sin sesión; alta/CAS/409; identidad exige contacto; supresión sin DELETE; copia revisada y 409 al cambiar datos; nada personal en la auditoría). E2E `tests/pre12-requests.e2e.cjs` a 1280 y 390.

## Fuera de este tramo (queda en `falta`)

Aviso previo a la limpieza y Q05 (necesitan `server/jobs.js` y AUT-17), consulta de holds de privacidad por la limpieza ordinaria, entrada directa desde un correo del panel, entrega por correo, plazos de conservación de alquiler/venta (PRE-33) y la purga de `listing_withdrawals` al borrar una ficha (el evento `listing.deleted` lo escribe el trigger de 0029 con `related` limitado a ids; registrar la purga exige ampliar ese contrato).
