# SAP-02 · Contadores de coincidencias en Applicants

Fecha: 8-nov-2026. Lista 1. Base comprobada: main `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`, GitHub consultado a las 13:45 UTC. Entrega exclusivamente documental; no autoriza construcción, migración ni publicación.

## Intención y decisión de Luis

El equipo debe reconocer desde Applicants cuántas viviendas siguen siendo candidatas, cuáles ha aprobado y cuáles tienen disponibilidad acreditada para esa búsqueda. Luis aprobó en esta sesión sustituir la expresión ambigua «found / confirmed / available» por **«12 found · 3 approved · 2 availability confirmed»**. No confundir preselección, aprobación, disponibilidad, presentación al cliente, visita o cierre de búsqueda.

Se recomienda una proyección de lectura sobre EST-13, manteniendo la tabla y el enlace actuales. Alternativas consideradas: reutilizar `shortlisted` o `listings.confirmed_at` sería pequeño pero acreditaría algo que esos campos no prueban; crear estados y automatizaciones dentro de SAP-02 duplicaría EST-13 y ampliaría el encargo. La opción elegida es consumir sus dimensiones independientes y sumar una sola vez por vivienda/búsqueda.

## Situación comprobada

- `admin/src/Applicants.jsx` presenta `found` y `shortlisted`, y muestra un guion si ambos son cero. Su GET se retrasa 200 ms y descarta respuestas de filtros antiguos; todavía no usa polling.
- `server/routes/applicants.js` calcula ambos campos y `fresh` en el CTE materializado `listed`. `found` significa estado técnico no revisado; no es un total inclusivo. QUEUE usa esos campos. La lista no tiene paginación.
- `migrations/0009_matches.sql` solo admite `found / shortlisted / rejected` y unicidad por aplicante/ficha. No existen aprobación independiente ni disponibilidad comercial con alcance.
- `listings.confirmed_at` también cambia al publicar o cambiar precio; no prueba respuesta comercial. Una visita confirmada tampoco prueba disponibilidad para otro hogar.
- Arquitectura §4.2/4.3/5.2 y reconciliación M06 exigen separar esas dimensiones y conservar consultas compartidas al resolver otra búsqueda.

## Alcance y dependencias

SAP-02 es un consumidor, no implementa EST-13, outreach, envíos, snapshots, caducidades comerciales ni agrupación de tarjetas de SAP-03. Sin migración propia prevista. No modifica ranking, recálculo, Stage, Queue, revisión, criterios, contactos ni relojes de retención.

El catálogo exige **EST-13 integrado** antes de construir. EST-13 conserva BUS-12, BUS-15, BUS-10 y EST-09 como dependencias. No simular evidencia ni convertir este documento en cierre de EST-13. Es posible preparar el plan ahora sin reservas ni credenciales. Su futura construcción exige revisar que la integración de EST-13 ofrece el contrato siguiente; si no lo ofrece, el productor debe adaptarlo y verificarse antes de iniciar SAP-02. No crear tablas ficticias ni un fallback a Shortlisted.

BUS-14 y SAP-01 no son nuevas dependencias funcionales. Sus borradores están en otras copias locales, no en este main. Si se integran antes, preservar paginación, progreso de búsqueda y `match_counts`; estos contadores nuevos son otro DTO, con otro significado. No copiar ni sobrescribir su trabajo durante esta planificación.

## Contrato de lectura requerido a EST-13

La interfaz propuesta para la integración es `matchSummaryFactsQuery({asOf: string}): {sql: string, args: unknown[]}` en `server/match-followup.js`, propiedad de EST-13. Devuelve una consulta SELECT parametrizada, sin escrituras, que se puede usar como CTE. `asOf` es UTC ISO capturado una vez por respuesta. Nunca procede del navegador. Si EST-13 elige otro nombre físico, resolverlo en un adaptador local de SAP-02 con esta misma interfaz, manteniendo las pruebas de contrato; no cambiar su dominio.

