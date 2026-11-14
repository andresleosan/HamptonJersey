# ADM-06 · Construcción local · 14-nov-2026

## Qué se construyó

- Un contrato puede nacer de una ficha en Let agreed y de un aplicante. El empleado elige la ficha y el aplicante en la ficha de la vivienda. Nada se une por dirección ni por nombre.
- Vista previa sin efectos (`POST /api/admin/tenancy-origins/preview`): muestra vivienda, ficha, aplicante, términos sugeridos y referencia del contrato firmado. No escribe nada.
- Confirmación (`POST /api/admin/tenancy-origins/commit`): un solo batch de D1. Comprueba que la ficha y el aplicante siguen en la versión de la vista previa y ejecuta las mismas sentencias que New tenancy. Guarda el origen y, si se da, la referencia del contrato firmado.
- Idempotente por `operation_id`: repetir la confirmación devuelve el mismo contrato (`replayed: true`), con una sola referencia HE-T.
- Versión vieja de ficha o aplicante: 409 sin escribir. Un contrato activo en la vivienda bloquea otro (409). Sin vivienda elegida: 400; una ficha nunca se convierte en vivienda gestionada.
- New tenancy manual no cambia. Su batch se extrajo a `tenancyPlan` en `server/routes/rent.js` y lo usan los dos caminos. collect_from, opening_balance, HE-T y cobros quedan iguales (prueba que compara cobros y campos).
- Contrato firmado: referencia externa revisada (`ExternalEvidence`: evidence_ref ≤120, reviewed_at y reviewed_by del servidor, revision). Una fecha sola no cuenta como contrato firmado. Con expectedRevision; 409 si está viejo.
- Inventario de entrada versionado: estancias con observaciones, lecturas de contador con unidad explícita (kWh, m3, ft3, litres) y hasta 20 referencias revisadas. Guardado con expectedRevision (CAS); 409 si está viejo.
- La app no recibe, guarda, abre ni descarga archivos. No hay rutas de subida o descarga. Las referencias no entran en el historial general (solo número de revisión y recuentos).
- UI en la ficha de la vivienda: botón «From Let agreed», selección, vista previa y confirmación reutilizando el formulario de New tenancy. En cada contrato: origen, contrato firmado e inventario de entrada, con estados de carga, vacío, validación, error y conflicto.

## Archivos

- `migrations/0056_tenancy_origins.sql` (solo CREATE TABLE/INDEX; no depende de 0043/0045/0046/0049/0050/0051).
- `server/tenancy-origins.js`, `server/routes/tenancy-origins.js`, `admin/src/RentalOrigin.jsx`.
- Cambios pequeños: `server/api.js` (2 líneas), `server/routes/rent.js` (extracción de `tenancyPlan`, export de `detail`), `admin/src/RentalDialogs.jsx` (props opcionales de NewTenancy), `admin/src/RentalDetail.jsx`, `tests/run-e2e.cjs`.

## Decisiones y fuente

- Interruptor `ADM06_TENANCY_ORIGIN_READY === '1'`: rutas montadas solo con él; la UI pregunta `GET /api/admin/tenancy-origins` y se oculta con 404. No se tocó wrangler.toml (instrucción del orquestador).
- Autorización: la sesión de staff, igual que New tenancy. Sin roles ni capacidades nuevas; no depende de 0046 (instrucción del orquestador).
- Sin subida de archivos ni R2: referencias externas opacas (spec TP-05 líneas 7-9, que prevalece sobre el plan).
- `listing_id` y `applicant_id` del origen sin clave foránea: así la retención de aplicantes o un borrado o reconstrucción de fichas no se bloquea ni reescribe el origen. Decisión propia, reversible.
- La confirmación no cambia la ficha (sigue Let agreed, sin publicar) ni el aplicante. Pasar a Let queda en el flujo existente. Decisión propia, la más simple.
- La referencia se valida como texto de 1 a 120 caracteres sin caracteres de control; no se rechazan URLs, pero nunca se abren ni se enlazan (se muestran como texto). Decisión propia, reversible.
- `inventory_in_on` (fecha del Check-in report) no se modifica al guardar el inventario. Decisión propia, la más simple.
- Una referencia ya revisada conserva su revisión al volver a guardar; una nueva se revisa con el actor y la hora del servidor.

## Pruebas

- `node --test tests/server/adm-06-1.test.mjs tests/server/adm-06-2.test.mjs`: 15/15 pasan (antes de implementar fallaban por 404 y módulo ausente).
- `node --test tests/server/adm-06-origin-d1.test.mjs` (D1 local con Miniflare): 1/1 pasa. Cubre rollback total ante versión vieja y doble confirmación simultánea.
- Regresiones de alquileres (`tenancies`, `rentals`, `rentals-rules`): 37/37 pasan.
- `npm test`: 2348/2350 pasan. Fallan dos pruebas D1 de otras tareas (`est-01-progress-d1`, `msg-02-semantic-d1`) por «fetch failed» con la máquina muy cargada (carga 18-33 en 16 núcleos, otros agentes en paralelo). Repetidas solas: 2/2 pasan. La parte Python (29 pruebas) pasa aparte.
- `npm run build`: pasa. `npm run check:release`: pasa («No TO CONFIRM markers»).
- `E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/adm-06-tenancy-origin.e2e.cjs npm run test:e2e:isolated`: pasa a 1280 y 390 px (selección por teclado, foco en el primer error, vista previa, confirmación, contrato firmado, inventario con unidad, conflicto 409 que conserva lo escrito, error con reintento, zoom 200 % sin desbordar).

## Qué no se pudo verificar

- Nada en producción ni en D1 remoto: la migración 0056 no está aplicada y el interruptor está apagado.
- El navegador probado fue Chromium del contenedor aislado; no se probó WebKit ni lector de pantalla real.
- Que una referencia corresponda de verdad a un contrato firmado: lo declara el empleado; la app no lo comprueba.
