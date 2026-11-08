# BUS-18, seguimiento por vivienda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar seguimiento por vivienda canónica y operación, incluidas fuentes externas.

**Architecture:** API admin de lectura y componente reutilizable sobre EST-13; ListingEditor solo monta seguimiento canónico con identidad BUS-10 resuelta. Comisión sigue como gestión humana independiente.

**Tech Stack:** JavaScript ESM, Workers/Pages, D1/SQLite, React/Vite, node:test y Playwright existentes.

**Spec:** [Diseño](../specs/2026-11-08-l1-property-followup-design.md).

## Global Constraints

- Solo planificación sin reservas ni producto en esta entrega. Antes de construir: verificar GitHub/alcance, dependencias integradas, reserva build y migración de número libre. Ninguna casilla futura acredita ejecución ni autoriza publicar/migrar.
- Admin/sameOrigin/no-store existentes; actor del servidor, SQL parametrizado, validación IDs/enums/versiones, DTO mínimo y texto React. Sin env/secretos, PII/mensajes en logs/eventos/storage ni envíos automáticos. GET no escribe.
- `search_state=active` y sin archivo para trabajo nuevo; cierre/reapertura humanos EST-09. No usar Stage para cerrar. Fuentes web/confirmed_at/precio/visita/Shortlisted no confirman disponibilidad ni aprobación. D06 continúa desactivado.
- CSS actual: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, bronze-dk#86542d, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. Tenor Sans/Georgia/serif H1 26px/H2 19px peso400; Montserrat/system-ui 14px/1.5 y auxiliar12px, cabecera12px/600. page max1240px padding24px 16px 120px; radios14/10/999px; celdas10px 12px, botón10px 20px/pequeño6px 14px, gaps8/12/16px; sombra0 1px 2px rgba(20,20,20,.04),0 12px 32px -18px rgba(20,20,20,.22).
- Propuestas DESIGN globales de radios16/12, escala4/8/12/16/24/32/48/64 y breakpoints480/760/980 no son CSS actual. Aquí solo se propone reflow760 y objetivos32px escritorio/44px móvil en controles tocados. Foco2px/offset2px, hover bronze-dk, disabled opacity.45, texto4.5:1/foco3:1, teclado/zoom200%,1280/390, reduced motion. UI/API inglés; ENERGY1/RHYTHM1/MOTION1. Sin nuevas fuentes/imágenes/librerías/animaciones.

## Review Focus

1. Tres anuncios, dos unidades de una dirección y varias operaciones: identidad conservadora, Task 1.
2. Consulta común y rechazo/cierre de A: no contagio a B, Task 2.
3. Interés público, envío privado y comisión: no inferencias cruzadas, Task 2.
4. Cursor/filtro/sesión cambiados con respuestas tardías: snapshot y foco correctos, Task 3.
5. Productor ausente o error SQL: unknown/unavailable/error explícitos, Tasks 1/2.

## Archivos y límites

Crear `server/property-followup.js`, `server/routes/property-followup.js`, `admin/src/PropertyFollowup.jsx`, `tests/server/property-followup.test.mjs`, `tests/property-followup.e2e.cjs`; modificar `server/api.js` (registrar rutas), `server/routes/listings.js` (canonical_property mínimo), `admin/src/ListingEditor.jsx` (montaje), `admin/src/styles.css` (reflow acotado). EST-13 posee match-followup.js, no duplicarlo. Sin migración propia, captura de términos de comisión ni nueva página de inventario.

## Task 1: Identidad y contratos reales

**Interfaces:** `resolveListingProperty(env,{listingId}):Promise<{property_id,property_keys:[{property_key,operation}],inventory_version}|null>` en server/property-followup.js; consume BUS-10 real. propertyFollowupFactsQuery({propertyId, operation, asOf, cursor, limit}) de EST-13; commissionManagementQuery({propertyId, asOf}) puerto humano aún sin productor integrado.

- [ ] Verificar BUS-10/AGE-03/EST-13 integrated del catálogo; EST-09 para cierre explícito y AGE-11/VIS-17 para dimensiones reales. Registrar firmas reales y adaptadores. No construir gestión de comisión para mostrar seguimiento; su captura sigue fuera de este tramo.
- [ ] Añadir tests listing_identity_uses_explicit_canonical_link, three_publications_share_one_followup, same_address_different_units_stay_distinct, one_contact_buy_rent_are_two_search_rows, unresolved_listing_keeps_labelled_legacy_history, missing_commission_producer_is_unavailable, integrated_producer_failure_is_not_empty. Afirmar sin identidad por address/name ni HE-* ficticio para externos.
- [ ] Ejecutar `node --test tests/server/property-followup.test.mjs` -> RED por adaptadores nuevos. Productor faltante se registra como gate; mocks no acreditan integración.
- [ ] Implementar adaptador real; añadir canonical_property al detail de listing sin sustituir listing ni legacyMatchedApplicants. null muestra identidad pendiente y mantiene historia etiquetada. Ensamblar comisión opcional explícitamente, sin catch-error->unavailable.
- [ ] Repetir suite -> PASS con productores reales; commit futuro `feat: resolve canonical identity for property follow-up`.

## Task 2: GET admin con dimensiones y totales

**Interfaces:** `listPropertyFollowup(env,{propertyId,operation,cursor,limit,asOf}):Promise<PropertyFollowupResponseV1>`; GET `/admin/property-followup/:propertyId`, query/response exactos de spec. asOf UTC único, snapshot único, limit25 por defecto1..100, cursor ligado a propiedad/filtro/snapshot.

