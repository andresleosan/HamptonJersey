> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-05 Physical fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No delegar implementación sin autorización aplicable.

**Goal:** Completar características físicas editables y preservar correcciones manuales frente a extracción y recálculo, con superficie única compartida con PUB-06.

**Architecture:** Añadir columnas físicas tipadas y un objeto estricto feature_overrides. El extractor común calcula la proyección efectiva feat_* y la certeza que ya consume REG-08, sin cambiar criterios. Integrar campos en una sección del editor y extender triggers EST-18 con una migración nueva, conservando la proyección pública.

**Tech Stack:** JavaScript/React, Cloudflare Pages/D1/SQLite, node:test y Playwright existentes; sin paquetes ni infraestructura nuevos.

**Spec:** [PUB-05 · decisiones D1–D14 y A1–A8](../specs/2026-11-08-pub-05-physical-fields-design.md). Estado: propuesta técnica lista para revisión; este encargo solo redacta documentos.

## Global Constraints

- Base inspeccionada main/HEAD/GitHub `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`, verificada el 8-nov-2026. Preservar documentos de este plan y verificar remoto al reanudar.
- Planificación local sin init/credenciales/API/reserva; no scope/watch/submit/complete ni evidencia remota en este encargo. La copia contiene solo sus documentos nuevos.
- Construcción futura: orden propuesto SPR-01 →PUB-06 →PUB-05 por fecha/superficie compartidas. Confirmar integración real, revisar alcance exacto de producto/pruebas/docs y solicitar claim build según contrato vigente. La planificación no espera integración.
- interior_area_sqft única y hasta 2 decimales; m²= sqft×0.09290304 con 2 decimales solo al mostrar. Sin segunda columna ni conversiones de ida/vuelta.
- Datos opcionales, null desconocido; flags0/1/null; listas null/[] distintas; feature_overrides ausente/clave null/valor distinguidos con Object.hasOwn. No coerción de strings/bools/arrays desconocidos.
- Solo datos de equipo vía rutas admin, sesión/CSRF/versiones actuales. Fuente queue no inserta overrides no vacíos como manuales. Nunca relajar autenticación o validación para importar datos.
- Migración propuesta `0034_listing_physical_fields.sql` después del contrato de superficie de PUB-06. Confirmar número libre y path revisado al construir; no sobrescribir 0032/0033 ni otra migración. No cambiar 0029 histórica.

## Review Focus

1. Manual conocido, desconocido y reset frente a description/specs/recalc: Task 2,F1–F4 y Task 3,API2.
2. Valor efectivo y certeza REG-08 contradictorios: Task 2,M1–M3; exact parking/conditional pets y patio/terraza nunca se contradicen.
3. Ceros, listas vacías, flags y plantas incompletas: Task 1,V1/V2/API1; no convertir ausencia en afirmación.
4. Imports que aparenten confirmación manual y errores con cola ocupada: Task 3,Q1; preservar recuperación y whitelists.
5. JSON/eventos, no-op/409 y fallos de evento: Task 4,EV1–EV4; UI y matching nunca ven una escritura parcial.

## Reglas exactas de DESIGN.md

Superficie: panel existente, nueva sección interna Physical details. Se conserva la identidad/jerarquía; no es página nueva ni restyle. Tomar la nota EST-09 y CSS vigente, no los valores obsoletos de la cabecera YAML.

