> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-04 Property identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegación de implementación solo con autorización aplicable.

**Goal:** Completar identificación y dirección interna, preservando la ubicación pública y el estado único compartido con PUB-05.

**Architecture:** Añadir componentes internos mínimos a listings y validarlos junto con country sobre la fila fusionada. Mantener location como fuente pública explícita y ampliar solo el formulario admin. Reutilizar condición de PUB-05 y auditoría EST-18, sin publicar nuevos campos ni introducir servicio de búsqueda postal.

**Tech Stack:** JavaScript/React, Cloudflare Pages/D1/SQLite, node:test y Playwright existentes; sin librerías ni infraestructura nuevas.

**Spec:** [PUB-04 · decisiones D1–D13 y A1–A8](../specs/2026-11-08-pub-04-property-identity-design.md). Propuesta para revisión; encargo actual solo documental.

## Global Constraints

- Base main/HEAD/GitHub `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`, comprobada el 8-nov-2026. Al reanudar verificar remoto preservando documentos y trabajo ajeno.
- Planificación local sin init, credenciales, reserva, scope, watch, submit o complete. Código solo con encargo posterior, alcance exacto revisado y claim build confirmado según skill vigente.
- Datos opcionales; dirección/promotor internos no pasan a toPublic/SEO ni se copian a location. Campos existentes conservan su comportamiento; no prometer ocultar datos voluntariamente presentes en otros textos públicos.
- Postcode de Jersey valida forma propuesta, no existencia: regex `^JE[0-9]{1,2} [0-9][A-Z]{2}$`. Country canónico Jersey usa esa regla; resto conserva texto normalizado hasta 32 caracteres. Blank es válido; nunca consultar un servicio para poder guardar.
- property_condition comparte exactamente enum/columna con PUB-05; no duplicar ni forzar su familia completa. La construcción puede introducir el campo compartido si aún falta, con revisión de ese alcance.
- Migración propuesta sobre la base actual: `0032_listing_identity_fields.sql`. El número no se reserva en planificación; si otro trabajo lo ocupó, usar el siguiente libre y revisar su path antes de editar. Incorporar los triggers vigentes, sin reescribir 0029 ni perder campos de otros planes ya integrados.
- Publicación/migración de producción y envío de datos a servicios externos no se autorizan al revisar este plan.

## Review Focus

1. Dirección interna filtrada por place/SEO/metadatos: Task 3,P1/P2; revisar proyección efectiva y HTML, no solo columnas nuevas.
2. País cambiado con código postal conservado: Task 1,V2/API2; validar fila fusionada y conservar borrador ante 400.
3. ID renombrado por usar nuevo country/use: Task 2,ID1; enlaces/FKs/medios intactos.
4. Promotor oculto imposible de borrar o condición duplicada con PUB-05: Task 4,UI2 y Task 1,enum compartido.
5. Evento o error que copie dirección/nombre: Task 2,EV1–EV4; campos privados solo por nombre y rollback atómico.

## Reglas concretas de DESIGN.md

Superficie: Details del editor existente. No página nueva ni restyle; el preview es texto interno sencillo. CSS vigente y nota EST-09 de Colors prevalecen sobre el YAML histórico.

| Aspecto | Valores aplicables y fuente | Verificación |
| --- | --- | --- |
| Paleta panel | ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, bronze-dk#86542d, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. DESIGN Colors/nota EST-09 y styles.css:root. | Estilos calculados; texto bronce pequeño con bronze-dk. |
| Tipo | Montserrat/system-ui 14px/1.5; títulos Tenor Sans/Georgia/serif 26px H1 y 19px H2/peso 400; etiquetas 12px stone y sentence case. | Comparar con Details/Price vigentes. |
| Contenedores | `.card` padding 24px/radio 14px; `.grid2` auto-fit minmax(220px,1fr), gap 12px; botones 10px 20px/píldora 999px; conservar `.field`, `.muted`, `.actionbar`. | Añadir campos sin tarjetas/KPIs ni Save nuevos. |
| Reflujo | Contenedores min-width:0 y nombres/preview con overflow-wrap si hace falta; sin anchos fijos. Nuevos controles≥32px escritorio y 44px móvil (adopción de propuesta Densidad). |1280/390 y zoom 200 %, dirección larga/unidad/nombre con apóstrofos. |
| Formulario/estados | Inputs text y select nativos, labels reales, maxlength200/32; hint interno/público explícito. Foco 2px bronze/offset 2px, aria-invalid/describedby, role=status/alert; conservar valores en 400/409. | Contraste texto≥4.5:1, foco/controles≥3:1; teclado y Discard. |
| Rendimiento | Sin librería de postcode, geocodificador, fuente, imagen o request extra. Normalización lineal/bounded; preview en memoria. | Build/red/diff durante construcción. |
| Seguridad | React escapado, nada de dangerouslySetInnerHTML; SQL parametrizado, whitelist/session/CSRF/versiones actuales. Link estático con noopener noreferrer; datos internos sin logs/localStorage ni URL externa. | Pruebas públicas/SEO/admin y errores. |