- [ ] Tests followup_response_separates_evaluation_decision_enquiry_availability_client_viewing, reject_or_resolve_A_preserves_B_and_shared_enquiry, public_interest_not_private_response, completed_is_viewed_no_show_is_not_viewed, commission_never_inferred_from_matching, global_total_precedes_keyset_limit, followup_auth_no_store_and_get_no_writes, followup_invalid_filter_cursor_and_id, followup_sql_failure_returns_error. Afirmar400 formato,404 vivienda inexistente,401 sin sesión; versiones/actividad/eventos idénticos antes y después GET.
- [ ] Ejecutar suite focal -> RED de endpoint nuevo.
- [ ] Implementar builder EST-13 más nombre/id de contacto admin existente, sin N+1 ni interés público como respuesta privada. URLs/textos seguros, totales anteslimit y cursor estable. unknown explícito, sin ceros de error. commission_management solo unavailable/not_recorded/recorded por evidencia humana independiente, sin tasas/importe inferidos.
- [ ] Registrar rutas en server/api.js, requiresAdmin=true y no-store existente. Validar propertyId con contrato BUS-10, operación/limit/cursor, binds. No404 para falloSQL, GET no escribe actividad ni crea tareas.
- [ ] Repetir suite -> PASS e instrumentar cardinalidad/queries acotadas con100+ búsquedas y fuentes duplicadas. Commit futuro `feat: expose authenticated property follow-up facts`.

## Task 3: Componente y carreras

**Interfaces:** `PropertyFollowup({propertyId,initialOperation=null,paused=false})` en admin/src/PropertyFollowup.jsx. ListingEditor pasa identidad resuelta y pausa de sesión; futura ficha inventario podrá reutilizarlo sin construirse aquí.

- [ ] Añadir tests/property-followup.e2e.cjs: property_followup_rent_buy_transfer_separate, external_has_no_invented_listing_photo, dimensions_remain_independent, empty_error_reload_and_stale_snapshot_copy, operation_change_invalidates_old_response_and_cursor, logout_or_hidden_tab_stops_refresh, focused_link_survives_refresh, commission_manual_link_only_when_record_exists. Feliz camino usa datos reales locales; interceptar solo carreras/error.
- [ ] Ejecutar `E2E_SCRIPT=tests/property-followup.e2e.cjs npm run test:e2e` -> RED de componente, sin otro e2e simultáneo.
- [ ] Crear tabla/tarjetas con columnas/copy de spec, filtros operación, cursor y enlace applicant. No deduplicar por contacto ni ocultar búsquedas resueltas. Sources inline con fecha y URL http(s), badges con texto. Comisión “Commission: manual management”, enlace únicamente a registro existente seguro; sin captura/estimación/botón muerto.
- [ ] Implementar usePoll30s solo visible y sesión activa, invalidar generación por property/filter/cursor/desmontaje/401, callback inicial respeta visibilidad y evita dobleGET. Cambio operación reinicia cursor, errores conservan snapshot rotulado; datos viejos no se rotulan como filtro nuevo. Reintento solo GET, live alert global y foco estable.
- [ ] Modificar ListingEditor y CSS acotado: GlobalConstraints, reflow760, data-label, objetivos32/44px, teclado/foco, estados botón completos. Sin PII en web/storage. Pasar paused desde App al host si aún no dispone de él; no modificar api global.
- [ ] Repetir e2e focal -> PASS; revisar1280/390, zoom200%, contraste, reduced motion, error/carga/vacío. Commit futuro `feat: show independent follow-up by property operation`.

## Task 4: Evidencia y alcance pendiente

**Interfaces:** Produce seguimiento de lectura integrado; no implica gestión de comisión ni coordinación/transporte upstream completados.

- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release`, `npm run test:e2e`, e2e focal y suites listings/searchlifecycle afectadas una vez. Playwright MCP local1280/390/zoom200% verifica teclado, foco, retry, consultasglobales, no escrituras/PII, consola/red. Registrar bloqueos reales.
- [ ] Revisión independiente, corregir hallazgos y repetir solo checks afectados. Actualizar BUS-18 con alcance cumplido; no marcar tarea entera completa si el catálogo conserva captura/contrato de comisión o productores faltantes. No cerrar BUS-10/AGE-03/EST-13 por consumirlos. ESTADO/generados/ledger solo al construir con scripts oficiales.
- [ ] Preparar commit/SHA y relevo privado; no migrar/publicar porplan. Comisión y sus términos se acuerdan en gestión humana independiente.

## Autorrevisión actual

B18-1/4 ->Task 1/3;B18-2/3/5 ->Task 2/3;B18-6 ->Task 2/3/4. Contratos reales/propuestos separados y fuentes/estados no duplicados. Hoy solo documentos, sin tests de producto, build, e2e, Playwright, migración ni publicación.


### Comprobación adicional de cursor y cambios concurrentes

- [ ] En las suites focales del plan, fijar snapshot inicial, cambiar disponibilidad/decisión/configuración entre páginas y exigir409CURSOR_STALE sin filas ni totales mezclados. Repetir sin cambios: as_of/posición conservados y sin duplicados; alterar firma/ámbito400, caducidad300000ms409. Watermark/totales/cards se leen en un único DB.batch readonly. UI Reload obtiene colección nueva sin borrar cambios de Requirements ni saltar foco. Ejecutar comandos focales anteriores -> PASS; ningún timestamp por sí solo se presenta como snapshot durable.
