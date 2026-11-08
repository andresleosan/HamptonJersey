# SAP-02 · Applicant match summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Independent product work needs its own authorization and build reservation; this delivery is planning only.

**Goal:** Mostrar en Applicants candidatas vigentes, aprobaciones humanas y disponibilidad acreditada mediante contadores distintos y verificables.

**Architecture:** Consumir la proyección de hechos vigente de EST-13, agregar una vez por búsqueda/vivienda/operación y añadir un DTO a la lectura actual de Applicants. Mantener los contadores históricos usados por Queue y renderizar el nuevo resumen con un helper puro. Refrescar la lista con el polling existente sin N+1 ni respuestas fuera de contexto.

**Tech Stack:** JavaScript ESM, Cloudflare Pages Functions/D1, React, CSS existente, node:test y Playwright locales; sin paquetes nuevos.

**Spec:** [Diseño y decisiones](../../superpowers/specs/2026-11-08-sap-02-match-summary-design.md).

## Global Constraints

- Lista1, código SAP-02. Luis aprobó «found · approved · availability confirmed». Found incluye approved, availability confirmed es subconjunto de approved. No traducir automáticamente Shortlisted a aprobación ni listings.confirmed_at a disponibilidad comercial.
- EST-13 integrado y contrato comprobado antes de código. Sus dependencias BUS-12/BUS-15/BUS-10/EST-09 permanecen vigentes. Esta entrega no implementa ni cierra esas tareas. Planificación local sin reservas.
- Conservar main y los cambios ajenos. Antes de construir verificar GitHub, revisión de alcance y reserva build. Reservar los paths y recursos mínimos del catálogo; coordinar e2e del host. Sin push, migración o publicación por efecto de este plan.
- `matchSummaryFactsQuery({asOf}) -> {sql,args}` procede de EST-13; la consulta normalizada produce una fila por applicant_id/property_key y candidate_current, approval_current, availability_current_for_search, facts_valid. No almacenar otra copia de estados; no migración propia prevista.
- Cada GET usa un único asOf UTC del servidor y un snapshot SQL. Números enteros seguros; 0 ≤ availability_confirmed ≤ approved ≤ found. Historical/unsupported/unverified llevan null, no ceros falsos. GET nunca escribe actividad, versiones ni eventos.
- Preservar found/shortlisted/fresh/Queue existentes y match_counts/search_progress si SAP-01 se integró. El resumen nuevo se llama match_summary; no depende de la página de Matches. No modificar ranking BUS-14 ni grupos SAP-03.
- CSS actual: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, bronze-dk#86542d, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. No aplicar antiguos tokens del panel ni ampliar la paleta.
- Tenor Sans/Georgia/serif H1 26px/H2 19px peso400; Montserrat/system-ui cuerpo14px/1.5, auxiliar12px, cabeceras12px/600. Tabla10px 12px/celda, cifras tabulares, gaps8/12/16px; page max1240px, padding24px 16px 120px; radio14/10/999px según contenedor/campo/botón.
- Tabla actual y tarjetas bajo760px. Link/recarga mínimo32px escritorio y44px móvil; foco2px/offset2px, texto4.5:1/foco3:1, teclado/zoom200%, revisión1280/390. Sin nowrap global en esta celda, fuentes/imágenes/librerías/animaciones nuevas. ENERGY1/RHYTHM1/MOTION1.
- Admin autenticado existente, SQL parametrizado, DTO sin mensajes/evidencia/PII añadida; texto React, sin HTML inyectado ni localStorage nuevo. No modificar controles ni publicar contadores de personas en tablero público.

## Review Focus

1. Mismo inmueble anunciado/consultado varias veces o compartido por búsquedas: una unidad por búsqueda y alcance correcto. Prueba Task1.
2. Evidencia caducada, revocada, para otro hogar o solicitud guardada modificada: no disponibilidad confirmada falsa. Contrato y prueba Task1.
3. Cero real frente a datos ausentes/corruptos, histórico o comercial: copy distinto y null seguros. Pruebas Task2/3.
4. Cambio de filtros, pestaña oculta, 401 y respuestas tardías: ninguna reposición de contexto antiguo ni lecturas tras pausa. Pruebas Task4.
5. Totales grandes, zoom200% y movilidad: contador completo, enlace y foco legibles, sin desbordamiento. Prueba Task5.

