# PRE-14 · Cobertura de escritores

Registro versionado de todas las entradas que pueden escribir en D1 `hampton` o en R2 `hampton-media` (plan PRE-14, Task 1). Cada una debe correr dentro de `withApplicationWrite` (`server/backup-write-gate.js`) o quedar suspendida por procedimiento durante la ventana del domingo. **Mientras una fila no esté «cubierta», `BACKUP_READY` sigue en `"0"`**; `tests/server/backup-gate.test.mjs` lo comprueba y exige que toda entrada de `functions/` y del reloj figure aquí.

Estados: `pendiente` (sin envolver), `cubierta` (envuelta y con prueba propia), `suspensión` (fuera de la aplicación: se para por procedimiento verificado antes de activar).

| Entrada | Qué escribe | Estado |
| --- | --- | --- |
| `functions/api/[[path]].js` → `server/api.js` | Todas las rutas `/api`, incluida la rama Hermes, escrituras desde GET (aperturas QR, lecturas que registran) y `waitUntil` (Drive, avisos). Envolver todo salvo una lista de lecturas demostradas; no fiarse de `method=GET`. | pendiente |
| `functions/media/[id].js` → `server/media.js` | Solo lectura de R2 hoy; confirmar con prueba antes de excluirla. | pendiente |
| `functions/p/[id].js` → `server/seo.js` | Solo lectura hoy; confirmar con prueba. | pendiente |
| `functions/properties.js` → `server/seo.js` | Solo lectura hoy; confirmar con prueba. | pendiente |
| `functions/sitemap.xml.js` → `server/seo.js` | Solo lectura hoy; confirmar con prueba. | pendiente |
| `functions/robots.txt.js` → `server/seo.js` | Sin datos. | pendiente |
| `server/jobs.js` `scheduled` | Reloj, retención (G2 y demanda), avisos, llamadas AGE-08, informes, seguimiento de ventas, cierres de alquiler, correo saliente. Durante el mantenimiento solo el control exterior de la copia; los pasos de negocio no escriben ni envían. | pendiente |
| `server/jobs.js` `email` → `server/email-inbound.js` | Correo entrante. Con la compuerta cerrada va al spool cifrado (Task 5, `stageInboundDuringBackup`). | pendiente |
| `scripts/import_hampton.py` | Importación a D1 desde fuera de la aplicación. | suspensión |
| `scripts/import_agencies.py` | Importación a D1 desde fuera de la aplicación. | suspensión |
| `scripts/upload_r2.sh` | Subida directa a R2. | suspensión |
| `wrangler d1 execute` / `migrations apply`, consola de Cloudflare y despliegues | Cambios manuales u operativos. | suspensión |

Las filas en `suspensión` necesitan el acuerdo operativo registrado (quién no ejecuta qué durante la ventana) antes de activar; sin él, `BACKUP_READY` sigue en `"0"`.
