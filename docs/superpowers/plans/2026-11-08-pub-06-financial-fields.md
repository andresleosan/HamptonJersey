> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-06 Financial fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegación de implementación solo con autorización aplicable.

**Goal:** Completar la familia económica de la ficha con costes opcionales, precio por pie² y premium más renta, reutilizando la fecha de SPR-01.

**Architecture:** Extender listings y su validación, extraer un módulo pequeño y puro de economía compartido con el panel, conservar guardado/auditoría y componer etiquetas de negocio sin sumar periodos distintos. La fecha se consume de SPR-01; la superficie interior mínima se comparte con PUB-05. Los costes nuevos permanecen en el panel; la etiqueta compuesta utiliza rent/premium que ya son públicos.

**Tech Stack:** React/JavaScript, D1/SQLite, node:test y Playwright existentes. Sin dependencias nuevas.

**Spec:** [Diseño PUB-06, D1–D12 y A1–A8](../specs/2026-11-08-pub-06-financial-fields-design.md). Propuesta preparada para revisión; el encargo actual solo produce documentos.

## Global Constraints

- Base inspeccionada `main` / `6d2f77922f797a1ffd6a23e2030308440ca81adf`, comprobada el 8-nov-2026; preservar estos documentos al reanudar y volver a verificar GitHub.
- Unidades monetarias mayores, moneda única GBP/EUR por ficha; costes nuevos `0 <= n < 1e10`, finitos y hasta 2 decimales, null desconocido. Precios antiguos conservan su validación positiva actual.
- Superficie interior positiva `<1e8` sq ft y hasta 2 decimales; no derivarla de texto libre ni terreno. Ratios no se almacenan ni redondean antes de presentar.
- Periodos month/year explícitos; sin conversión FX ni suma premium+renta. Ningún nuevo coste se convierte en requisito de Publish.
- Construir e integrar SPR-01 antes del tramo PUB-06: reutilizar `available_from` y sus pruebas; no añadirlo otra vez. PUB-05 reutiliza `interior_area_sqft` y conserva sus otros pendientes.
- No producto hasta scope exacto, revisión auténtica y modo build confirmado; `e2e:<hostId>` antes de usar fixtures/puertos compartidos. Publicación/migración remota requieren autorización separada.
- Migración propuesta `0033_listing_financial_fields.sql`, después de la de fecha de SPR-01. Confirmar número libre en la base de ejecución; si cambió, elegir el siguiente libre y revisar su path antes de editar. No modificar migraciones históricas.

## Review Focus

1. Cero conocido, null y decimales como 0.29: Task 1, V1 y API1; nunca rechazar 0.29 por una multiplicación binaria.
2. PUT parcial, periodo y moneda ausentes en fila fusionada: Task 1, V2/API2; validación antes de escritura.
3. Negocio con solo renta o componentes de periodos distintos: Task 3, F1/F2/SEO1; no alterar filtros ni publicar total falso.
4. Auditoría/no-op/conflicto y texto libre de suministros: Task 2, EV1–EV4; no copiar notas a events ni dejar una escritura parcial.
5. Precio por pie² sin área, precio o periodo; cambios de operación y fecha: Tasks 1/4, R1/UI1–UI4; conservar datos y no confirmar disponibilidad.

## Reglas concretas de DESIGN.md

Superficies: Price/Details del panel y el texto del precio público existente. Ninguna página nueva ni restyle. La nota EST-09 de Colors y CSS vigente prevalecen sobre el YAML histórico.