## Mapa de archivos y responsabilidades

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Consumir, sin apropiarse de su implementación | server/match-followup.js (EST-13) | SQL de hechos normalizados y vigencia/alcance comercial |
| Crear | server/match-summary.js | Query de agregación y proyector MatchSummaryV1 |
| Modificar | server/routes/applicants.js | CTE de resumen uno a uno y DTO en GET lista |
| Crear | site/applicant-match-summary.js | Validación defensiva y copy puro |
| Crear | admin/src/ApplicantMatchSummary.jsx | Enlace/estados de una celda |
| Modificar | admin/src/Applicants.jsx | Celda y explicación; carga/refresco/error |
| Modificar | admin/src/App.jsx | Pasar pausa de sesión a Applicants |
| Modificar | admin/src/styles.css | Wrap y objetivos de enlace/recarga acotados |
| Crear | tests/server/match-summary.test.mjs | Contrato SQL, ámbitos e invariantes |
| Modificar | tests/server/applicants.test.mjs | Integración, filtros, Queue, auth y GET sin escrituras |
| Crear | tests/applicant-match-summary.test.js | Copy y DTO inválidos |
| Crear | tests/applicant-match-summary.e2e.cjs | Recorrido local y carreras de refresco |
| Actualizar al construir | docs/roadmap/tasks/SAP-02.json, ESTADO.md y generados oficiales | Estado/evidencia de implementación real; hoy solo nota de planificación |

## Task 1: Agregación verificable sobre EST-13

**Interfaces:** Consume `matchSummaryFactsQuery({asOf:string}):{sql:string,args:unknown[]}` con el contrato del diseño. Produce `matchSummaryQuery({asOf:string}):{sql:string,args:unknown[]}` en server/match-summary.js; columnas applicant_id, found_total, approved_total, availability_confirmed_total, invalid_facts. El constructor SQL no ejecuta consultas ni acepta SQL del cliente.

- [ ] 1. Verificar la integración real de EST-13, sus fixtures y el contrato de una fila por clave canónica. Registrar el nombre de su export y el adaptador exacto si difiere. Si faltan dimensiones/identidad/alcance/vigencia, devolver el requisito al productor antes de código de SAP-02; no simular integración con fixtures ficticios de tablas inexistentes.
- [ ] 2. Añadir pruebas en tests/server/match-summary.test.mjs con fixtures reales del productor: 12 candidatas,3 aprobadas vigentes,2 con disponibilidad ->12/3/2; candidatas sin gestión/evidencia no desaparecen por un join a datos opcionales; duplicados de anuncios y consultas -> mismo resultado; segunda búsqueda del hogar distinto -> su propio resultado; aprobación caducada, rechazo o exclusión no entra en el conjunto correspondiente. Evidencia negativa más reciente, revocación y fecha exacta de caducidad usan los límites de EST-13, sin redefinirlos. Publicación/precio/visita/Shortlisted solos no incrementan approved ni availability_confirmed.
- [ ] 3. Ejecutar `node --test tests/server/match-summary.test.mjs`; confirmar fallo por export/query aún inexistente. Si falla por ausencia de EST-13, volver al paso1, no implementar su dominio dentro de esta tarea.
- [ ] 4. Implementar matchSummaryQuery usando el SELECT normalizado como CTE y SUM de las intersecciones definidas. Contar invalid_facts por búsqueda y no convertirlos en resultados válidos. Evitar joins con históricos de mensajes/anuncios. Comprobar que el plan SQL usa las claves/índices del productor; si necesita índice nuevo, documentar y coordinar el cambio con EST-13 antes de ampliar alcance.
- [ ] 5. Ejecutar `node --test tests/server/match-summary.test.mjs`; esperar PASS. Commit acotado: `feat: aggregate applicant match follow-up facts`.

## Task 2: DTO y lectura de la lista sin cambiar Queue

**Interfaces:** Consume Task1 y estado del aplicante. Produce `toMatchSummary(applicant,aggregate):{version:1,state:'ready'|'historical'|'unsupported'|'unverified',found:number|null,approved:number|null,availability_confirmed:number|null}` en server/match-summary.js. GET lista conserva su envoltorio applicants y campos previos.