| Aspecto | Valores aplicables y procedencia | Verificación futura |
| --- | --- | --- |
| Colores vigentes | ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, bronze-dk#86542d, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. DESIGN Colors, nota EST-09, styles.css:root. | Estilos calculados; bronce pequeño con bronze-dk, sin color adicional. |
| Tipografía | Montserrat/system-ui 14px/1.5; H1 Tenor Sans/Georgia/serif 26px y H2 19px/peso 400; etiquetas 12px stone, metadatos 12px; sentence case. DESIGN Typography y CSS actual. | Comparar sección nueva con Details y Price. |
| Componentes/espacio | `.card` radio 14px/padding 24px; `.grid2` auto-fit minmax(220px,1fr), gap 12px; `.field`, `.btn` 10px 20px/píldora 999px, `.actionbar` existentes. Separar grupos por contenido, no tarjetas por cada dato. | Layout 1280/390; no navegación o Save duplicados. |
| Responsive/controles | Contenedores min-width:0 cuando lo requieran labels; grupos refluibles sin ancho fijo. Campo nativo number/select/checkbox; Unknown explícito y campo [] requiere acción `None`, no ausencia de selección. |390px/zoom 200 %, teclado y lector de labels. Nuevos controles≥32px escritorio,44px móvil (adopción explícita de propuesta Densidad). |
| Foco/errores | Foco 2px bronze con offset 2px; aria-invalid/describedby por campo; `role=alert` para fallo y `role=status` para éxito. Borrador y modo manual se conservan ante 400/409. | DESIGN Requisitos verificables; contraste texto≥4.5:1 y foco/controles≥3:1; primer error accesible. |
| Vacío/carga/movimiento | Unknown/Not known honestos; loading/error actuales; Discard revierte todo. Sin animación nueva; respetar reduced-motion global. | Estado inicial, red lenta,401/400/409 y navegación. |
| Rendimiento/seguridad | Extracción una vez al guardar/recalc, nunca regex nueva por cada candidato. Ratios/conversión en memoria; sin fuente/lib/imagen/nueva petición por campo. JSX escapado, no dangerouslySetInnerHTML, SQL parametrizado, nada personal en localStorage/logs. | DESIGN Performance/Seguridad, diff, bundle/red y tests. |

Las propuestas genéricas de una nueva rejilla Properties, paleta o skeleton no se adoptan. Solo la densidad táctil indicada se adopta explícitamente para los controles nuevos.

## Aportación de skills

- Brainstorming/grill-me: alternativas, autoridad manual, cuatro formas de desconocido, superficie compartida, proveniencia y concurrencia resueltas en D1–D14; sin presentar propuesta como aprobación.
- Writing-plans: rutas, firmas, contratos de cada tarea y pruebas con resultados observables.
- Impeccable/adapt: controles por grupos, etiquetas/hints, reflujo y modo From text/Manual/Unknown visibles; prevalecen números de Hampton.
- Security-best-practices/frontend-security-coder: objeto/arrays estrictos, whitelist, fuente manual auténtica, SQL parametrizado y texto escapado; no exponer overrides nuevos públicamente.
- Antislop durante el trabajo según decisión vigente: cada control cubre PUB-05, sin decoración/datos/claims inventados, no assets ni asistente de instalación.
- Web-performance-optimization: mantener features precalculadas y evaluación de candidatos barata; SELECT de recalc acotado, no consulta adicional por match ni dependencia nueva.
- Ponytail: conservar campo de superficie/funciones existentes y limitar excepciones a cuatro características; sin segundo motor de matching ni normalizar todos los datos históricos por conjetura.
- Taste-skill/design-taste-frontend y redesign-skill/redesign-existing-projects: no aplican, no se crea página ni se rehace pantalla.

## Archivos de la construcción futura

| Archivo | Responsabilidad |
| --- | --- |
| Crear `server/listing-physical.js` | Registro/validación física, normalización de overrides, conversión sqft→m² y aplicación pura de excepciones. Sin DOM/red ni dependencias de rutas. |
| Modificar `server/listing.js` | EDITABLE y validación; checkPhysical sobre fila fusionada; conservar contrato de área PUB-06 y toPublic sin campos nuevos. |
| Modificar `server/listing-features.js` | Aplicar override validado al final de extractFeatures; conservar extracción automática de otras claves/parroquia/tipo. |
| Modificar `server/routes/listings.js` | Validación cruzada, carga JSON del detalle, fuente queue y guardado existente; sin confirmar disponibilidad por físico. |
| Modificar `server/routes/matches.js` | SELECT de recalcListings incluye feature_overrides; misma guardia de versión y escritura de proyecciones. |
| Crear `migrations/0034_listing_physical_fields.sql` | Nuevas columnas/JSON default y recreación de triggers posterior a campos ya integrados. |
| Crear `admin/src/ListingPhysical.jsx`; modificar `admin/src/ListingEditor.jsx` | Sección interna reusable, campos/mapa de overrides en form y body, labels/mensajes, nav y Discard/errores actuales. |
| Modificar `admin/src/styles.css` solo si se necesita | Ajustes locales de reflujo/target táctil; no restyle global. |
| Crear `tests/server/listing-physical.test.mjs`, `tests/server/listing-physical-api.test.mjs` | Validación, conversión, overrides y flujo de API. |
| Modificar `tests/server/listing-features.test.mjs`, `tests/server/requirements-matching.test.mjs`, `tests/server/match-hooks.test.mjs`, `tests/server/listing-events.test.mjs`, `tests/server/listing.test.mjs`, `tests/server/queue.test.mjs`, `tests/e2e.cjs` | Extracción, matching viejo/nuevo, recálculo, historial, queue y regresiones de interfaz. Ruta de queue test comprobada en la base inspeccionada. |
| Actualizar tareas PUB-05/PUB-06, ESTADO y derivados al construir | Estado real y campo único; regenerar con renderer y reservar paths antes de código/generación. No editar roadmap general en este encargo solo documental. |