| Aspecto | Valores y aplicación | Verificación |
| --- | --- | --- |
| Paleta panel vigente | ink#151515, paper#fff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, bronze-dk#86542d, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. Bronce pequeño con bronze-dk, sin otro acento. | DESIGN Colors/nota EST-09 y estilos calculados. |
| Tipografía | Panel Montserrat/system-ui 14px/1.5, títulos Tenor Sans/Georgia/serif 26px para H1 y 19px para H2; labels 12px stone; metadatos 12px, cabeceras 12px/600 sentence case. Web conserva sus clases de precio y fuentes existentes. | DESIGN Typography y CSS body/h1/h2/label/.meta; no tipografía nueva. |
| Disposición | `.card` padding 24px/radio 14px; `.grid2` auto-fit minmax(220px,1fr), gap 12px; botones 10px 20px/píldora 999px; `.meta` flex-wrap gap 4px 12px. Área en Details; costes/ratios en Price. | DESIGN Spacing/Components y CSS vigente; no cards de relleno. |
| Responsive | Listas cambian a tarjetas bajo 760px con columnas 72px 1fr y gap 4px 12px; nuevo Price usa grid con controles sin ancho mínimo que cause overflow. Precio compuesto debe envolver también en tarjetas públicas y barra móvil. |1280/390 px y zoom 200 %; comprobar que +/periodo no quedan separados de su importe por recorte. |
| Campo/estados | Nativos number/text/select con etiqueta y hint; min 0/step 0.01 para costes y min 0.01/step 0.01 para área; mensajes de error por campo, aria-invalid/describedby; Save/Discard actuales, role=status/alert. | DESIGN Inputs/Dialogs, test de errores y foco. Hint de Price distingue precios positivos de costes que pueden ser 0. |
| Accesibilidad | Foco 2px bronze/offset 2px; contraste texto≥4.5:1, controles/foco≥3:1; teclado completo, zoom 200 %, sin animación nueva. Controles nuevos≥32px escritorio y 44px móvil (adopción explícita de la propuesta Densidad para este alcance). | Estilos calculados y recorrido MCP, incluir selects y campos con error. |
| Rendimiento/seguridad | Sin librería de dinero/fecha, fuentes, assets ni petición extra por campo. JSX escapado; HTML público vía esc; SQL parametrizado; validación server-side, sesión/CSRF y versiones actuales. No PII, secretos, tokens ni valores de nota en logs/localStorage. | DESIGN Requisitos verificables; diff, red y pruebas de 400/401/403/409. |

## Skills y decisiones que aportan

- `brainstorming`/`grill-me`: alternativas y D1–D12, cero frente a desconocido, periodos, FX, denominador y límites legales. Las propuestas no se presentan como aprobación de Luis.
- `writing-plans`: tareas por entregable con archivos, firmas, contratos y pruebas; ledger con evidencias reales.
- `impeccable`: densidad y jerarquía del editor, periodos al lado del importe, precio compuesto legible en móvil; conservar componentes Hampton.
- `security-best-practices`/`frontend-security-coder`: whitelist de campos, tipos finitos, no XSS en suministros, errores por campo y protección de notas en historial; sin ampliar exposición pública de costes nuevos.
- `antislop` durante el trabajo, modo ya elegido: cada control corresponde a un dato requerido; sin KPIs, adornos, fotos, claims de ahorro ni datos inventados; DESIGN da dirección.
- `web-performance-optimization`: cálculo puro de ratios en memoria, ninguna llamada de red por edición, sin dependencia nueva; registrar bundle y red en la construcción.
- `ponytail`: reutilizar moneda/guardado/fmtDayMonth, campos nativos y módulo puro enfocado; sin modelo contable, conversiones ni ratios persistidos.
- `taste-skill`/`design-taste-frontend`: no aplica, no página nueva. `redesign-skill`/`redesign-existing-projects`: no aplica, solo completar campos y etiquetas existentes.

## Mapa de archivos

| Archivo futuro | Responsabilidad |
| --- | --- |
| Crear `server/listing-economics.js` | ECONOMIC_FIELDS, economicValue y pricePerSqFt puros, sin DOM/red/secretos. |
| Modificar `server/listing.js` | Whitelist y validación de nuevos campos; checkPrice comprueba moneda/periodos sobre fila fusionada. No añadir costes a toPublic. |
| Crear `migrations/0033_listing_financial_fields.sql` | Siete columnas nuevas y recreación de triggers EST-18, sobre la versión que ya incluya available_from. |
| Modificar `admin/src/ListingEditor.jsx` | FIELDS/NUMERIC, inputs económicos, área compartida, business con rent/period, ratios y hints. |
| Modificar `admin/src/format.js`, `site/lib.js` | Etiqueta compuesta de business en panel y web, sin cambiar amount/filtros/comparables. |
| Modificar `server/routes/listings.js` solo si pruebas muestran necesidad | Mantener rutas/guardado y SELECT de listado suficientes para componentes ya existentes; nuevos costes se consumen del detalle l.*. No cambiar confirmed_at por costes auxiliares. |
| Modificar `server/seo.js` | Título con precio compuesto; omitir offers estructurado business con renta, conservar el resto. |
| Modificar `site/index.html`; `admin/src/styles.css` solo si lo requiere el reflujo | Obligatorio: corregir guard del título al navegar a business con solo renta, sin depender de amount() para ese texto. Ajustar texto/controles solo si desbordan. |
| Crear `tests/server/listing-economics.test.mjs`, `tests/server/listing-financial-fields.test.mjs`, `tests/server/listing-price-format.test.mjs` | Validación, ratios, API/transacciones y formateador admin. |
| Modificar `tests/server/listing.test.mjs`, `tests/server/listing-events.test.mjs`, `tests/lib.test.js`, `tests/server/seo.test.mjs`, `tests/e2e.cjs` | Regresiones de whitelist, historial, formatos, SEO y flujo completo. Test de SEO existente confirmado. |
| Modificar tareas `PUB-06`, `PUB-05`, `SPR-01`, ESTADO y derivados canónicos al construir | Registrar campo compartido y estado real, regenerar renderer; no completar PUB-05 ni una integración todavía pendiente. |

