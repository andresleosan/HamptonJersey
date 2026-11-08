# BUS-13 Jersey residential lettings scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. El encargo actual solo autoriza documentos; no ejecutar producto sin el alcance/reserva build y autorización habituales.

**Goal:** Aplicar Qualified/Registered únicamente a Lettings residencial de Jersey, con incertidumbre visible y sin borrar datos históricos.

**Architecture:** Helper puro de scope compartido; evaluador RENT actual para los casos conocidos; proyecciones y tarjetas reconstruyen el check vigente en todos los caminos. Sin gestor, artefactos legales, nuevos endpoints o migración propia.

**Tech Stack:** JavaScript ESM, React/CSS actual, Pages/Workers/D1, node:test y Playwright locales; sin dependencias nuevas.

**Spec:** [Diseño](../specs/2026-11-08-l1b-residency-adoption-design.md).

## Global Constraints

- Leer main `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1` y las decisiones finales de Luis: solo Lettings residencialJersey; preguntas de diseño resueltas, datos profesionales disponibles para incorporación manual por Hampton Estates LTD.
- Planificación no modifica código, catálogo, estado de producto o datos reales. La futura construcción conserva auth, versiones, eventos, demás gates y revisión/publicación habituales.
- No importar matrices/paquetes, crear gestores o exigir respuestas nuevas de las tres viviendas antes de construir. No reconstruir reglas jurídicas ni aplicar BUY a dominios fuera de alcance.
- Operación efectiva=search_operation??operation; paísNULL no equivale a international/Jersey. No inferir región de IDs, parroquia o mensajes.
- Valores comprobados en `admin/src/styles.css`, que prevalecen sobre la cabecera antigua de DESIGN.md: ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#6b665e`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, warn-bg `#fff6e5`, field-line `#8f8a82`. Montserrat/system-ui14px/1.5; Tenor Sans/Georgia H1 26px/H2 19px400; labels12px. Página1240px/padding24px16px120px; tarjeta padding24px/radio14px/borde1px line; campo fondo`#fbfaf8`/radio10px/padding9px12px; botón600 12px/tracking.08em/padding10px20px/radio999px, hoverbronze-dk y disabledopacity.45. Foco2px/offset2px, gaps8/12/16/24px. Reusar `.card/.muted/.warn/.err/.inline/.badge/.btn`, no página o dashboard nuevo. Tabla apila a760px, editor actual900px; conservar umbrales. Web vigente: cuerpo Montserrat15px/1.65, Tenor Sans, wrap1240px, gutter`clamp(16px,4vw,40px)`, botones13px28px/radio999px, campos13px14px/radio12px; en copy nuevo usar stone`#6b665e` y bronze-dk`#86542d` para contraste, sin retokenización global. Texto visible/API en inglés; nombres de categoría factuales, sin afirmar derecho universal a ocupar o comprar. Estado con texto, labels/errores asociados, foco conservado, contraste4.5:1/3:1, teclado/zoom200%/reduced-motion y recorridos1280/390. Sin librerías, fuentes, imágenes, polling o consultas por tarjeta nuevas.

## Review Focus

- Campo país/uso omitido en un SELECT hace que el mismo inmueble cambie de scope (Task1/2).
- Compra o comercial conservan un checkhousing guardado aunque el evaluador ya no lo emita (Task2).
- Housing desconocido con score alto se presenta como completo, o se elimina una restricción explícita al retirar Q/R de compra (Task1/2).
- Cambiar operación/country oculta un control y el serializador borra su dato histórico (Task3).
- Precio/MUST/operación o controles de autorización se relajan al retirar Q/R de otro dominio (Task1/2).

## Archivos exactos y responsabilidad