### Task 1: Datos físicos y superficie compartida

**Interfaces:** `PHYSICAL_FIELDS` enumera solo campos nuevos propios y no duplica el área registrada por PUB-06. `physicalValue(key,value): number|string|null` normaliza a valores DB o lanza Error de campo; `checkPhysical(row): Record<string,string>` valida plantas sobre la fila fusionada. `squareMetres(sqft:number|null): number|null` devuelve el producto sin redondear, o null si no hay dato válido. `normalizeFeatureOverrides(input): object` valida y canoniza; null top-level →{}, omisión se gestiona antes de llamarlo. Arrays válidos se deduplican y ordenan según el registro; valores fuera de enum se rechazan.

- [ ] Verificar integración del área única, número libre de migración y base actual. Obtener alcance revisado/reserva build antes de código. Si falta PUB-06, conservar este plan y construir su mínimo en su tarea; nunca construirlo como requisito para redactar documentos.
- [ ] V1 en `listing-physical.test.mjs`: aceptar enteros en límites, flags 0/1/null, listas null/[]/selección, year 1/9999 y property_condition existing distinto de null/good. Rechazar fracciones en enteros, valores fuera de rango, NaN/Infinity y tipos incorrectos. Probar claves/enum extra en overrides, strings incluso vacíos, objeto en lugar de lista y arrays en lugar de objeto. Override top-level null se canoniza a {}. Fijar mensajes; lista repetida se deduplica canónicamente.
- [ ] V2: floor 0/building 1 válido; floor 1/building 1 inválido; basement -1/building 1 válido; datos parciales se conservan. Área 1000 →92.90304 m² sin redondear y 92.90 visibles; null/0/inválido produce null. Las representaciones canónicas no cambian por reordenar claves.
- [ ] API1 en `listing-physical-api.test.mjs`: crear omitidos/valores, actualizar parcial, borrar, recargar flags/0/listas/override. Detalle devuelve JSON parseado; toPublic no añade campos. Error de plantas/tipo →400 sin escritura; sesión/CSRF mantienen los rechazos actuales.
- [ ] Ejecutar `node --test tests/server/listing-physical.test.mjs tests/server/listing-physical-api.test.mjs tests/server/listing.test.mjs`; observar RED por módulo/columnas ausentes.
- [ ] Crear columnas nullable/default {} y checks básicos en migración nueva. Implementar registro/validación y checkPhysical tras fusionar la fila. Reutilizar validación de área PUB-06 y property_condition con PUB-04 futura. Normalizar feature_overrides antes de blank general: null de API persiste como texto '{}', no como NULL. loadListing parsea listas/mapa; persistencia serializa JSON. El extractor admite objeto interno o JSON de DB, pero API de entrada rechaza strings JSON; no confundir fronteras.
- [ ] Repetir el comando y comprobar PASS. Commit acotado de schema/validación/tests; no publicar entrega parcial antes de completar la auditoría.

### Task 2: Proyección manual y certeza