Cada fila contiene `applicant_id`, `property_key` (identidad canónica estable de vivienda y operación, no ID de anuncio), `candidate_current` (0/1), `approval_current` (0/1), `availability_current_for_search` (0/1) y `facts_valid` (0/1). Exactamente una fila por `(applicant_id, property_key)`, consolidada por el productor. La proyección cubre todas las relaciones candidatas e históricas que mantenga el dominio, aunque no tengan aprobación, consulta o evidencia; no usar INNER JOIN a esos registros opcionales que borre candidatas sin gestión. No PII, cuerpo de mensajes ni evidencia comercial en esta proyección. La consolidación resuelve anuncios duplicados, decisiones incompatibles y respuesta negativa posterior en EST-13; no se decide con MAX de confirmaciones históricas en SAP-02.

- `candidate_current=1`: relación candidata vigente para los criterios actuales, no excluida ni rechazada por el empleado. Incluye pendientes de evaluación y alternativas que el dominio mantenga como candidatas. No asegura cumplimiento completo.
- `approval_current=1`: aprobación humana explícita vigente para esa búsqueda y versión material. No traducir automáticamente una preselección histórica. Una revocación o cambio material la invalida según EST-13.
- `availability_current_for_search=1`: evidencia positiva, vigente a `asOf`, no revocada/sustituida, con propiedad, operación y alcance compatibles con esta búsqueda y, cuando corresponda, sus ocupantes. Una consulta general solo acredita lo que permita su alcance; aceptar un hogar no acepta otro. Las reglas de vigencia pertenecen a EST-13 y su política acordada, no a plazos nuevos de SAP-02.
- Una ausencia legítima de aprobación/evidencia equivale a 0. `facts_valid=0` señala datos incoherentes o imposibles de verificar, no una respuesta negativa ni una búsqueda sin resultados. Debe emitirse la fila inválida en vez de ocultarla. Un error de lectura lanza error, nunca un resultado vacío exitoso.
- Los filtros de archivado, exclusión y bajas de vivienda que afecten la vigencia pertenecen a esa proyección. El archivado administrativo de una ficha no equivale por sí solo a retirada comercial; no añadir aquí una regla que contradiga el inventario vigente.

## Agregación y API

Crear `server/match-summary.js`: `matchSummaryQuery({asOf}): {sql,args}` consume el contrato anterior y devuelve una fila por aplicante con `found_total`, `approved_total`, `availability_confirmed_total` y `invalid_facts`. Agregar después de consolidar, nunca unir directamente todos los mensajes, snapshots o anuncios. Una propiedad con dos consultas sigue contando una vez en cada búsqueda.

Para cada propiedad válida: found suma `candidate_current`; approved suma `candidate_current AND approval_current`; availability confirmed suma `candidate_current AND approval_current AND availability_current_for_search`. Son conjuntos anidados, **0 ≤ availability_confirmed ≤ approved ≤ found**. Aprobada pero no disponible sigue en found/approved mientras el dominio la conserve como candidata. No sumar las tres cifras como viviendas distintas.

GET `/admin/applicants` añade por fila:

```json
{"match_summary":{"version":1,"state":"ready","found":12,"approved":3,"availability_confirmed":2}}
```

`state` admite `ready / historical / unsupported / unverified`; los tres números son enteros seguros no negativos solo para ready, y null para los demás. `toMatchSummary(applicant, aggregate): MatchSummaryV1` aplica, por orden: categoría no residencial u operación no soportada -> unsupported; búsqueda no activa o archivada -> historical; agregado inválido/invariante rota -> unverified; resto -> ready. Una búsqueda residencial activa con lectura correcta sin filas produce los tres ceros. Paused comercial no resuelve una búsqueda: usar `search_state` y `archived_at`, no Stage.

