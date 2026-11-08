# EST-18 · Conformidad de productores y proyecciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta entrega solo redacta documentos; no ejecutar ahora.

**Goal:** EST-18 · Conformidad de productores y proyecciones.

**Architecture:** Ampliación de los módulos existentes con contratos explícitos y guardas dentro de la transacción. Las dependencias propuestas requieren prueba real antes de integrarse.

**Tech Stack:** JavaScript ES modules, React19, Cloudflare Pages/Workers, D1/SQLite y pruebas Node/e2e existentes.

**Spec:** [diseño](../specs/2026-11-08-l1b-event-producer-contract-design.md).

## Global Constraints

Base `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1`; solo documentos ahora. Construir exige revisión de alcance/diseño, dependencias y reserva build. Publicación/migración se autorizan aparte. No modificar el catálogo por terminar el plan.

**UI comprobada en código, frente a la cabecera desfasada de DESIGN.md:** `admin/src/styles.css`: ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#6b665e`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, warn-bg `#fff6e5`, field-line `#8f8a82`. Tenor Sans/Georgia H1 26px/H2 19px, peso400; Montserrat/system-ui 14px/1.5, labels12px. Page1240px y padding24px16px120px; card24px/radio14px, field9px12px/radio10px, botones10px20px/radio999px. Reusar `.card/.field/.btn/.warn/.actionbar/.badge`, gaps12/16/24px, editor280px y apilado900px; piezas nuevas apilan760px. Botón hover bronze-dk, disabled opacity.45; foco2px bronze/offset2px y, si contraste medido lo exige, bronze-dk en el control tocado. Contraste texto≥4.5:1, foco/bordes≥3:1; estados con texto, labels nativos, aria-invalid/describedby y status/alert. Controles32px escritorio/44px móvil, teclado, 1280/390 y zoom200%, reduced motion. Copy/API inglés. ENERGY1/RHYTHM1/MOTION1; sin fuentes, imágenes, librerías o animaciones nuevas. React escapa texto; URLs por helpers existentes; sin PII/tokens en storage, URL, analytics o logs. No polling de ficha completa ni N+1; las solicitudes tardías no sobrescriben formularios.

## Review Focus

- Dos entidades/operaciones con mismo IDaparente: no mezclar listing/applicant/property, Task1.
- changes()/last_insert_rowid() alterados por composición: rollback y vínculos correctos, Task2.
- ConfiguraciónTTLsin evento produce paginación inconsistente, Task2/3.
- PRODUCTORausente/mock no es integración aprobada, Task1/3.
- Retención/purga/llamada parcial no destruye historia ni afirma éxito, Task3.

## Task1: Matriz de productores integrados

**Files:** crear `tests/server/projection-events-contract.test.mjs`; modificar únicamente escritores de la matriz que el preflight demuestre integrados y autorizados en scope. Crear `docs/roadmap/work/EST-18/producer-evidence.md` al construir con resultado por productor, sin PII.

**Interfaces:** consume contratos reales de tabla del spec; produce evidencia EV01–EV10, no unaAPIgeneral. La migraciónpropertypertenece al planavailability.

- [ ] Revisar mainvigente/0029/NOT11 y módulos productores, completar rutas/firmas reales en matriz. Cualquier ausente queda «no integrado» y bloquea su aceptación; no rellenar con stub.
- [ ] Añadir casos EV01–04/07 para cada productor presente: entidad/vínculo/revisión correctos, nochange/replay, dosactores, mismahora, conflicto, fallo de evento. Fixtures soloDBlocal poblada con FKs y notificaciones anteriores.
- [ ] Ejecutar `node --test tests/server/projection-events-contract.test.mjs tests/server/listing-events.test.mjs tests/server/events.test.mjs` → registrar RED por incumplimiento concreto o estado nointegrado. No alterar tests para ocultar productores ausentes.
- [ ] Preparar alcance/escrituras necesarios del productor antes de arreglarlo; preservar vista aplazada y comportamientoslegacy. No reconstruir datos históricos ni añadirIdempotenciaHTTPgenérica.