No adoptar las propuestas genéricas de rediseñar Properties, cambiar paleta o crear skeletons. Mantener estados vacíos/loading/error existentes; sin animación nueva y respetando reduced motion.

## Skills aplicadas

- Brainstorming/grill-me: alternativas, exposición pública, formato frente a verificación, país/ID, estado compartido y promotor resueltos en D1–D13; propuestas no presentadas como aprobación de Luis.
- Writing-plans: archivos, firmas, comportamiento y pruebas por entregable.
- Impeccable/adapt: grupos/hints que explican datos internos y públicos, preview refluible y un solo formulario.
- Security-best-practices/frontend-security-coder: whitelist de texto, validación server-side sobre merged row, escape, no copiar dirección en eventos/URL y regresiones de rutas públicas; no modificar controles globales.
- Antislop durante trabajo: campos pedidos, mensajes concretos y sin sellos de verificación ficticios ni assets; DESIGN como dirección. No instalar herramientas ni volver a preguntar modo.
- Web-performance-optimization: normalización/preview locales, sin API postal adicional o petición por campo; registrar red/bundle cuando se construya.
- Ponytail: reutilizar country/location/road_name/parish/ID y condición, tres columnas propias adicionales; sin nueva entidad postal, mapa, importador o agenda de promotores.
- Taste-skill/design-taste-frontend y redesign-skill/redesign-existing-projects: no aplican a completar este formulario existente.

## Archivos futuros

| Archivo | Responsabilidad |
| --- | --- |
| Crear `server/listing-identity.js` | Normalización, regla postal, preview interno y registro CONDITION_LABELS compartido con PUB-05, sin red/DOM. Si el campo ya tiene proveedor integrado, reutilizarlo y no mantener dos registros. |
| Modificar `server/listing.js` | EDITABLE/validación, condición compartida si falta y preservación explícita de toPublic. |
| Modificar `server/routes/listings.js` | checkIdentity sobre fila fusionada, guardado/errores actuales; SELECT de lista conserva contrato mínimo sin nuevos datos internos. |
| Crear `migrations/0032_listing_identity_fields.sql` | Columnas propias y condición solo si no existe, según base decidida; recrear triggers actuales conservando privacidad de textos. |
| Modificar `admin/src/ListingEditor.jsx` | FIELDS, campos/hints/previsualización y condición/promotor compartidos; Save/Discard/nav vigentes. |
| Modificar `admin/src/styles.css` solo si lo exige el reflujo | Preview/nombres largos sin overflow, sin restyle global. |
| Crear `tests/server/listing-identity.test.mjs`, `tests/server/listing-identity-api.test.mjs` | Normalización, límites, país/ID y contrato admin. |
| Modificar `tests/server/listing.test.mjs`, `tests/server/listing-features.test.mjs`, `tests/server/listing-events.test.mjs`, `tests/server/public.test.mjs`, `tests/server/seo.test.mjs`, `tests/server/listing-import.test.mjs`, `tests/e2e.cjs` | Contratos públicos, identidad, parroquia, auditoría e interfaz. |
| Actualizar tareas PUB-04/PUB-05, ESTADO y derivados al construir | Campo de condición único y estado real, renderer/regenerados bajo alcance autorizado. No editar roadmap general en este encargo. |

### Task 1: Schema y normalización de identificación

