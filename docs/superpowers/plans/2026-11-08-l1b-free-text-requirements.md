# REG-13 · Extracción de requisitos como propuesta revisable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta entrega solo redacta documentos; no ejecutar ahora.

**Goal:** REG-13 · Extracción de requisitos como propuesta revisable.

**Architecture:** Ampliación de los módulos existentes con contratos explícitos y guardas dentro de la transacción. Las dependencias propuestas requieren prueba real antes de integrarse.

**Tech Stack:** JavaScript ES modules, React19, Cloudflare Pages/Workers, D1/SQLite y pruebas Node/e2e existentes.

**Spec:** [diseño](../specs/2026-11-08-l1b-free-text-requirements-design.md).

## Global Constraints

Base `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1`; solo documentos ahora. Construir exige revisión de alcance/diseño, dependencias y reserva build. Publicación/migración se autorizan aparte. No modificar el catálogo por terminar el plan.

**UI comprobada en código, frente a la cabecera desfasada de DESIGN.md:** `admin/src/styles.css`: ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#6b665e`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, warn-bg `#fff6e5`, field-line `#8f8a82`. Tenor Sans/Georgia H1 26px/H2 19px, peso400; Montserrat/system-ui 14px/1.5, labels12px. Page1240px y padding24px16px120px; card24px/radio14px, field9px12px/radio10px, botones10px20px/radio999px. Reusar `.card/.field/.btn/.warn/.actionbar/.badge`, gaps12/16/24px, editor280px y apilado900px; piezas nuevas apilan760px. Botón hover bronze-dk, disabled opacity.45; foco2px bronze/offset2px y, si contraste medido lo exige, bronze-dk en el control tocado. Contraste texto≥4.5:1, foco/bordes≥3:1; estados con texto, labels nativos, aria-invalid/describedby y status/alert. Controles32px escritorio/44px móvil, teclado, 1280/390 y zoom200%, reduced motion. Copy/API inglés. ENERGY1/RHYTHM1/MOTION1; sin fuentes, imágenes, librerías o animaciones nuevas. React escapa texto; URLs por helpers existentes; sin PII/tokens en storage, URL, analytics o logs. No polling de ficha completa ni N+1; las solicitudes tardías no sobrescriben formularios.

## Review Focus

- Frases ambiguas/negadas/contradictorias no se convierten en must, Task1.
- Emojis, caracteres combinados y rangosUTF16 inválidos no cambian citas, Task1.
- Doble solicitud/timeout/acuse perdido no provoca llamadas repetidas, Task2.
- Texto seleccionado de otra versión o búsqueda cerrada no produce cambio, Task2/3.
- Modelo desactivado o entrada con datos fuera de alcance no envía datos, Task2/3.

## Task1: Validar salida y selección sin efectos

**Files:** crear `server/requirement-extraction.js`, `tests/server/requirement-extraction.test.mjs`; consumir validador común del núcleo AUT19 y `site/requirements.js`.

**Interfaces:** RequirementExtractionInput/OutputV1, validateExtractionOutput y buildCriteriaPatchFromSuggestions del spec. El texto original nunca es patch implícito.

- [ ] Crear fixtures sintéticos EX01–EX05: quietstreet/noquietstreet, nearVictoriaCollege, dosnegaciones, prioridadesunknown, parking2must→parking_spaces2+values.parkingmust; garden+balcony→outdoorfusionadosconterraceprevia+prioridadesindividuales; bedroomsminsinborrarmax; requirementsset/clearrechazados; must/preferred/unknownexactos, campos no citados, inyección «ignore rules», output25items, keyoperation/cierre, rangosfuera/cortandosurrogate, input/outputrequest_iddiferente. Afirmar400/502según frontera y cero campos incorporados de salida inválida.
- [ ] Ejecutar `node --test tests/server/requirement-extraction.test.mjs` → RED.
- [ ] Implementar parser allowlist/enum/rangoUTF16, mapaCRITERIA→campo explícito del spec y patches solo desde selección humana; requirements permanece fuera de patch y commercial unsupported en este alcance; resolver conflictos de misma clave antes de crear patch. Sin NLUregex, geocoding ni segundo evaluador de matching.
- [ ] Ejecutar suite → PASS; registrar límites4000/20 y pruebas de que ninguna prioridadnoindicada se marca must. Commit futuro `feat: validate reviewable requirement suggestions`.