Crear `site/housing-scope.js`, `tests/housing-scope.test.js`, `tests/server/housing-lettings-scope.test.mjs`, `tests/housing-lettings.e2e.cjs`. Modificar `server/matching.js`, `server/requirements.js`, `server/match-store.js`, `server/routes/matches.js`, `server/routes/applicants.js`, `server/widen.js`, `server/listing.js`, `admin/src/ApplicantFields.jsx`, `admin/src/ListingEditor.jsx`, `admin/src/ApplicantDetail.jsx` solo si adapta props/refresh, `site/apply.js`, `site/index.html` y solo CSS necesario en `admin/src/styles.css`. Ampliar `tests/server/matching.test.mjs`, `tests/server/requirements-matching.test.mjs`, `tests/server/matches.test.mjs`, `tests/server/applicants.test.mjs`, `tests/server/listing-events.test.mjs`, `tests/apply.test.js`. No crear HousingPolicyReview, tablas de políticas o endpoints de aprobación. Adaptadores futuros de BUS12/EST13/SAP03 se alinean al contrato de scope al integrarlos, sin crear un servicio ficticio en este cambio.

### Task1: scope explícito y evaluación Lettings

**Interfaces:** effectiveSearchOperation/resolveHousingRegion/jerseyResidentialLettingsScope y HousingScopeV1 en site/housing-scope.js; housingCheckForLettings y listingRestrictionCheck de spec en server/matching.js; evaluate(a,l) conserva firma y añade housing_scope/housing_review_required; requirementsSummary mantiene firma y pending para unknownhousing actual marcado scope_version1 o listing_restriction actual unknown, sin mezclar sus causas.

- [ ] Escribir tests B1–B6: tabla cruzada operación efectiva rent/buy/transfer, residential/commercial, país Jersey/UnitedKingdom/otro/NULL/vacío; prefijos HE-R/HE-I y parroquia no cambian unknown; puerto verified_region válido y conflicto. search_operation=buy con operation=rent no aplica; rent con legacybuy sí usa rent; transfer nunca Lettings. Falta clasificación necesaria en contexto rent sin exclusión explícita=>pending_scope.
- [ ] Fijar casos category/status faltantes=>unknown, housing unknown con100puntos=>pending y no cumple; fails de RENT conservado en caso aplicable; para entradas conocidas de RENT conservar resultado previo exacto, sin nuevos casos legales. Fuera del scope no hay checkhousing aunque datoslegacy existan. Probar compra/comercial/internacional sin restricción: no pending por Q/R. Con una restricción explícita ya aplicable, conservar resultado/evidencia de restricted() bajo listing_restriction; dato faltante deja unknown por restricción, no Qualified. First_time_buyer en rent conserva su exclusión de aplicabilidad anterior y no se inventan casos nuevos. Fallos de presupuesto/operación/must permanecen excluidos/alternativas; no se compensan con Q/R.
- [ ] Ejecutar `node --test tests/housing-scope.test.js tests/server/housing-lettings-scope.test.mjs`; esperarRED por helper/contrato ausente.
- [ ] Implementar helpers puros y limitar housing() al alcance decidido; reutilizar RENT y manejo de dato desconocido de NO_STATUS, sin reconstruir BUY ni añadir excepciones. Eliminar el uso de BUY para Q/R y separar restricted() en listingRestrictionCheck con su aplicabilidad actual. Añadir su fails al gate de pass tanto inicial como en la recomposición con prioridades; no perder un hard gate al separar funciones. No eliminar los datos de tenencia/restricción ni controles ajenos. No usar regionOf global para clasificar país vacío.
- [ ] Repetir tests nuevos y `node --test tests/server/matching.test.mjs tests/server/requirements-matching.test.mjs`; esperarPASS con cambios esperados de ámbito únicamente. Revisar que score/presupuesto/MUST/operación no se han relajado.

### Task2: proyecciones, checks históricos y DTO por propiedad

**Interfaces:** LISTING transporta use/country; APPLICANT transporta search_category/search_operation. EVAL_APPLICANT/EVAL_LISTING incluyen esos campos. matchCard(m) conserva firma, devuelve housing_scope/housing_review_required y sustitución del checkhousing por Q/R fresh y listing_restriction fresh separados; DTO canónico externo consume mismo helper.

