# REG-08 Must-have Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Interruptores Must-have a la derecha de los requisitos residenciales, edades del hogar y evaluación fiel de imprescindibles.

**Architecture:** Un contrato versionado de prioridades por búsqueda, sobre campos existentes. Funciones puras compartidas para evaluación y presentación; certeza extraída al guardar propiedades, nunca analizando textos en cada cruce. Web nativa y panel React conservan sus flujos y validación del servidor.

**Tech Stack:** JavaScript ESM, React, SQLite/D1, Workers/Pages, CSS existente; sin nuevas dependencias.

**Spec:** docs/superpowers/specs/2026-11-07-reg-08-parking-requirements-design.md (aprobado por Luis: «Vale, está bien, ahora construyelo»).

## Global Constraints

- Construcción inicial /tmp/hampton-reg08, base cf0c86d; integrada en /tmp/hampton-reg08-integrated sobre 9d4429c el 8-nov. AGE-04 se conserva; NOT-11 no se publica. Migración definitiva0031, después de0030 de AGE-04.
- No nombres ni fechas de nacimiento de niños. Edades0 (Under1)..17 y null por confirmar; sin cumpleaños inferidos ni almacenamiento personal en navegador.
- Alternativa/pendiente nunca se convierten en imprescindible satisfecho por score o Shortlist. Hechos mascotas/niños se conservan al apagar switch.
- Autenticación, CSRF, Turnstile, versión de búsqueda, rechazo humano y búsquedas cerradas se preservan.
- Construcción autorizada; un único commit final con código+estado/checklist. Publicación/migración requieren aprobación del SHA final.
- Ejecución nativa con revisión independiente final: no se pide otro visto bueno de plan tras la orden explícita de construir (instrucción de autonomía de la sesión prevalece sobre handoff de skill).

## Review Focus

- Edición parcial de legacy o cambios en número de niños: preservar lo ajeno y rechazar edades incoherentes (Task1/4).
- Recalcular una propiedad mientras cambia la búsqueda: versión y decisiones humanas sobreviven (Task2/4).
- Listado con distintas certezas, score alto y más de25 candidatos: imprescindibles antes del score, sin checks históricos engañosos (Task2/4).
- Prioridades de un campo oculto por operación/categoría o No pets/None: no enviar requisitos imposibles ni revelar datos en almacenamiento (Task3/4).
- Garaje genérico, parking de visitantes, mascotas por negociación y exterior negado: no cumplimiento falso (Task2).

## Reglas de diseño y skills aplicadas

DESIGN.md «Colors», su actualización EST-09 y CSS actual: ambas superficies usan ink#151515, paper#fff, mist#f4f3f0, line#e3e0da; panel stone#6b665e, bronze#a56b3d solo foco/no-texto, bronze-dk#86542d para texto, ok#2f6b4f, err#a32020, field-line#8f8a82. La web conserva su paleta vigente en lo ajeno; controles nuevos usan contraste de panel donde haga falta. Tenor Sans títulos; Montserrat cuerpo (web15px/1.65, panel14px/1.5; inputsweb16px). Radios999px en switch,12px camposweb,14px tarjetas24px padding; panelpage24px16px120px. Foco2px bronze con offset2px. Nuevos switches: área táctil44pxmínimo, pista40×24, mando18, On/Offtexto, layoutflex títuloizquierda/control derecha, gap12, permitewrap a200% sin overflow a390. Sin animación nueva necesaria. Breakpointpanel760px; campo numérico nativo.

impeccable: conservar PRODUCT/DESIGN y controles familiares, label estable y todos los estados. antislop durante: interruptor útil a petición de Luis, nada decorativo, sin assets nuevos ni wizard. security-best-practices/frontend-security-coder: allowlist/validaciónservidor, JSONsinHTML, esc/textContent, control de versiones, no edades en browserstorage ni logs. web-performance-optimization: ningún paquete ni fuente nueva, lazy apply existente, evidencia precomputada y consultas acotadas; medir bundle/recálculo en pruebas. ponytail: módulo pequeño de catálogo/serialización compartido, helpers existentes, sin motor comercial ni servicios. taste/redesign: no aplica nueva página o rediseño general.

## Contratos

`requirement_priorities`: TEXT JSON/null en applicants. JSON `{version:1, values:{key:'must'|'preferred'|'unknown'}, unknown:[key]}`; unknown señala respuesta explícitamente desconocida; prioridad y dato independientes. Keys: parking,area,type,bedrooms,bathrooms,garden,terrace,balcony,furnished,pets,budget,move_in_date,lease_term_months,near,requirements,children. Ausencia de clave = prioridad legacy sin confirmar. Payload comercial no guarda prioridades residenciales. `household_children_ages`: array integer0..17/null, longitud igual a niños conocidos; null para legado sin respuesta. `household_ages_at`: fecha de declaración gestionada por servidor, solo cambia al cambiar edades.

`evaluate(a,l)` mantiene pass/score/checks y añade `requirements_status` ('meets','pending','alternative','excluded'), `requirements_rank`0..3; checks ampliados con priority y reason. Hechos incompatibles no se vuelven compatibles por apagar prioridad. Legacy conserva límites conocidos pero se muestra prioridad pendiente, sin atribuir una declaración nueva.

## Task 1: Datos y validación de prioridades y edades

Files: migrations/0031_requirement_priorities.sql; site/requirements.js (catálogo y utilidades puras); server/applicants.js; server/routes/applicants.js; tests/server/requirements.test.mjs.