Mantener `found`, `shortlisted`, `fresh` internos y QUEUE con su significado previo; no reemplazar su SQL por el nuevo total. Conservar los campos públicos existentes y cualquier `match_counts` integrado por SAP-01. No reutilizar `found` de primer nivel para el nuevo total. GET no modifica versiones, decisiones ni actividad del contacto.

Integrar la agregación como CTE/LEFT JOIN uno a uno dentro de la misma sentencia de lista, con los filtros existentes y binds en su orden. No consultar por fila ni calcular sobre la página de matches. Un solo snapshot de datos a `asOf` por respuesta. No añadir otro endpoint ni GET por vivienda. Un fallo de SQL devuelve el error API habitual; no informar ceros ni omitir silenciosamente el DTO.

## Presentación y actualización

En la celda Matches existente, enlace único `#/applicants/<id>/matches`, texto literal `12 found · 3 approved · 2 availability confirmed`, con nombre accesible que incluya al aplicante. Los ceros se muestran: `0 found · 0 approved · 0 availability confirmed`. Añadir una sola explicación visible sobre la tabla: «Found includes approved matches. Availability confirmed means current evidence covers this search.» No depender de tooltip ni del color. Mantener Shortlisted y sus acciones en la ficha; no rebautizar esos botones ni migrar su historial.

Historical: enlace «Historical matches», sin afirmar que siguen disponibles. Unsupported: texto «Manual review», sin contadores residenciales. Unverified o DTO ausente/desconocido/inválido: texto «Match counts unavailable» y conservar acceso «View matches». Datos numéricos corruptos no se convierten a cero. No inferir una búsqueda ejecutándose de un total cero; SAP-01 es responsable del progreso.

Extraer un helper puro `describeApplicantMatchSummary(summary): {state, text}` en `site/applicant-match-summary.js`, y componente `admin/src/ApplicantMatchSummary.jsx` con `{applicant}`. Validar versión, enum, tipos e invariante en el helper; nunca usar HTML de la API. El enlace usa exclusivamente el ID interno de la fila.

Pasar `paused={expired}` desde `admin/src/App.jsx` a `Applicants({paused=false})`, siguiendo Inbox. Invalidar generación y cancelar debounce al pausar o desmontar. Refrescar la lista con `usePoll` existente cada 30000 ms, solo visible, sesión activa y componente montado. Mantener debounce de filtros 200 ms; usar callback estable, una petición activa por generación, descartar respuestas de generaciones anteriores y evitar el GET inmediato adicional de usePoll. El primer tick pasa por el mismo debounce. El callback y el despacho tras200ms comprueban visibilidad y pausa, porque usePoll llama inicialmente incluso con la pestaña oculta. Filtro nuevo invalida la generación anterior; volver a la pestaña hace un refresco. No crear timers por fila. No modificar las preferencias del usuario ni reiniciar la fila enfocada con key nueva.

Primer fallo sin filas: error y botón «Reload applicants». Fallo posterior: conservar snapshot etiquetado «Could not refresh applicants. Showing the last loaded results.» y el mismo botón. No presentarlo como disponibilidad actual. Al cambiar filtros, mientras carga o si falla, indicar «Showing previous results while the selected filters load.» o el error equivalente; no rotular filas antiguas como pertenecientes a filtros nuevos. El éxito sustituye filas/contadores juntos. Reintentar solo repite GET. 401 sigue `hs:signed-out`; ninguna petición posterior a logout puede reponer datos. Un aviso live global anuncia el fallo o recuperación una vez, no cada cifra ni cada fila. Una actualización normal no mueve foco.

## Diseño aplicable y razón

Reading this as: lista operativa del equipo Hampton, identidad del panel existente, ENERGY 1 / RHYTHM 1 / MOTION 1. La tabla sigue siendo el foco; las cifras son información operativa, sin tarjetas de métricas decorativas.