### Task 1: Schema, valores económicos y ratios

**Interfaces:** `ECONOMIC_FIELDS = ['rental_deposit','parish_rates','parish_rates_period','service_charge','service_charge_period','utilities_included','interior_area_sqft']`; `economicValue(key,value): number|string|null` normaliza vacío, valida y lanza Error con mensaje de campo. `pricePerSqFt(row): {sale:number|null,rent:number|null,premium:number|null}` calcula solo componentes activos de la operación; rent exige periodo conocido y todos exigen moneda/área válidas. Retorna sin redondear; UI lo formatea a 2 decimales. Mantener las firmas validateListing/checkPrice existentes.

- [ ] Verificar integración previa de SPR-01 y su migración/available_from; reservar paths de código/pruebas/documentos exactos y obtener revisión/transición build. Si falta la integración, conservar esta planificación y ejecutar primero SPR-01 en su reserva propia.
- [ ] V1 en listing-economics.test: para cada nuevo importe aceptar null/blank→null, 0, 0.29, 1250.50; rechazar -1,1.001,1e10,NaN/Infinity y tipos string numérico/array/object/bool. Validar área positiva y hasta 2 decimales, periodos cerrados, texto utilities≤1000 después de trim y tipo text real. Mensajes de D1/D2 o campo específico, sin valores en logs.
- [ ] R1: D6 produce ratios 500,1.5,18,12.5+1.5 en campos separados; sin área/moneda/precio/periodo devuelve null para ese componente; ignores sale_price de una ficha business, premium de una sale y valores malos sin NaN/Infinity.
- [ ] API1/API2 en listing-financial-fields.test: POST opcional, PUT parcial conserva, null borra,0 recarga como 0; invalid period/missing currency sobre fila fusionada→400 sin escritura. Campos nuevos no aparecen en toPublic; GET detalle los conserva. Errores sin sesión/CSRF y versión vieja mantienen rechazo actual.
- [ ] Ejecutar `node --test tests/server/listing-economics.test.mjs tests/server/listing-financial-fields.test.mjs tests/server/listing.test.mjs`; comprobar RED por módulo/columnas ausentes.
- [ ] Crear migración con siete columnas nullable sin backfill. Implementar módulo puro y whitelist/checkPrice: para 2 decimales usar igualdad con `Number(n.toFixed(2))` tras comprobar tipo/finito/rango, no `Number.isInteger(n*100)` que falla para 0.29. Área comparte columna con PUB-05; reutilizar si ya existe bajo el mismo contrato, sin duplicar.
- [ ] Repetir comando y comprobar PASS; verificar rent/premium positivos y el comportamiento de campos omitidos existentes. Commit acotado de schema/API/tests, no publicar la entrega parcial antes de completar auditoría.

### Task 2: Auditoría atómica

**Interfaces:** conservar formato de eventos EST-18, contexto, revision, listingClock y afterSave. Nuevos campos numéricos/periodos en before/after; utilities solo en fields/changed, siguiendo la política de texto libre existente.

- [ ] EV1: crear, editar y borrar importes/periodos/área produce before/after/fields reales; editar utilities registra campo, nunca contenido. Preservar evento de available_from ya integrado.
- [ ] EV2: guardado no-op,400 y409 no crean eventos; coste auxiliar/área/utilities no modifica confirmed_at; modificar rent/premium conserva la regla vigente de confirmación y el recálculo existente.
- [ ] EV3/EV4: fallo sintético del evento revierte importe y updated_at; migrar base poblada con fecha/historial previos conserva listings/events/notificaciones, FKs e integrity_check.
- [ ] Ejecutar `node --test tests/server/listing-events.test.mjs tests/server/listing-financial-fields.test.mjs`; observar RED de auditoría ausente.
- [ ] En la misma migración nueva recrear listing_event_insert/update a partir de la versión posterior a SPR-01, incorporando siete campos según política de D11. No tocar 0029 ni perder la fecha o campos previos. No copiar utilities en before/after.
- [ ] Repetir comando, PASS y revisión comparativa de cuerpos/triggers. Commit de auditoría y regresiones; sin migración remota.