**Interfaces:** `normalizeIdentityValue(key,value): string|null` valida los tres textos nuevos según spec y normaliza postcode. `checkIdentity(row): Record<string,string>` aplica la regla postal de D1/D2 sobre fila completa. `internalAddress(row): string[]` devuelve componentes presentes del preview en orden, sin concatenar location ni destinatario. En la base actual, exportar `CONDITION_LABELS` desde listing-identity.js con las cinco claves/labels del spec; ENUMS.property_condition usa sus claves y el editor sus labels. PUB-05 futura lo reutiliza; si ya existe un proveedor integrado al construir, consumir ese mismo registro sin duplicarlo.

- [ ] V1 en listing-identity.test: null/blank/espacios→null; nombres con acentos/apóstrofos/barras conservados; límites 200/32; rechazar números/bools/arrays/objetos. Postcode `je2  3ab` y `JE23AB`→`JE2 3AB`; formato malformado→error si país Jersey. No verificar asignación real del ejemplo.
- [ ] V2/API2: extranjero con texto postal válido no requiere JE; cambiar solo country a Jersey revalida el código guardado, devuelve 400 si no cumple y conserva fila; borrar código en el mismo PUT permite el cambio. Blank se permite en new_build. No inferir país/parroquia del código.
- [ ] API1: POST/PUT parcial/GET/null borrado de campos; condición existing distinta de null/good y developer opcional. Moneda/precio/disponibilidad no se alteran por estos campos. Rutas sin sesión/CSRF mantienen rechazo.
- [ ] Ejecutar `node --test tests/server/listing-identity.test.mjs tests/server/listing-identity-api.test.mjs tests/server/listing.test.mjs`; observar RED por módulo/columnas ausentes.
- [ ] Crear migración nueva con textos nullable y enum compartido si falta. Integrar normalizador a whitelist; postcode se normaliza antes de comprobar fila fusionada y no exige country en cada PATCH. Mantener reglas de campos existentes, sin backfill desde title/location/specs.
- [ ] Repetir pruebas, PASS y commit acotado; no publicar antes de completar historial y regresiones.

### Task 2: Identidad estable e historial privado

**Interfaces:** createListing/update/idPrefix/nextId mantienen sus firmas. El estado de dirección no renombra ID ni enlaza automáticamente edificios compartidos. Historial EST-18 conserva el schema: nombres de textos privados en fields/changed, solo condición enum en before/after.

- [ ] ID1: crear HE-R con medios/referencias, cambiar country/use/operación/dirección sin renombrar ID; FKs/medios y ruta canonical continúan. Dos propiedades con mismo building/postcode conservan referencias distintas.
- [ ] EV1/EV2: editar/borrar dirección/código/promotor genera evento con nombre de campo pero no su contenido en JSON; condición enum sí tiene antes/después. No-op normalizado no crea evento;400/409 no escriben. Confirmed_at intacto ante cambios de identidad internos.
- [ ] EV3/EV4: fallo de evento revierte escritura/updated_at/contexto; migrar base poblada conserva rows/events/notifications, FKs/integrity y campos previos. No duplicar condición si PUB-05 se integró antes.
- [ ] Ejecutar `node --test tests/server/listing-identity-api.test.mjs tests/server/listing-events.test.mjs tests/server/listing.test.mjs`; comprobar RED de auditoría ausente.
- [ ] Recrear triggers insert/update en migración nueva partiendo de la versión integrada actual. Añadir textos nuevos a fields/changed, nunca a los objetos before/after; condición compartida una sola vez. No modificar migraciones históricas, generar eventos retrospectivos o reescribir IDs.
- [ ] Repetir pruebas, PASS y revisión del diff de triggers; commit acotado, sin migración remota.

### Task 3: Frontera pública y ubicación

**Interfaces:** toPublic/shape y readLive→pub se conservan; location sigue siendo place, sin fallback a dirección nueva. listingMeta y listPublic siguen usando pub y no row. extractFeatures mantiene sus fuentes actuales, no suma building/postcode/developer.