## Task2: Corregir composición y eventos de política

**Files:** crear `server/projection-events.js`, `tests/server/projection-events.test.mjs`; modificar dueño real de policyavailability y cada escritor fallido de Task1, sin sustituir logEvent/listingEventStatements.

**Interfaces:** projectionPolicyEventStatements del spec; logEvent/listingEventStatements/updateListingEvent reales; caller proporciona contexto autenticado y guard atomizado.

- [ ] Tests `policy_change_emits_event_in_same_batch`, `stale_policy_revision_emits_nothing`, `policy_event_contains_only_versions`, `unknown_policy_key_is_rejected`; falloevento revierteconfig y no se acepta ceroUPDATEcomoéxito.
- [ ] Ejecutar `node --test tests/server/projection-events.test.mjs` → RED específico.
- [ ] Implementar helper mínimoallowlist y evento en elbatch del dueño de política. Corregir composición de productoresconfallo: mutación+evento+recibo real, protegiendo orden de changes()/last_insert_rowid(). Sin SQL/actor/eventtypearbitrario aportado por cliente.
- [ ] Ejecutar suites de Task1/2 → PASS de productores realmenteintegrados; pruebas de migracionespropertylocales solo cuando la entrega dueña esté integrada. Registrodependientes no equivale a PASSglobal.

## Task3: Probar paginación y límites cruzados

**Files:** ampliar pruebas del productor `server/match-followup.js` integrado y `tests/server/projection-events-contract.test.mjs`; evidencia EST18 delTask1.

**Interfaces:** FollowupCursorV1/eventwatermark/encode-decode del planEST13; no APIshadow.

- [ ] Añadir tabla de casos donde entre page1/page2 cambia cada dimensión/config: respuesta409CURSOR_STALE sin filas y Reload conserva borrador. Sin cambio→page2 mismaas_of sin duplicados; cursoralterado400; expiry300000ms409; eventoajeno puede409.
- [ ] Pruebas de envío/captura/purga parcial con productores reales: eventodistingue pending/partial/success; historialpersiste y no seafirma efecto remoto por escribirDB. Afirmar allowlist de payload y ausencia dePII.
- [ ] Ejecutar suitesfocales Node indicadas por matriz→PASS por productor; no ejecutarE2EUI por no crear superficie nueva, pero realizar regresión e2e general al construir si escritoresUIcambian.
- [ ] Revisión independiente de matrizcompleta y contratos. Solo marcar EST18tramo productorintegrado cuando existe prueba real; lista restante queda pendiente. Commit futuro `test: certify domain event producers and projection consistency`.

## Autorrevisión

EV01/02/03/04/07→Task1/2; EV05→2/3; EV06/08/09/10→3. Esteplan no cambia el tipo/versión de los contratos previos; fija su demostración común y un helper mínimo deconfiguración. Sin UI nueva, el detalle UIglobal se conserva para regresión de escritores tocados.

## Entrega futura

- [ ] Ejecutar las suites focales, `npm test`, `npm run build`, `npm run check:release` y e2e relevante en fixture local, sin tocar producción. Registrar PASS/FAIL real.
- [ ] Para cambios UI, Playwright MCP local1280/390: camino correcto, vacíos, error, permisos, conflicto, teclado/foco/zoom200%, consola/red; corregir hallazgos y repetir solo pruebas afectadas. Para unidad sin UI, registrar no aplica.
- [ ] Revisión independiente; actualizar estado por tramo con evidencia, ledger y relevo privado. Preparar commit con rutas explícitas y SHA revisable, sin publicar ni migrar por inferencia.

Skills y alcance aprobable se detallan en el spec. Las casillas abiertas son trabajo futuro: no constituyen pruebas ejecutadas.