### Task 3: Etiqueta de negocio y SEO coherentes

**Interfaces:** priceText recibe shape admin snake_case; priceLabel recibe shape pública camelCase. Firmas actuales intactas. Mantener amount() como premium en business; la etiqueta puede mostrar renta conocida aunque premium sea null. listingMeta decide texto por componentes existentes y omite `ld.offers` para business con renta.

- [ ] F1/F2 en tests/lib.test.js y tests/server/listing-price-format.test.mjs: D7 para mensual/anual, GBP/EUR, premium solo, renta sola y ninguno; precio 0/NaN inválido no se presenta como dato válido. Conservar regresiones de amount/matches/comparables y el fallback actual de cada superficie.
- [ ] SEO1 en test SEO: título contiene premium+renta o renta sola; JSON-LD business con renta no contiene Offer.price compuesto ni offers, no suma; casos sale/rent/business solo premium conservan contrato. Canonical/robots/noindex sin cambios.
- [ ] Ejecutar `node --test tests/lib.test.js tests/server/seo.test.mjs tests/server/listing-price-format.test.mjs`; comprobar RED de etiqueta compuesta.
- [ ] Implementar ramas business de priceText/priceLabel y SEO de D9. En site/index.html sustituir el guard amount(p)==null del título por detección de componentes activos de precio, conservando las demás operaciones. Mantener escape de JSX/HTML, filtros, periodos guardados y proyección pública sin costes nuevos.
- [ ] Repetir pruebas, PASS; commit de presentación/SEO y tests.

### Task 4: Editor y recorrido completo

**Interfaces:** FIELDS/NUMERIC y helpers toForm/toBody existentes gestionan vacío/null/número. economicValue no reemplaza servidor por validación de cliente; pricePerSqFt se usa sobre valores numéricos válidos del borrador para mostrar resultados y vacío cuando no se puede calcular.

- [ ] UI1/UI2 en e2e con fixtures: guardar 0 y 0.29 en costes, recargar/borrar, depósito para alquiler/business, periodos vacíos y moneda faltante con error por campo; errores 400/409 conservan borrador y Discard restaura fila guardada.
- [ ] UI3/UI4: business edita premium y renta juntos; cambiar operación conserva campos ocultos; ratios cambian al editar precio/área y desaparecen sin área. Fecha/confirmed_at siguen independientes. Utilities con signos HTML se ve como texto y no aparece públicamente ni en before/after del evento. Navegar desde catálogo a business con renta y sin premium: document.title contiene renta/periodo y coincide con listingMeta.title del fixture, también tras volver y reabrir.
- [ ] Recorrido focal RED por campos ausentes; implementar controles/hints y ratios de Price y el campo interior en Details. Hint cambia a `Leave unknown values blank. Sale price, rent and premium must be above 0; other costs can be 0.` + moneda sin conversión. No crear otro input de available_from ni otro botón Save.
- [ ] Repetir recorrido, PASS a 1280 y 390. Comprobar etiquetas/hints/errores enlazados, foco visible, teclado, zoom 200 %, precio compuesto envolviendo en web/panel/barra móvil, loading/error y vacíos honestos.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release`, `npm run test:e2e` con la cabecera vigente/fixtures locales. Playwright MCP a 1280/390: guardar/recargar/borrar/Discard/400/409, ratios/negocio y consola/red. Capturas del taller en `/home/taller/encargos/capturas`; fuera, carpeta local de evidencias propia. No desactivar protecciones para pasar pruebas.
- [ ] Reservar y actualizar ESTADO y tareas canónicas PUB-06/PUB-05/SPR-01, regenerar catálogo/checklist/reparto/work-units y ejecutar `node scripts/render-roadmap.mjs --check`. Si BUS-21 sigue reteniendo esos documentos, coordinar relevo/turno sin editarlos fuera de alcance. Registrar no implementado/no publicado donde corresponda y mantener PUB-05 parcial.
- [ ] Revisión independiente y corrección de hallazgos; commit final revisado. Publicar y migrar solo con autorización del SHA y mecanismos vigentes; no usar revisión del plan como permiso de despliegue.

## Cierre de la planificación actual

Verificar enlaces, rutas, D1–D12/A1–A8 y consistencia de firmas/unidades. `git diff --check` y renderer--check. Playwright no aplica a los documentos; pruebas de producto/build/migraciones quedan para ejecución. Tras revisión documental auténtica, registrar design y complete en modo plan, conservando archivos y sin declarar la ficha construida. Evitar submit de archivos en plan mientras el servidor lo rechace; nunca falsear changedPaths.