Valores comprobados en CSS actual, distinguidos de propuestas históricas de DESIGN.md: ink #151515, paper #ffffff, mist #f4f3f0, line #e3e0da, stone #6b665e, bronze #a56b3d para foco/bordes y bronze-dk #86542d para texto pequeño/hover, ok #2f6b4f, err #a32020, warn-bg #fff6e5 y field-line #8f8a82. Mantenerlos por continuidad y contraste. No aplicar los antiguos tokens panel-bronze #8a6a3b ni el radio propuesto de 16px a toda la pantalla.

Tenor Sans/Georgia/serif en H1 26px y H2 19px, peso400; Montserrat/system-ui en cuerpo14px/1.5 y texto auxiliar12px. Tabla con celdas10px 12px, cabeceras12px/600, números tabulares. `.page` max1240px y padding24px 16px 120px; contenedores existentes radio14px, campos10px, botones999px; gaps8/12/16px. Preservar densidad porque el usuario compara muchas filas.

Permitir envolver cada segmento del contador sin romper palabras ni provocar scroll horizontal; quitar nowrap solo en esta celda si lo exige `.num`. Bajo760px conservar tarjetas con `data-label=Matches`, sin otra columna ni tarjetas anidadas. Link/petición de recarga: objetivo mínimo32px escritorio y44px móvil, foco2px con offset2px. Contraste texto4.5:1 y foco3:1. Teclado/200% zoom a1280 y390, cifras de hasta seis dígitos, nombre largo, error y estados alternativos. No nuevas fuentes, imágenes, bibliotecas o animaciones. Respetar reduced motion del panel.

## Seguridad, rendimiento y skills

Solo rutas admin existentes con sus permisos; no cambiar auth, CSRF, CSP, red o roles. Consultas parametrizadas; texto React sin dangerouslySetInnerHTML. Ningún nuevo almacenamiento local ni exposición de mensajes/evidencia/contactos en logs. No enviar al tablero público estos contadores por aplicante. Los fixtures futuros serán locales y ficticios.

`impeccable`: jerarquía de tabla, copy preciso, estados vacíos/error/foco. `security-best-practices` y `frontend-security-coder`: lectura autenticada, DTO mínimo, SQL parametrizado, render seguro y logout. `antislop`: diales1/1/1, cifras reales, sin adornos ni controles muertos. `web-performance-optimization`: agregación global sin N+1, una consulta por refresco, debounce existente, sin librerías ni polling oculto. `ponytail`: un agregador, un helper puro y un componente, sin nuevo gestor global de estados. `taste-skill`/`redesign-skill`: no aplica crear página ni rediseñar la existente. Runtime y recorrido visual se verificarán solo al construir; no se presentan como comprobados por esta entrega.

## Aceptación

A1. Encontradas incluye aprobadas, excluye rechazadas/excluidas según dominio; cada vivienda cuenta una vez por búsqueda/operación.
A2. 12/3/2 se muestra con las etiquetas aprobadas; cero correcto visible y enlace conserva Matches.
A3. Shortlisted, publicar, precio, anuncio web y visita nunca se usan por sí solos como confirmación comercial o aprobación.
A4. Caducidad, revocación, respuesta posterior y alcance de ocupantes alteran las cifras conforme a EST-13; ningún contagio entre búsquedas.
A5. Lista obtiene cifras globales con un snapshot, sin fanout, paginación de matches ni N+1; campos y Queue previos conservados.
A6. Inactivas/archivadas y comerciales no afirman disponibilidad viva. Ausencia/corrupción/fallo no se presenta como cero.
A7. Refresco visible30s, debounce200ms, respuestas tardías/filtros/error/401 coherentes y foco preservado.
A8. Reflow760, escritorio1280/móvil390, zoom200%, teclado, contraste y textos largos pasan en construcción.
A9. GET no escribe versiones, retención, estados ni evidencia. Auth y privacidad permanecen efectivas.
A10. Integración real de EST-13 y contrato verificado preceden código de SAP-02. Estado de producto permanece parcial hasta construcción y validación.
