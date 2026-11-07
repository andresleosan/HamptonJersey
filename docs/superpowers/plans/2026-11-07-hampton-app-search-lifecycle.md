# EST-09 Search Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Separar actividad y etapa comercial, con cierre humano, historial conservado y retención compatible.
**Architecture:** Migración aditiva 0024 sobre applicants; helper de actividad compartido. Transiciones autenticadas y versionadas, matching condicionado a estado/versión dentro de cada escritura y protección de contactos con cualquier búsqueda abierta. Reutilizar panel, eventos y reloj.
**Tech Stack:** React/Vite, JavaScript ESM, Cloudflare Pages/Workers y D1/SQLite; sin dependencias nuevas.
**Spec:** `docs/superpowers/specs/2026-11-07-hampton-app-search-lifecycle-design.md`.

## Global Constraints

- Trabajar en main del worktree existente; preservar checkout de diseño ajeno. Un commit de entrega con código, ESTADO y checklist; no push ni migración remota sin autorización del SHA.
- `search_state`: active, resolved, needs_review (solo migración de históricos ambiguos). Nuevas active; etapa comercial no altera estado. Resolved exige autor, fecha y motivo de 1–200 caracteres. Reapertura borra los campos de resolución actual y conserva el evento.
- POST `/admin/applicants/:id/search` consume `{state: 'active'|'resolved', reason, updated_at}`. 400 inválido; 409 versión/estado/duplicado incompatible; 404 desaparecido. Permisos y CSRF del router existente. Resolver también registros archivados históricos; activar exige restaurarlos primero.
- Archivo solo de resueltas; restaurar no reabre. El borrado manual existente de históricos archivados sigue su confirmación y excepciones; no se equipara a resolución.
- No duplicar una operación activa del mismo contacto. Históricos activos duplicados pasan a needs_review para decisión humana, sin borrar filas; índice único parcial aplica a las activas nuevas.
- Contacto con active o needs_review queda protegido de G2; revisión desde 11 meses de última actividad. Todas resueltas: plazo vigente 12 meses, cierre incluido. Sales/ofertas mantienen sus excepciones. Visitas/chat/correo mantienen reglas propias explícitas.
- Interfaz y API en inglés; documentación en español. No PII en localStorage, logs, capturas públicas ni repositorio.

## DESIGN.md: valores y aplicación

Panel vigente (DESIGN «Propuesta: una sola paleta», ya aplicada en admin/src/styles.css:1; la cabecera YAML de DESIGN es anterior): ink #151515, paper #ffffff, mist #f4f3f0, line #e3e0da, stone #6b665e, bronze #a56b3d (foco), bronze-dk #86542d (texto), ok #2f6b4f, err #a32020, warn #fff6e5. Tenor Sans display; Montserrat cuerpo 14px/1.5, h1 26px, h2 19px, labels 12px; pesos 400/500/600. Gutter 16px, ancho 1240px, pie 120px para actionbar; tarjetas 14px y padding24px, campos10px, botones999px/padding10px20px, compactos6px14px; celdas10px12px, gaps8–16px. Mantener `.btn`, `.card`, `.seg`, `.badge`, `.filters`, `.empty` y `.actionbar`. No fuentes, iconos, imágenes ni librerías nuevas.

Formulario de resolución dentro de ficha, sin modal ni nueva pantalla. Acción focal Resolve search, estado con texto, motivo con label y error enlazado, progreso/deshabilitado, recuperación de 409 y foco al error o al resumen tras éxito. Lista conserva tabla y tarjetas a <760px; filtros se envuelven. Verificar 1280/390 y zoom200%, foco2px/offset2px, contraste texto4.5:1 y controles3:1. Borde de campo #8f8a82, ya vigente en el CSS; conservar tokens existentes. Sin nuevas animaciones; conservar reduced-motion. Texto público de privacidad conserva tipografía web15px/1.65.

Rendimiento: índice parcial de actividad, consultas por contacto y fecha, datos agregados en lista; sin petición por fila ni nuevos terceros. Seguridad: SQL parametrizado, React escapa motivos, CSRF/permiso en servidor, campos de actor/fecha nunca del cliente, control de versión en batch. No alterar configuración del VPS.

## Skills aplicadas

