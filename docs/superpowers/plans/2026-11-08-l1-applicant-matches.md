# SAP-03 applicant match groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta entrega autoriza solo planificación; no iniciar implementación. La coordinación conserva la revisión independiente final.

**Goal:** Mostrar tarjetas y totales de vivienda por hechos vigentes de EST13.

**Architecture:** Una consulta parametrizada con identidad canónica alimenta filtros inclusivos en la ficha; acciones y evaluación existentes se preservan.

**Tech Stack:** React19, JavaScript ES modules, Cloudflare Pages/Workers y D1/SQLite; pruebas Node y harness e2e existentes.

**Spec:** [diseño](../specs/2026-11-08-l1-applicant-matches-design.md).

## Global Constraints

- Base comprobada main `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. Solo documentos ahora; construir exige alcance/reserva build y aprobación del diseño según el flujo vigente.
- No cambiar estados del catálogo durante la planificación; las dependencias indicadas son las vigentes, no nuevas filas del catálogo.
- Toda API privada usa rutas autenticadas existentes (flag `true`) y validación servidor; no resolver autorización en el navegador.
- Una lectura fallida no equivale a cero resultados; escrituras obsoletas responden409, desaparecidas404, inválidas400, sin repetir efectos por reintento ciego.
- **UI vigente comprobada, no la cabecera antigua de DESIGN.md:** `admin/src/styles.css`: ink `#151515`, stone `#6b665e`, mist `#f4f3f0`, line `#e3e0da`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, paper `#ffffff`, warn-bg `#fff6e5`, field-line `#8f8a82`. Montserrat/system-ui 14px/1.5; Tenor Sans/Georgia H1 26px, H2 19px, peso400; labels12px; botones600 12px tracking `.08em`, padding10px20px, radio999px, hoverbronze-dk, disabled opacity`.45`. `.card` padding24px/radio14px/borde1px line/sombra `0 1px 2px rgba(20,20,20,.04),0 12px 32px -18px rgba(20,20,20,.22)`; campos fondo`#fbfaf8`, borde field-line, radio10px, padding9px12px. `.page`1240px padding24px16px120px; `.seg` gap2px/padding3px, botones7px16px; `.inline` gap12px; `.badge`11px/padding3px10px; miniatura72×54/radio8px. Foco2px bronze offset2px. Tabla apila a760px; editor actual a900px. Mantener estos umbrales; para piezas nuevas apilar a760px, sin nuevas fuentes/colores/sombras. Texto normal≥4.5:1; foco/borde≥3:1; estado con etiqueta además del color. Copy público/API/panel en inglés. Reusar `.btn/.card/.seg/.badge/.empty/.warn/.actionbar`; navegación de pestañas con flechas/Home/End; mensajes status/alert; foco restaurado y errores asociados; zoom200%, reduced-motion. Sin librerías nuevas, sin PII en storage/URLs/logs; React escapado, enlaces internos por ID y externos con helpers seguros. Imágenes dimensionadas/lazy, CLS<0.1; sin N+1 ni polling nuevo.

## Review Focus

- Varias publicaciones de la misma casa producen una tarjeta (Task1, canonical duplicates).
- Shortlist histórico nunca acredita aprobación (Task1, legacy shortlist).
- Caducidad/negativa posterior/otro hogar no se resuelve con MAX histórico (Task1, current scope).
- Refresco tardío tras cambiar ficha no mezcla búsquedas ni borra borradores (Task2, stale request).
- Desaparición de tarjeta tras acción mantiene foco útil y conteos veraces (Task2, focus removal).

## Mapa de archivos y frontera

Crear `server/applicant-match-groups.js` para lectura/DTO; modificar `server/routes/applicants.js` (detail); crear `admin/src/ApplicantMatchGroups.jsx`; modificar `admin/src/ApplicantDetail.jsx`, `admin/src/MatchCard.jsx` y solo estilos necesarios en `admin/src/styles.css`. Pruebas nuevas `tests/server/applicant-match-groups.test.mjs`, `tests/applicant-match-groups.test.js`, `tests/applicant-match-groups.e2e.cjs`. Sin migración propia. Test adicional:101 externas sin listing local paginan25/25/25/25/1, totales101 estables, claves únicas y sin enlaces locales inventados. Externa pending con parking unknown muestra su check y abre SAP09 usando candidate_id correcto, sin match local ni botones legacy ficticios. Paginación mantiene cursor/snapshot; cambiar filtro inicia cursor null; snapshot material alterado/cursor vencido409 conserva página y ofrece Reload. EST13 aporta `server/match-followup.js` y relación canónica: sus interfaces tienen que estar integradas, no crearlas vacías aquí.