- [ ] 1. Extender tests/server/applicants.test.mjs: misma lista/filtros/orden/operación/asignación/archivado que antes; Queue conserva conteos técnicos found/shortlisted. GET con búsqueda activa residencial sin matches -> ready0/0/0, búsqueda resuelta/needs_review/archivada -> historical null, comercial/transfer -> unsupported null. Agregado inválido -> unverified null. Capturar versiones/last_activity/last_contact/eventos antes y después: idénticos. Petición sin sesión no obtiene contadores. Una confirmación de otro hogar no aumenta esta búsqueda. Prueba global >25 candidatas mantiene total aunque Matches esté paginado.
- [ ] 2. Ejecutar `node --test tests/server/applicants.test.mjs tests/server/match-summary.test.mjs`; comprobar RED en DTO nuevo.
- [ ] 3. Implementar toMatchSummary con precedencia y enteros/invariante del diseño. En la sentencia actual de list capturar asOf una vez, insertar CTE y LEFT JOIN agregado uno a uno; añadir los aliases internos necesarios y mapear el DTO sin emitir columnas de hechos. Conservar found/shortlisted/fresh, binds y filtros existentes. Cero filas de hechos válidamente leídas -> ceros; excepción SQL -> errorAPI habitual.
- [ ] 4. Añadir instrumentación de test para demostrar que N aplicantes no produce N lecturas ni multiplica filas; binds de búsqueda con apóstrofos/comodines siguen parametrizados. Verificar mismo snapshot y asOf por respuesta, conservando search_progress/match_counts si existen. Ejecutar las dos suites anteriores -> PASS. Commit `feat: expose verified applicant match summaries`.

## Task 3: Celda y mensajes coherentes

**Interfaces:** Consume match_summary. Produce `describeApplicantMatchSummary(summary):{state,text}` en site/applicant-match-summary.js y `ApplicantMatchSummary({applicant})` en admin/src/ApplicantMatchSummary.jsx. No recibe mensajes HTML ni acredita estados de la vivienda.

- [ ] 1. Crear tests/applicant-match-summary.test.js con valores12/3/2 y0/0/0, hasta999999, nulls, ausente, versión desconocida, string numérico, negativos, NaN/Infinity, fracciones y available>approved>found. Ready válido devuelve exactamente `12 found · 3 approved · 2 availability confirmed`; histórico `Historical matches`, unsupported `Manual review`, inválido `Match counts unavailable`. Ejecutar `node --test tests/applicant-match-summary.test.js` -> RED por módulo inexistente.
- [ ] 2. Implementar helper validando DTO/invariante y componente con texto React, enlace por ID interno a Matches y nombre accesible con el aplicante. Historical enlaza; unsupported no inventa cifras; unverified conserva enlace separado `View matches`. Añadir a Applicants la explicación visible «Found includes approved matches. Availability confirmed means current evidence covers this search.» y sustituir únicamente la celda Matches. No renombrar acciones Shortlist ni tocar MatchCard/SAP-03.
- [ ] 3. CSS acotado en ApplicantMatchSummary: segmentos que envuelven, override de nowrap solo en su celda, objetivos32/44px y fallback móvil760 con data-label. Usar tokens y tipografía de Global Constraints; no nueva biblioteca, tarjetas o animaciones. Ejecutar `node --test tests/applicant-match-summary.test.js` -> PASS. Commit `feat: distinguish candidate approval and availability counts`.

## Task 4: Refresco y errores sin carreras

**Interfaces:** `Applicants({paused=false})` consume pausa desde App con `paused={expired}`; usa api/usePoll existentes. Una generación identifica filtros/sesión/montaje; el resultado reemplaza filas y summary juntos. No cambia api.js ni poll.js globalmente.