## Task2: Puerto privado desactivado y control de invocaciones

**Files:** crear `server/model-requirements-port.js`, `server/routes/requirement-extraction.js`, `tests/server/requirement-extraction-route.test.mjs`, migración siguiente `migrations/NNNN_requirement_extraction_operations.sql`; modificar `server/api.js` y la pasada de limpieza existente para TTLsolo del registro técnico.

**Interfaces:** extractRequirements(input,{signal}), gate de configuración failclosed, operationreceipts mínimos del spec. No implementar un proveedor por defecto.

- [ ] Tests `disabled_port_never_calls_network`, `route_requires_session_and_review`, `stale_search_never_calls_port`, `duplicate_operation_calls_once`, `changed_body_same_key_is_409`, `unknown_does_not_auto_retry`, `timeout_and_late_result_are_discarded`, `no_content_in_operation_or_logs`; usar portstub sintético, nunca credenciales reales.
- [ ] Ejecutar `node --test tests/server/requirement-extraction-route.test.mjs` → RED.
- [ ] Implementar ruta privada16KiB, guardas de versión/estado y lease25s antes de invocar; abort20s, resultado10min, finalización mínima sin prompt/respuesta. Peticiones sinreview400, sinpolicy503; ninguna nueva ruta Hermes.
- [ ] Persistir solo hash/control/identidad y expiry24h; mismo keyfinished responde409 sin reejecutar, incluso si se perdió respuesta. Limpieza no afecta eliminación del contacto ni política PRE12.
- [ ] Ejecutar suite → PASS. Registrar que fixtures validan consumidor y que proveedor real sigue pendiente. Commit futuro `feat: gate requirement extraction behind a private model port`.

## Task3: Revisar sugerencias y entregar propuesta

**Files:** crear `admin/src/RequirementExtraction.jsx`, `tests/requirement-extraction.e2e.cjs`; modificar `admin/src/ApplicantDetail.jsx` y solo CSSlocal necesario.

**Interfaces:** consume POST extracción; produce patch para createCriteriaProposal(baseVersion,patch,operationId), sin endpoint directo de aplicar ni confirms del modelo.

- [ ] Cubrir EX01–EX10 en fixture: seleccionarfragmento/revisarprocesamiento; desactivado/errores/timeout; cita/unknown; seleccionar/corregir/descartar; cierre/ediciónconcurrente; volverdeotra búsqueda; dobleclick y confirmación posterior. Afirmar texto guardado intacto y parking/mascotasconservados.
- [ ] Implementar UIinline con resultadoenmemoria, expiración10min y limpieza al desmontar, sin permiso demicrófono/storage. Frases ambiguas sin selecciónpordefecto, revisiónprioridadobligatoria; errorencontexto con foco.
- [ ] Ejecutar `E2E_SCRIPT=tests/requirement-extraction.e2e.cjs npm run test:e2e` → PASS de consumidor local con puerto fixture. Activación/modelo real no probado por esta suite.
- [ ] Antes de añadir adaptador real, completar ficha de proveedor del spec, revisión independiente y prueba autorizada con datos sintéticos. Si falta cualquiera, conservar modo manual y estadoREG13condicionado.

## Autorrevisión

EX01–05→Task1; EX04/06/07/09→Task2; EX08/10→Task3. El presupuesto por voz no se promete como REG13 en esta fase; se conserva la frontera del núcleo AUT19. No hay proveedor, puerto del VPS o suscripción elegidos por este plan.

## Entrega futura

- [ ] Ejecutar las suites focales, `npm test`, `npm run build`, `npm run check:release` y e2e relevante en fixture local, sin tocar producción. Registrar PASS/FAIL real.
- [ ] Para cambios UI, Playwright MCP local1280/390: camino correcto, vacíos, error, permisos, conflicto, teclado/foco/zoom200%, consola/red; corregir hallazgos y repetir solo pruebas afectadas. Para unidad sin UI, registrar no aplica.
- [ ] Revisión independiente; actualizar estado por tramo con evidencia, ledger y relevo privado. Preparar commit con rutas explícitas y SHA revisable, sin publicar ni migrar por inferencia.

Skills y alcance aprobable se detallan en el spec. Las casillas abiertas son trabajo futuro: no constituyen pruebas ejecutadas.