Interfaces: catálogo CRITERIA, parsePriorities(value), prioridades por clave; validateApplicant devuelve JSONvalidado y edades declaradas. Rutas parsean JSON y conservan fecha en PATCH no relacionado.

- [x] Escribir tests: validar mustparking2 y childrens[0,7,null]; rechazar versión/key/tipo inválidos, edades18/longitudincorrecta y mustNone; conservar legado sin prioridades.
- [x] Ejecutar node --test tests/server/requirements.test.mjs; esperado fallo por campos no guardados/validados.
- [x] Implementar migración aditiva, contrato y rutas incluidos duplicados, exportación/borrado, updateparcial y fecha declaración.
- [x] Ejecutar node --test tests/server/requirements.test.mjs tests/server/applicants*.test.mjs; esperado0fallos.

## Task 2: Certeza, imprescindibles y orden de candidatos

Files: server/listing-features.js; server/requirements.js; server/matching.js; server/match-store.js; server/routes/matches.js; server/widen.js; tests/server/requirements-matching.test.mjs; tests/server/matches.test.mjs.

Interfaces: usa contrato Task1. `requirementChecks(a,l,checks)` normaliza checks estructurados; `requirementsSummary(checks)` y comparador reutilizado por store/API. Datos de tarjetas se evalúan con filas actuales, nunca con texto ni writes en GET.

- [x] Test matrix: mustparking2/exact1=>alternative, garage=>pending, visitor2/up-to2=>pending, explicit2=>meets; StHeliermust/StSaviour=>alternative; petsconsidered=>pending; nogarden no meet; twochildren=>pending. Score100nooverride, budget2000stretch2200property2100 cumple.
- [x] Ejecutar tests focales; esperadoRED en clasificación/certeza.
- [x] Implementar metadatos versionados y checks por prioridad, conservación filtros/exclusiones no negociables; ordenar cumple/pendiente/alternativa y score estable. Revisar todos los caminos incluyendo recálculo individual y tarjetaslegacy.
- [x] Tests: node --test tests/server/requirements-matching.test.mjs tests/server/matching.test.mjs tests/server/matches.test.mjs tests/server/listing-features.test.mjs; esperado0fallos.

## Task 3: Interruptores y edades en formulario y panel

Files: site/apply.js, site/requirements.js, site/index.html o CSS dedicado; admin/src/RequirementSwitch.jsx; ApplicantFields.jsx; ApplicantDetail.jsx; Review.jsx; MatchCard.jsx; styles.css; tests/apply.test.js.

Interfaces: consume Task1; switch role=switch aria-checked boolean, texto Must-have estable, nombre por criterio. Valores debajo, switch derecha; Bedroomsrango, Childrenadecuaciónhogar. toBody conserva unknown/noaplica y omite categoría/operacióninaplicables; ages no browserstorage.

- [x] Tests serialización: apagarparking conserva2, mascotas conservanhechos, categoría comercial omitehogar, buyomitefurnished, edadesnull distintas0, Back conserva. Ejecutar y comprobar RED.
- [x] Implementar switches/requisitos y filas de edades; estadosnone/unknown, errores y foco; resumen/prioridades/matching visibles; aviso privacidad nombra edades voluntariamente declaradas sin cambiar base legal.
- [x] Tests node --test tests/apply.test.js tests/server/requirements.test.mjs y npm run build; esperado0fallos, buildcorrecto.

## Task 4: Integración y recorrido real local

Files: tests/server/requirements.test.mjs, tests/server/matches.test.mjs, tests/reg08-e2e.cjs (o script focal equivalente), fixtures públicos aplicables.

- [x] Escribir integración rutas: actualizacionajena conservaages/fecha y priorities; stale409 nohistorial; duplicados nooverwrite; GETlegacyseguro; dosrecalcsnoavisosduplicados; rejected/shortlisted conservados; ranking25.
- [x] Ejecutar y corregir causa de fallos, con pruebasRED→GREEN para cada bug.
- [x] npm test; npm run build; npm run check:release; npm run test:e2e con fixtureaislado. Todos exit0.
- [ ] Playwright MCP local1280/390: switchesderecha, registroconmusty2niños, unknown/none, móvil/teclado/200%zoom, errorred/backendyvalidacion, ediciónpanel y matching, consola/red. Guardar capturas locales y resultados en ledger.
- [x] Migración local poblada e integridad, sin tocarprod.

## Task 5: Documentación, revisión y entrega concreta

Files: ESTADO.md, checklist-hampton-app.html, reconciliación, spec/plan/ledger; relevo privadoexcluido.

- [x] Comprobar cobertura del spec y evidencias; corregir estados EST18publicado, alcanceparcialBUS12/REGs y recomendaciónsiguiente segúnrúbrica.
- [x] Revisar integraciónremota conservandocambios y numeración; preparar snapshot para revisorindependientemodelomáscapaz (executing-plans).
- [x] Resolverhallazgos importantesconregresiónRED→GREEN y suiteverde; menoresaceptadosal ledger.
- [ ] Un commit inglés con archivos explícitos, sinprivados; pedirpublicaciónporSHAexacto y migración. No desplegarhastaaprobación.

Self-review: los cinco focos tienen pruebas; categorías/operaciones/familias/certeza/legacy/UI/estado cubiertos. Sin interfaces divergentes. El commit único respeta avanzar; scripts de tareas pueden registrar el mismo BASE hasta el commit final.