**Interfaces:** `applyFeatureOverrides(automatic,overrides): effective` recibe columnas derivadas actuales y un objeto validado. Devuelve el mismo shape con feat_* y feat_evidence coherentes, sin campos físicos adicionales ni escritura de feature_overrides. Vive en el módulo físico puro; extractFeatures lo importa sin ciclo con listing.js. Antes de llamarlo, extractFeatures obtiene overrides desde objeto interno o JSON de DB y usa {} solo cuando el campo está ausente. Datos internos corruptos no se convierten silenciosamente en automático.

- [ ] F1/F2: texto No pets + manual yes →feat_pets yes/facts yes; manual null →null/facts unknown; quitar la clave vuelve a no del texto actual. Probar furnished igual; automático part-furnished sigue unknown.
- [ ] F3/F4: parking manual 0/1/2/null produce kind exact/unknown; cambios de texto/recalc lo conservan. Outdoor patio yes + terrace no →legacy terrace yes; ambos no →no; unknown+no →unknown. Mapa parcial normaliza a unknown; otro override conserva certezas de claves ajenas, parish y type.
- [ ] M1–M3 en `requirements-matching.test.mjs`: must parking 2 con manual 1 →fails y con 2 →meets; manual unknown →pending; pets manual no no pasa por score. Garden y patio no se confunden. El legado conserva sus reglas; separate_wcs no incrementa bathrooms y los campos nuevos no satisfacen requisitos libres.
- [ ] Ejecutar `node --test tests/server/listing-physical.test.mjs tests/server/listing-features.test.mjs tests/server/requirements-matching.test.mjs`; comprobar RED por prioridad/evidencia ausentes.
- [ ] Aplicar helper al final de extractFeatures, preservando `_requirements.version=1` y certezas no afectadas. Evidencia fija `Set by staff`, sin PII. Mapear exterior a códigos legacy y no permitir escritura directa de feat_* desde API. Probar filas DB y filas parseadas para evitar doble JSON.parse o pérdida de manuales al editar solo otro campo.
- [ ] Repetir pruebas, PASS y commit de proyección/tests. No cambiar pesos, criterios, prioridades, filtros ni requisitos nuevos del motor.

### Task 3: Escritores, recálculo y fuentes

**Interfaces:** createListing/loadListing/update mantienen rutas y control updated_at. recalcListings añade feature_overrides al SELECT y sigue guardando solo proyecciones con su guardia de versión, sin modificar updated_at ni el objeto humano. Fuente queue no admite overrides no vacíos; panel autenticado sí. Mantener afterSave/recomputeForListing.

- [ ] API2 en `listing-physical-api.test.mjs` y `match-hooks.test.mjs`: crear overrides por panel, editar texto/precio/físicos, recargar y Recalculate all; objeto humano, valores y certeza sobreviven. Reset {} usa texto reciente, no el inicial. Editar solo físico no modifica confirmed_at; precio/disponibilidad conservan su regla.
- [ ] Q1 en `queue.test.mjs`: body con override no vacío recibe error feature_overrides; la cola vuelve a ready y queda sin listing, sin bloqueo ni falso éxito. Omitido/{} permite borrador válido; property.txt no gana claves nuevas. Usar fuente y datos sintéticos, sin respuestas externas aprobatorias simuladas.
- [ ] Ejecutar `node --test tests/server/listing-physical-api.test.mjs tests/server/match-hooks.test.mjs tests/server/listing-import.test.mjs tests/server/queue.test.mjs`; observar RED por SELECT/límite de fuente ausentes.
- [ ] Añadir el campo al SELECT de recalcListings y resolver proyección siempre en extractFeatures común. Rechazar overrides de queue antes de insertar listings; conservar la recuperación actual de la ruta queue para respuestas no 201. No cambiar importadores ni controles/versiones.
- [ ] Repetir pruebas, PASS y commit de escritores/regresiones. No introducir criterios nuevos de matching al guardar características.

### Task 4: Historial y migración completa

**Interfaces:** formato EST-18, actor/context/revision/listingClock/batch actuales. Campos físicos nuevos y feature_overrides van a before/after tipados; feat_* siguen siendo proyección derived. La migración parte de los triggers de la base ya integrada, conservando fecha/costes previos.