### Task1: proyección y respuesta autenticada

**Interfaces:** Consume matchSummaryFactsQuery y el mapa canónico EST13 de spec; produce readApplicantMatchGroups/toApplicantMatchGroups y `GET detail.match_groups:ApplicantMatchGroupsV1` exactamente como spec.

- [ ] Añadir fixtures a `tests/server/applicant-match-groups.test.mjs`: 2listings/misma propiedad1item, 2operaciones2keys; filas 3candidatas/2aprobadas/1confirmada=3/2/1; shortlist legacy sin aprobación=1/0/0; rechazada no candidata; sin consultas conserva candidata; scope otrohogar=false; prueba current negativa después de positiva; inválida=>nulls/unverified; cero real=>0s; historical/unsupported; sin sesión401/403 y ID inexistente 404. Comprobar orden/parametrización SQL y querycount constante con1/100casas.
- [ ] Ejecutar `node --test tests/server/applicant-match-groups.test.mjs`; fallo esperado por módulo/DTO ausente, sin modificar dependencias para lograrlo.
- [ ] Implementar funciones con firmas de spec; generar asOf una sola vez en detail; consolidar por property_key mediante productor y usar followupCardsQuery con página25 y display_summary externo cuando representative_listing_id=null. Totales de proyección completa y página comparten instantánea; no añadir N+1 ni listado entero. Leer en batch existente, conservar campos previos. No escribir ni tocar last_activity_at.
- [ ] Reejecutar prueba nueva y `node --test tests/server/applicants.test.mjs tests/server/matches.test.mjs`; esperarPASS y mismas respuestas previas salvo DTOaditivo.
- [ ] Revisar diff y preparar commit futuro de esta unidad solo al construir; ningún commit en esta planificación.

### Task2: filtros y continuidad de acciones

**Interfaces:** `ApplicantMatchGroups({groups,onReview,onPage,onGroupChange,reviewing,disabled}):JSX`; groupedcard usa `cardKey='property-'+property_key`; `MatchCard({...,cardKey?:string})` conserva defecto `match.id`. Consume detail.match_groups y el endpoint match-groups por página/filtro, no hace petición por tarjeta. Las tarjetas externas usan display_summary/checks del productor sin requerir legacy MatchCard.

- [ ] En `tests/applicant-match-groups.test.js` fijar filtros inclusivos, totales no sumables, null/inválido no0, texto exacto de confirmación, foto fallback y IDs únicos. En e2e probar A1–A8 de spec, retirada de foco tras reject, error de refresco sin esconder éxito previo y borrador Requirements preservado.
- [ ] Ejecutar `node --test tests/applicant-match-groups.test.js`, verificar RED por componente/helper ausente.
- [ ] Añadir componente y conectar tab Matches. Preservar flujo Shortlisted/Undo y Rejected; usar carga/error/empty/unsupported/historical/unverified distintos. Secuenciar fetch por id/request para que respuesta vieja no sustituya la ficha nueva; actualizar ambos `matches` y `match_groups` después de review.
- [ ] Ejecutar prueba nueva, `npm test`, `npm run build`, `npm run check:release` y e2e según cabecera vigente usando servidor local. EsperarPASS; distinguir bloqueos externos, sin cambiarred.
- [ ] Recorrer MCP Playwright 1280/390, zoom200%, teclado, foco, carga/vacío/error/parcial, consola/red y dospestañas con cambio material; comprobar miniaturas lazy y sinN+1. Guardar evidencias locales sin PII.
- [ ] Solo después de construir y revisión independiente, actualizar SAP03 hecho/falta/evidencia en JSON/ESTADO y renderizar catálogo con scripts existentes; no declararEST13 completado. Publicación requiere autorización separada SHAexacto.


### Comprobación adicional de cursor y cambios concurrentes

- [ ] En las suites focales del plan, fijar snapshot inicial, cambiar disponibilidad/decisión/configuración entre páginas y exigir409CURSOR_STALE sin filas ni totales mezclados. Repetir sin cambios: as_of/posición conservados y sin duplicados; alterar firma/ámbito400, caducidad300000ms409. Watermark/totales/cards se leen en un único DB.batch readonly. UI Reload obtiene colección nueva sin borrar cambios de Requirements ni saltar foco. Ejecutar comandos focales anteriores -> PASS; ningún timestamp por sí solo se presenta como snapshot durable.