- brainstorming/grill-me: decisión C01 resuelta por respuesta1; estados ambiguos e historial identificados.
- writing-plans/executing-plans: este contrato, ejecución propia y ledger; revisión independiente final.
- impeccable: estado y acción separados, feedback junto al formulario, teclado/foco y continuidad del formulario ante error.
- redesign-existing-projects: conservar ficha/listado y mejorar solo la decisión de cierre; design-taste-frontend no aplica porque no hay páginas nuevas.
- security-best-practices/frontend-security-coder: autenticación/CSRF, validación en servidor, escape de motivos, privacidad y carreras.
- antislop: panel operativo ENERGY1/RHYTHM1/MOTION1, sin estadísticas decorativas, copy concreto y componentes existentes; DESIGN prevalece.
- web-performance-optimization: índices y sin dependencias/peticiones por fila; comprobar build y recorrido.
- ponytail: helpers compartidos y estado sobre applicants; no segundo motor de tareas ni cambios anticipados para M06.

## Review Focus

1. Resolver mientras un recálculo/review ya leyó la ficha: no nuevas propuestas ni cambios históricos después del cierre.
2. Dos empleados activan/crean misma operación: solo una búsqueda activa; ningún evento huérfano.
3. Contacto con dos búsquedas: resolver una no libera G2 ni cierra avisos de la otra.
4. Históricos Lost/Completed/Archived o duplicados: revisión visible, sin inventar cierre humano ni perder Found.
5. Fallo tras guardar o 409: conservar el motivo escrito, explicar estado real y permitir recarga sin fingir éxito.

### Task 1: Estado, transiciones y concurrencia

**Files:** migrations/0024_search_lifecycle.sql, server/applicants.js, server/routes/applicants.js, server/match-store.js, server/routes/matches.js, server/routes/listings.js; tests/server/search-lifecycle.test.mjs y pruebas existentes afectadas.
**Interfaces:** search_state/resolved_at/resolved_by/resolution_reason; activeSql(alias), isActive(row); endpoint descrito arriba.
- [x] Añadir y ejecutar pruebas nuevas: etapas Completed/Lost siguen activas; resolución preserva Found y queda fuera de Review; reapertura humana; motivo/auth/409; carrera de matching/review; dos búsquedas/duplicados; migración ambigua. Esperado inicial: falla por contrato ausente.
- [x] Implementar migración, helper, endpoint, archivo versionado y guards de matching/review; revisar todos los consumidores.
- [x] Ejecutar pruebas focales, adaptar expectativas antiguas de cierre por Stage a estado explícito; esperado PASS.

### Task 2: Conservación y revisión

**Files:** server/retention.js, server/routes/applicants.js, server/routes/notifications.js, admin/src/App.jsx, tests/server/retention.test.mjs, tests/server/jobs.test.mjs y fixtures relacionados.
**Interfaces:** HAS_OPEN_SEARCH, RETENTION_REVIEW; detail.retention.search/review; list.retention_review; filtro retention_review=1 y count retention_review.
- [x] Probar protección activa/needs_review, estado compartido por contacto, 11/12 meses y revisión sin contacto ficticio; esperado inicial FAIL.
- [x] Adaptar excepción y mensajes/contadores derivados, conservar otros dominios; no alterar cron ni activar borrado.
- [x] Pruebas retención/jobs/notificaciones con datos cerrados explícitos para purga; esperado PASS.

### Task 3: Ficha, filtros y aviso público

**Files:** admin/src/ApplicantDetail.jsx, Applicants.jsx, ListingEditor.jsx, styles.css, site/apply.js, tests/e2e.cjs y nueva prueba de navegador del ciclo si ayuda.
- [x] Mostrar estado separado, filtro Active/Resolved/Needs review, lista Review retention y copy de protección; nota al usar Stage.
- [x] Implementar formulario de cierre/reapertura con motivo, control de versión, error/recarga, teclado/foco y bloqueo durante cambios sin guardar. Actualizar Timeline y Matches de solo lectura.
- [x] Actualizar privacidad distinguiendo contacto protegido de plazos propios de visitas/chat/correo.
- [x] Build y recorrido local completo a1280/390: validación, éxito/reapertura, vacío/error/409, teclado, foco, zoom, consola/red; corregir hallazgos.

### Task 4: Integración y entrega

- [x] npm test, npm run build, npm run check:release; e2e con fixture local según cabecera. No usar credenciales de producción ni modificar controles para pruebas.
- [x] Revisión independiente de todo el cambio según executing-plans; corregir importantes y repetir pruebas afectadas.
- [x] Actualizar ESTADO/checklist/reconciliación y ledger con resultados reales, analizar siguiente tarea y rúbrica.
- [x] Commit inglés con archivos concretos, excluyendo privados/auditoría; entregar SHA exacto, pruebas, migración0024 pendiente y pregunta de publicación. Actualizar relevo privado.

Validación: los pasos de ejecución están realizados; esto no declara publicación ni e2e general aprobado. El recorrido general se detuvo en la galería pública, tests/e2e.cjs:130; EST-09 sí pasa su e2e focal y MCP. Detalle y correcciones de revisión en el ledger.