- [ ] Añadir B7/B9: mismo par produce mismo resultado en recomputeForApplicant, recomputeForListing, matchCard, detail y Widen; caso externo sin listing local con país conocido y con región desconocida. Card legacy compra con housingfails guardado no reintroduce Q/R ni borra otros checks/historial. Con prioridades actuales y sin ellas, unknown fresh queda pending. Query omitió un campo=>pending_scope, nunca meets por defecto.
- [ ] Ejecutar `node --test tests/server/housing-lettings-scope.test.mjs tests/server/matches.test.mjs tests/server/applicants.test.mjs`; esperarRED en regresiones nuevas.
- [ ] Ampliar SELECTs y shape de evaluación; en matchCard retirar checkhousing almacenado y reconstruir Q/R y listing_restriction por separado, también rama legacy; no descartar la evidencia vigente de restricción al retirar un check antiguo combinado. requirements_refresh_needed señala diferencia de checks/rank que necesita persistir; GET solo presenta lectura, no toca actividad o dispara recálculo. Mantener candidatas/queue/topes, precio y otros filtros del inventario.
- [ ] Verificar adaptador de propiedad canónica de BUS12/EST13 si está integrado: use/country o verified_region, operación efectiva y scope/review_required viajan sin N+1. No rellenar región desde property_key, title o publicación. Al faltar productor registrar pendiente de integración normal, no crear uno vacío.
- [ ] Repetir pruebas nuevas más `tests/server/listing-events.test.mjs`; probar guardas de versión: cambio de scope de propiedad entre lectura/batch no guarda resultado anterior, y dos búsquedas del mismo contacto no comparten operación. Recálculo usa mecanismos existentes de EST01/BUS14/EST18, no nuevo scheduler o GET mutante.

### Task3: captura y etiquetas solo donde aplican

**Interfaces:** ApplicantFields/apply consumen contexto de pantalla residencialLettingsJersey explícito; ListingEditor usa helper de propiedad. toPublic añade housing_scope/housing_region del helper específico; housingLabel usa ese DTO, no la región genérica antigua. toForm/toBody/payloads de edición preservan datos ocultos y solo guardan cambios explícitos.

- [ ] E2E B8/B10/B11: editar housing_category manualmente en residencialrentJersey, vacío muestra pendiente; cambiar operación a sale/commercial o paísUK oculta opciones Q/R sin borrar el valor guardado; volver al caso aplicable lo muestra. Datoslegacy ocultos no causan NULL de patch ni error en otra edición. Beforeyoupublish pide Q/R solo en su ámbito, y missingcountry guía al campo correcto. Both en registro usa el dato para rent y no añade check a buy.
- [ ] Probar labels públicos: solo categoría factual en scopeapplicable, unknownscope «Housing details to confirm», fuera de scope sin etiqueta Q/R ni open-to-all; DTOsin campo de scope no concede aplicabilidad por un fallback. Tenure/restriction mantienen sus controles y datos propios, sin nuevas conclusiones legales por Q/R.
- [ ] Implementar condiciones/ayuda y serialización en formularios existentes, sin página nueva. Mantener expected updated_at/actor de sesión y eventos EST18 en rutas actuales. Un409 preserva borrador/foco; no recálculo/envío en view/Reload. No rellenar viviendas reales desde fixtures ni exigir sus tres datos antes de construir.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release` y e2e según cabecera vigente más `tests/housing-lettings.e2e.cjs`, con datos locales. MCPPlaywright1280/390, zoom200%, teclado/foco/carga/vacío/error/parcial, dos pestañas, consola/red y sin recargas o fetch por tarjeta nuevos. No leer helpers de credenciales ni modificar servicios.
- [ ] Revisión independiente, corregir hallazgos y repetir solo comprobaciones afectadas. Al construir actualizar BUS13 hecho/falta/evidencias en entrega correspondiente sin marcar otros códigos completos. Publicación/migración si surgiera de otra tarea requieren autorización separada; este plan no introduce migración o gate legal nuevo.
