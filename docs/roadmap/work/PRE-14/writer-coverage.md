# PRE-14 · Cobertura de escritores

Registro versionado de todas las entradas que pueden escribir en D1 `hampton` o en R2 `hampton-media` (plan PRE-14, Task 1). Cada una debe correr dentro de `withApplicationWrite` (`server/backup-write-gate.js`) o quedar suspendida por procedimiento durante la ventana del domingo. **Mientras una fila no esté «cubierta», `BACKUP_READY` sigue en `"0"`**; `tests/server/backup-gate.test.mjs` lo comprueba y exige que toda entrada de `functions/` y del reloj figure aquí.

Estados: `pendiente` (sin envolver), `cubierta` (envuelta y con prueba propia), `excluida` (solo lee; una prueba lo demuestra con D1 que solo admite SELECT y R2 que solo admite get/head), `suspensión` (fuera de la aplicación: se para por procedimiento verificado antes de activar). Pruebas: `tests/server/backup-writers.test.mjs`.

| Entrada | Qué escribe | Estado |
| --- | --- | --- |
| `functions/api/[[path]].js` → `server/api.js` | Todas las rutas `/api`, incluida la rama Hermes, escrituras desde GET (aperturas QR, lecturas que registran) y `waitUntil` (Drive, avisos). Envuelta entera en `handleApi` (un permiso `api:<familia>` por petición, sin lista de lecturas: también los GET); el permiso dura hasta acabar los `waitUntil`; con la compuerta cerrada, 503 `backup_maintenance` y Retry-After 60 sin leer el cuerpo. | cubierta |
| `functions/media/[id].js` → `server/media.js` | Solo lee D1 y R2 (probado). | excluida |
| `functions/p/[id].js` → `server/seo.js` | Solo lee (probado, también con `?src=qr`: la apertura QR se cuenta por `/api`). | excluida |
| `functions/properties.js` → `server/seo.js` | Sin D1 (probado). | excluida |
| `functions/rental-application.js` | Sin D1 ni R2: según `ADM18_APPLICATION_READY` sirve la página del aplicante (ADM-18) o la del sitio (probado en `tests/adm-18-application-page.test.js`). | excluida |
| `functions/sitemap.xml.js` → `server/seo.js` | Solo lee (probado). | excluida |
| `functions/robots.txt.js` → `server/seo.js` | Sin datos (probado). | excluida |
| `functions/admin/_middleware.js` → `server/access.js` | Sin D1 ni R2: solo valida la aserción de Access (PRE-06) y sirve los archivos del panel (probado). | excluida |
| `server/jobs.js` `scheduled` | Reloj, retención (G2 y demanda), avisos, llamadas AGE-08, informes, seguimiento de ventas, cierres de alquiler, correo saliente. Todo el tick en un permiso `jobs:scheduled`; con la compuerta cerrada no escribe ni envía (el siguiente tick recupera). Después, fuera del permiso y de `gated()`, `backupStartPass` (`server/backup-start.js`, Task 4) solo escribe el control de la copia (`backup_runs`) e inicia el Workflow; una semana perdida escribe su aviso dentro de un permiso `backup:missed`. | cubierta |
| `server/jobs.js` `email` → `server/email-inbound.js` | Correo entrante. En un permiso `jobs:email`. Con la compuerta cerrada, hasta Task 5, se rechaza con `setReject` y motivo visible; el spool cifrado lo sustituye (Task 5, `stageInboundDuringBackup`). | cubierta |
| `backups/index.js` → `server/backup-workflow.js` | Worker `hampton-backups` (Task 4, sin desplegar). Lee D1 y `hampton-media`; escribe el control (`backup_runs`, `backup_write_gate`, que son la propia compuerta) y el bucket privado `hampton-backups`, nunca `hampton-media`. El aviso del Inbox (`events`, `notifications`) va en un permiso `backup:notice` (`server/backup-notices.js`). | cubierta |
| `scripts/import_hampton.py` | Importación a D1 desde fuera de la aplicación. | suspensión |
| `scripts/import_agencies.py` | Importación a D1 desde fuera de la aplicación. | suspensión |
| `scripts/upload_r2.sh` | Subida directa a R2. | suspensión |
| `wrangler d1 execute` / `migrations apply`, consola de Cloudflare y despliegues | Cambios manuales u operativos. | suspensión |

Las filas en `suspensión` necesitan el acuerdo operativo registrado (quién no ejecuta qué durante la ventana) antes de activar; sin él, `BACKUP_READY` sigue en `"0"`.