- [ ] 1. Preparar aserciones Playwright focales en tests/applicant-match-summary.e2e.cjs: cargar una vez tras200ms, escribir filtro rápido no aplica respuesta anterior, poll30s actualiza conjunto atómico, petición lenta no se solapa en la misma generación; filtro nuevo puede iniciar nueva generación aunque la anterior tarde, y la vieja no escribe; pestaña oculta no lanza GET ni desde el debounce inicial; volver visible refresca. 401 en App pausa lista; respuesta anterior resuelta después no repone datos. Reload repite solo GET. Primero ejecutar con implementación anterior y observar RED específico.
- [ ] 2. Modificar App para pasar paused y Applicants para callback estable y usePoll(30000). Reemplazar su effect inicial, evitando doble GET. Cancelar timeout e invalidar generaciones al cambiar filtros/pausa/desmontaje; comprobar visibilidad/pausa también en callback y despacho200ms. Conservar claves de fila y foco. In-flight por generación impide solapar ticks, no bloquea filtros posteriores. Estado de carga mantiene el filtro al que pertenece el snapshot anterior.
- [ ] 3. Implementar carga inicial/error/reintento y fallo de refresco conservando datos etiquetados según spec. Mientras cambian filtros, identificar resultados anteriores; no aplicar contadores nuevos a filas viejas. Un live global anuncia fallo/recuperación una vez. Respetar hs:signed-out y descartar callbacks tras logout/pausa. No errores de red convertidos a0.
- [ ] 4. Ejecutar `E2E_SCRIPT=tests/applicant-match-summary.e2e.cjs npm run test:e2e` con herramientas PW/CHROME autorizadas del host y fixtures locales nuevos; esperar PASS para carreras/error/sesión. No ejecutar e2e general simultáneo en el mismo host. Commit `fix: refresh applicant match summaries safely`.

## Task 5: Validación conjunta, documentación y entrega

**Interfaces:** Consume Tasks1–4 y contratos integrados; produce evidencia de construcción y documentación pública mínima, nunca evidencia fabricada de tareas ajenas.

- [ ] 1. Completar el e2e focal con 1280/390, cifras999999, nombre largo, cero, unverified, histórico/comercial, enlace a Matches, teclado, foco sin salto, zoom200%, reduced motion, error y reintento. Verificar reflow bajo760 sin scroll horizontal. El fixture debe ejercer disponibilidad real de EST-13, no solo interceptar DTOs; interceptar respuestas exclusivamente para carreras/error.
- [ ] 2. Ejecutar `npm test`, `npm run build`, `npm run check:release`, `npm run test:e2e`, `E2E_SCRIPT=tests/applicant-match-summary.e2e.cjs npm run test:e2e` y `E2E_SCRIPT=tests/search-lifecycle.e2e.cjs npm run test:e2e`. Resultados esperados PASS, sin atribuir como nuevas fallas las anteriores. Si código integró SAP-01/BUS-14, ejecutar sus suites afectadas una vez.
- [ ] 3. Recorrer con Playwright MCP local a1280/390 y zoom200% todos los estados y controles tocados, comprobar contraste, consola/red, sin GETs por fila, sin PII en logs/almacenamiento ni escrituras al leer. Guardar capturas/evidencia local; si MCP no disponible, declarar pendiente, no equivalencia automática con build.
- [ ] 4. Solicitar revisión independiente, resolver defectos importantes y repetir solo checks afectados. Actualizar task SAP-02, ESTADO, ledger y generados con scripts oficiales, manteniendo estados ajenos y EST-13 con su evidencia propia. Ejecutar team:check si se regeneró catálogo. Commit final `docs: record applicant match summary validation` con autor autorizado; no inventar identidad.
- [ ] 5. Dejar SHA exacto, alcance y resultados revisables. Publicación y cualquier cambio posterior de esquema requieren la autorización correspondiente; este plan no la concede. Registrar relevo privado fuera de Git y recomendar la próxima tarea según su alcance real.

## Cobertura y entrega actual

A1/A3/A4 -> Task1; A5/A9 -> Task2; A2/A6 -> Tasks2/3; A7 -> Task4; A8 -> Tasks3/5; A10 -> Task1/preflight. Las casillas anteriores describen trabajo futuro y permanecen abiertas. Validación actual: documentos y revisión; producto, build, e2e, Playwright, migraciones y despliegue no ejecutados.

## Aplicación de skills

Brainstorming/grill-me cierran semántica/dependencias; writing-plans fija interfaces y pruebas. Impeccable preserva interfaz operativa y estados; antislop diales1/1/1 y contenido acreditado. Security-best-practices/frontend-security-coder fijan auth, DTO mínimo y render seguro; web-performance-optimization limita SQL/polling; ponytail concentra lógica sin estado global nuevo. Taste-skill/redesign-skill no aplica página nueva ni rediseño. Los gates runtime de antislop y verificación visual siguen obligatorios durante construcción, no declarados PASS por revisar Markdown.
