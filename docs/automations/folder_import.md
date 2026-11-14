# folder_import · crear una propiedad desde una carpeta de Drive

- **Id:** `folder_import`
- **Estado:** apagada — la cola existe en producción, pero sin cuenta de servicio de Drive ni Hermes de la fase 1b las casas se quedan en «Waiting for Hermes» según PUB-21.
- **Tarea dueña:** PUB-21; Hermes es de AUT-13.
- **Propósito:** que Hermes lea los documentos de la carpeta de una casa y proponga el texto y los datos de la ficha.
- **Disparador:** una persona añade el enlace de la carpeta en Properties Queue; Hermes pide el siguiente trabajo.
- **Entradas y clase de datos:** documentos de la carpeta salvo «Records» y las carpetas de fotos; clase exacta desconocida (pueden contener datos de propietarios).
- **Salidas y efectos:** una propuesta (`property.txt`, descripción, procedencia de cada dato, contradicciones); «Review» crea un borrador. Nunca publica.
- **Guardas humanas y modo:** una persona revisa la propuesta y pulsa «Approve and publish». Modo Draft/Approve/Auto: desconocido; no tiene fila en `operation_policies`.
- **Interruptor:** secretos `GOOGLE_SERVICE_ACCOUNT` y `HERMES_KEY`; sin el primero la cola responde que Drive no está configurado.
- **Coste y límite:** desconocido; coste en dinero `null`.
- **Código:** `server/drive.js`, `server/routes/queue.js`, `server/routes/hermes.js`, `migrations/0020_drive_imports.sql`
- **Pruebas que la cubren:** `tests/server/queue.test.mjs`, `tests/server/drive.test.mjs`
- **Criterio de hecho:** una carpeta real produce una propuesta que una persona revisa y publica; necesita la cuenta de servicio, PRE-32 y una clasificación de los documentos.