- [ ] P1 en public.test/listing.test: ficha publicada con valores internos sintéticos distintivos; GET público y proyección no contienen claves/valores nuevos y place sigue siendo solo Public location. Admin detalle sí devuelve campos. No actualizar SELECT público para exponerlos.
- [ ] P2 en seo.test: HTML/JSON-LD/metas/canonical/sitemap y rutas públicas no incluyen valores de dirección/código/promotor nuevos; los campos ya públicos se mantienen. Conservar reglas de caché/noindex y publicación actuales.
- [ ] L1 en listing-features/identity-api: nombre de casa con nombre de otra parroquia y código JE no alteran parish; parish manual gana como antes y road/location conservan extracción vigente. Guardar una dirección no confirma disponibilidad.
- [ ] Ejecutar `node --test tests/server/public.test.mjs tests/server/seo.test.mjs tests/server/listing-features.test.mjs tests/server/listing-import.test.mjs tests/server/listing-identity-api.test.mjs`. Las regresiones de privacidad/ubicación/importación pueden pasar inicialmente porque conservan contratos actuales: registrar ese PASS, sin provocar RED artificial. Los fallos nuevos de API/schema deben corresponder a los campos pendientes.
- [ ] Mantener proyección explícita sin nuevos campos; si la integración revela un fallback a raw row, corregirlo únicamente dentro de este alcance y reservar/revisar ese path antes de editar. No sanear automáticamente los textos públicos actuales ni modificar importadores.
- [ ] Repetir pruebas y comprobar PASS. Revisión específica de diff buscando concatenaciones a location/place o URLs externas.

### Task 4: Editor y validación completa

**Interfaces:** FIELDS/toForm/toBody/field/ctl existentes incorporan los textos y condición sin duplicar un control ya añadido por PUB-05. internalAddress alimenta solo preview interno. Link postal solo para Jersey, URL constante sin interpolación; noreferrer evita transmitir un referrer del panel. El hint de formato requiere country Jersey y código no vacío/normalizado válido, nunca vacío, inválido o extranjero.

- [ ] UI1/UI2 en e2e: editar/guardar/recargar/borrar/Discard de dirección/JE, Public location permanece independiente; normalización se confirma al guardar, cursor estable al escribir. New build muestra promotor; cambiar condición conserva valor y permite borrarlo. Blank postal no bloquea Save.
- [ ] UI3/UI4: 400 de postcode/country y 409 conservan borrador/foco/errores enlazados; texto con signos HTML se ve como texto; preview interno no omite el label Internal. En Jersey, hint solo con código no vacío válido; con vacío/inválido no aparece. En extranjero no aparecen hint ni enlace Jersey. Abrir enlace postal no construye URL con datos ni consulta automáticamente al teclear.
- [ ] Recorrido focal RED; implementar campos, hints y preview en Details usando componentes actuales. No duplicar condición, Save ni restricciones de Publish. Labels/hints D3–D7 en inglés, nativos y accesibles.
- [ ] Repetir recorrido a 1280/390 con teclado/foco/zoom 200 %, nombres largos, unknown/loading/error y Discard. Verificar endpoints públicos y vista de detalle después de guardar sin publicar nuevos campos.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release` y `npm run test:e2e` según cabecera vigente, solo fixtures locales y e2e:<hostId> reservado cuando se construya. Playwright MCP local 1280/390, consola/red/capturas; no cambiar sandbox/Turnstile/controles por fallos ambientales.
- [ ] Actualizar tareas PUB-04/PUB-05 y ESTADO/derivados bajo alcance revisado, regenerar renderer y comprobarlo. Mantener estado parcial de lo no construido. Revisión independiente del diff, corregir hallazgos y repetir checks afectados; commit final.
- [ ] Presentar SHA y comprobaciones; migración remota/push/despliegue solo con autorización específica y mecanismo vigente. Nada de este plan autoriza ese paso.

## Cierre de esta planificación

Validar enlaces/rutas, D1–D13/A1–A8, referencias postales y consistencia de errores/normalización. Revisión independiente documental, diff --check y renderer --check. Playwright no aplica a Markdown; no ejecutar tests de producto/build/e2e/migraciones ahora. Guardar spec/plan/ledger/relevo; no reservar, publicar ni registrar evidencia remota. El plan no queda bloqueado por tareas abiertas de otra sesión.