- [ ] EV1/EV2: crear/cambiar/borrar flags, conteos, listas y override produce JSON tipado; 0/null/[] son distintos. Objeto igual con otro orden no agrega evento. 400/409 no agregan eventos y el borrador conserva correcciones.
- [ ] EV3/EV4: fallo sintético del evento revierte físico+override+proyección+updated_at y limpia contexto. Migrar base poblada conserva listings/events/notifications, FKs, integrity_check, fecha y economía previas.
- [ ] Ejecutar `node --test tests/server/listing-events.test.mjs tests/server/listing-physical-api.test.mjs`; comprobar RED de campos ausentes en auditoría.
- [ ] Recrear triggers insert/update en la migración nueva con todas las claves y json() para listas/mapas. Conservar política de texto libre de EST-18; no modificar 0029 ni inventar historia retrospectiva de datos desconocidos.
- [ ] Repetir pruebas, PASS y comparar cuerpos con los originales para detectar pérdidas. Commit acotado, sin aplicación remota.

### Task 5: Sección física y validación del flujo

**Interfaces:** `ListingPhysical({form,field,ctl,onOverrideChange,effective})` usa wrappers existentes. effective recibe el listing guardado para mostrar valores `From text (last saved)`; no duplicar extracción en el cliente. `onOverrideChange(feature,mode,value)` modifica solo la clave indicada, clonando mapas/listas sin mutar data.listing; toBody envía objeto completo canónico. toForm/toBody convierten JSON/flags sin null→0 ni desconocido→[]. Modos de listas/override incompletos son borrador, no datos persistidos; validarlos antes de Save e incluir su cambio/error en unsaved/dirty. Discard restaura también esos modos.

- [ ] UI1/UI2 en e2e: sección Physical details y anchors/prepub IDs conservados; 0 aseos y No/Unknown distintos; calefacción/comodidades Unknown/None/selección; guardar/recargar/borrar/Discard. Área muestra m² sin mutar sqft al guardar otro dato y no se duplica en Price.
- [ ] UI3/UI4: modos From text/Manual/Unknown, editar descripción contradictoria, guardar/Recalculate all y reset; matching mantiene valores/certeza. Error 400/409 conserva datos/modos. En Select values, quitar la última casilla muestra el error exacto de D14 y bloquea Save hasta escoger algo o Unknown/None. Manual sin valor válido también bloquea Save; ninguno se serializa silenciosamente como null/[]. Cambiar operación conserva datos ocultos y Discard restaura valores/modos.
- [ ] Recorrido focal RED; implementar sección moviendo Type/Bedrooms/Bathrooms con los mismos IDs. Controles nativos con labels/hints/error, grupos por contenido y un solo Save. Discard restaura overrides, listas, área y campos ocultos.
- [ ] Repetir recorrido, PASS a 1280/390, teclado/foco, zoom 200 %, reduced motion y estados vacío/carga/error. Reservar e2e:<hostId> solo cuando haya encargo de construcción; fixtures locales exclusivos, sin producción.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release` y `npm run test:e2e` según cabecera vigente. Playwright MCP local 1280/390 con flujo completo, consola/red y capturas; registrar bloqueos sin relajar sandbox, Turnstile o permisos.
- [ ] Actualizar ESTADO/tareas PUB-05/PUB-06 y derivados con renderer tras reservar esos paths en construcción. Confirmar área única y estado real, sin completar campos no construidos. Revisión independiente del diff, corrección y repetición de checks afectados; commit final concreto.
- [ ] Comunicar SHA y evidencias revisadas; migración remota/push/despliegue solo con autorización específica y turno válido. No ejecutar ese paso durante planificación.

## Validación y cierre del plan local

Comprobar enlaces, rutas, D1–D14/A1–A8 y cobertura de desconocidos. Revisión documental independiente; renderer --check y diff --check. Playwright no aplica a Markdown; no ejecutar tests de producto o migraciones en este encargo. Guardar spec/plan/ledger/relevo sin reservar ni atestar diseño remoto. Estos documentos no conceden permiso de construir ni acreditan datos publicados.
