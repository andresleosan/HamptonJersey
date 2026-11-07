# REG-11 Registration Implementation Plan

> Ejecución: `executing-plans`, con pruebas de comportamiento antes de cada implementación.

**Goal:** Registrar búsquedas residenciales y comerciales con respuestas explícitas y presupuestos independientes.

**Architecture:** Mantener el contacto y una búsqueda por operación y categoría, con migración aditiva y unicidad transaccional. La validación compartida alimenta web y panel; el motor residencial excluye comercial hasta M04.

**Tech Stack:** JavaScript ESM, React, Cloudflare D1/SQLite, Node test y Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-reg-11-registration-design.md`.

## Restricciones y diseño

- La web y el panel mantienen sus componentes existentes. `DESIGN.md`, Colors y Components: texto ink `#151515`, paper `#ffffff`, campos `#fbfaf8`, radio web 12px, botón píldora; el panel usa sus tokens CSS vigentes y tarjetas de 14px con padding 24px. La propuesta de paleta unificada no se presenta como existente en la web.
- Typography: Tenor Sans en títulos, Montserrat en cuerpo; web 15px/1.65, panel 14px/1.5. El asistente propone inputs de 16px. Responsive: comprobar 1280/390; apilado a 760px según propuesta. Labels nativos, errores asociados, foco visible, teclado y zoom 200%; movimiento reducido. No introducir imágenes ni fuentes adicionales.
- Seguridad: validar en servidor, conservar protección Turnstile y privacidad de duplicados, no registrar datos innecesarios ni enviar clientes a Hermes. Rendimiento: reutilizar componentes y consultas indexadas, sin dependencias nuevas.
- `impeccable` y `antislop`: conservar lenguaje visual y estados reales; `frontend-security-coder` y `security-best-practices`: validar entradas y escapar salida; `web-performance-optimization`: evitar librerías y peticiones adicionales; `ponytail`: reutilizar patrones existentes. `design-taste-frontend` y `redesign-existing-projects` no aplican: no se crea página ni se rediseña una pantalla.

## Fases y criterios

- [x] Esquema: `migrations/0025_registration_categories.sql`; `tests/server/registration-categories.test.mjs` prueba la migración con registros anteriores y la unicidad por contacto, operación efectiva y categoría.
- [x] Validación: `server/applicants.js` y `tests/server/applicants-validate.test.mjs` cubren categorías, traspaso, rangos, unidades, importes y periodo, unknown frente a cero, hogar e idioma. `search_operation` conserva la operación traspaso junto al valor compatible con el CHECK anterior; nunca se usa como alquiler para deduplicar.
- [x] Rutas: `server/routes/public.js`, `applicants.js`, `notifications.js` y sus pruebas cubren alta atómica de dos operaciones, privacidad y revisión de duplicados, edición versionada y límite por categoría. Las respuestas de contacto repetido no revelan que exista.
- [x] Matching: `server/match-store.js`, `server/matching.js` y sus pruebas excluyen búsquedas comerciales de ambos recálculos y respetan el máximo de dormitorios; `routes/insights.js` excluye comercial de la demanda residencial. El panel declara el matching comercial pendiente de M04.
- [x] Interfaz: `site/apply.js`, `admin/src/ApplicantFields.jsx`, `NewApplicant.jsx`, `ApplicantDetail.jsx` y `Applicants.jsx` ofrecen modalidad y datos condicionales; dos operaciones web guardan presupuestos distintos; el hogar distingue número conocido, desconocido y no aplicable. La edición de la categoría exige una búsqueda separada para conservar historial.
- [ ] Validación: `npm test`, `npm run build`, `npm run check:release`, e2e y Playwright MCP local a 1280/390; revisión y corrección. Registrar resultados concretos en ledger.
- [ ] Actualizar ESTADO, checklist, reconciliación y relevo, analizar la siguiente tarea y crear commit local. Sin migrar ni publicar sin aprobación posterior del SHA.

## Riesgos de revisión

Contacto repetido con email y teléfono de personas distintas; creación simultánea de ambas operaciones frente a duplicados; cambios concurrentes y reapertura; importes desconocidos o cero y periodos distintos; una actualización de listing que recalcula búsquedas comerciales. Cada caso requiere una prueba real antes de dar la fase por aprobada.
