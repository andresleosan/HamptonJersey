# Plan: Last contact, filtros y Gone quiet (spec 2026-11-04)

1. Migración `0019_last_contact.sql`: columna `contacts.last_contact_at` y relleno (L2) → prueba: `schema.test.mjs` / la migración corre en `makeDb`.
2. Servidor: `contacted()` en `server/routes/applicants.js` (activity + contact) para alta, nueva búsqueda, Log conversation y oferta; `touchByViewing` también pone `last_contact_at`; la web (alta y envío repetido) también → prueba que falla primero en `tests/server/last-contact.test.mjs`, incluida una edición que NO la cambia.
3. Lista: `last_contact_at`, `gone_quiet` y filtros `budget`, `parish`, `source`, `contact=quiet`, validados → misma prueba.
4. Panel `admin/src/Applicants.jsx`: columna y cuatro filtros → npm test, build, recorrido 1280 y 390.
5. Docs: checklist SAP-07 y EST-11, ESTADO.md; e2e; revisión independiente; commit; migración remota por Luis antes del push.
