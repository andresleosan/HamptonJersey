# folder_import · crear una propiedad desde una carpeta de Drive

- **Id:** `folder_import`
- **Estado:** activa — Luis volvió a encender `PUB21_DRIVE_READY` el 16-nov-2026 (`wrangler.toml` lo fija a `1`; producción no se comprobó en esta entrega). Antes estuvo apagada desde el 14-nov por el plan maestro.
- **Tarea dueña:** PUB-21; Hermes es de AUT-13.
- **Propósito:** que Hermes lea los documentos de la carpeta de una casa y proponga el texto y los datos de la ficha.
- **Disparador:** una persona añade el enlace de la carpeta en Properties Queue; Hermes pide el siguiente trabajo.
- **Entradas y clase de datos:** documentos de la carpeta salvo «Records», las carpetas de fotos y, desde el 25-nov-2026, los archivos y subcarpetas cuyo nombre suena a documento personal o financiero (contratos y arrendamientos, pasaporte, DNI o identidad, carnet de conducir, banco o extractos, nóminas o salario, referencias, impuestos, facturas y recibos; inglés y español, sin mayúsculas ni acentos; lista y motivo en `server/drive.js`). De esos solo se cuenta cuántos quedaron fuera, sin sus nombres, en los avisos «Check:» de la propuesta. El filtro mira solo el nombre: un pasaporte guardado como «scan001.pdf» sí llega a Hermes. Clase exacta del resto desconocida (pueden contener datos de propietarios).
- **Salidas y efectos:** una propuesta (`property.txt`, descripción, procedencia de cada dato, contradicciones); «Review» crea un borrador. Nunca publica.
- **Guardas humanas y modo:** una persona revisa la propuesta y pulsa «Approve and publish». Modo Draft/Approve/Auto: desconocido; no tiene fila en `operation_policies`.
- **Interruptor:** `PUB21_DRIVE_READY` (ausente o distinto de `1`: apagada), además de los secretos `GOOGLE_SERVICE_ACCOUNT` y `HERMES_KEY`; sin el primero la cola responde que Drive no está configurado.
- **Coste y límite:** desconocido; coste en dinero `null`.
- **Código:** `server/drive.js`, `server/routes/queue.js`, `server/routes/hermes.js`, `migrations/0020_drive_imports.sql`
- **Pruebas que la cubren:** `tests/server/queue.test.mjs`, `tests/server/drive.test.mjs`
- **Criterio de hecho:** una carpeta real produce una propuesta que una persona revisa y publica; necesita la cuenta de servicio, PRE-32 y una clasificación de los documentos.
