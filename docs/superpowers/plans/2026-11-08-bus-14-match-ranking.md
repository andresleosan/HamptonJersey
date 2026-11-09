# BUS-14 Match ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Construcción retomada por $avanzar el9-nov-2026; ver ledger para pruebas y límites reales.

**Goal:** Conservar todas las candidatas pertinentes y ordenarlas de forma explicable, con páginas de25 y sin bonus por publicación.

**Architecture:** Continuar evaluate, persistencia, ficha y Review existentes. Usar orden persistido, paginación keyset y revisiones del conjunto; conservar decisiones humanas e historial. Sin servicios, colas o dependencias nuevas.

**Tech Stack:** JavaScript/React/Vite, Pages Functions, D1/SQLite, node:test y Playwright existentes.

**Spec:** [Diseño y decisiones aprobadas](../specs/2026-11-08-bus-14-match-ranking-design.md).

## Global Constraints

- Construcción9-nov sobre main064aa7f3725ee3f8b13a39b3443778e2cf60da56, comprobado con GitHub en copia propia /tmp/hampton-bus14-20261109-t8U0evyb. Trabajo original preservado.
- Diseño y alcance aprobados; candado local y actividad compartida de BUS-14 confirmados. No reservas históricas, evidencia remota ni renovación. El encargo no autoriza migración remota, publicación ni despliegue.
- REG-08/cfb3d3c y0031 comprobados en la base; no reconstruir ni exigir evidencia del coordinador histórico.
- Migración0037 es el siguiente número libre comprobado;0032–0036 pertenecen a otras entregas y se conservan.
- Todas las candidatas pertinentes; ningún filtro por score ni tope de almacenamiento. Página25. Score máximo natural90, sin porcentajes. No confirmar disponibilidad por cumplir requisitos.
- Orden SQL: requirements_rank ASC, score DESC, listing_id COLLATE BINARY ASC, id ASC; conservar en ficha y Review. Rejected es histórico y no se repropone. Shortlisted conserva la decisión humana.
- Interfaz en inglés y reglas exactas del apartado Diseño del spec. No nuevas dependencias, infraestructura o controles de seguridad.

## Review Focus

1. Más de25 candidatas o score<35: no perder parejas al recalcular por aplicante o vivienda (Tasks1/2).
2. Empates, mutación entre páginas y respuesta antigua: no duplicar/omitir silenciosamente ni sustituir una vista nueva (Tasks3/4).
3. Rejected, Shortlisted y búsqueda cerrada: decisiones e historial conservados, sin orden nuevo fingido (Tasks2/4).
4. Recálculos simultáneos o datos editados durante evaluación: sin eventos duplicados ni sobrescritura obsoleta (Task2).
5. Timeline/Widen con coincidencias fuera de la página: títulos y mejoras correctos sin cargar todas las tarjetas (Tasks4/5).

## Task1: Motor sin descartes por puntuación

**Files:** Modify server/matching.js; Test tests/server/matching.test.mjs y tests/server/requirements-matching.test.mjs.
**Interface:** evaluate(applicant, listing) conserva {pass,score,checks,requirements_status,requirements_rank}. pass no depende del score. Mantener semántica REG-08 de desconocidos e incumplimientos.

- [x] Escribir regresiones: viviendas idénticas salvo published tienen igual score; máximo90; imprescindible incumplido nunca es meets; desconocido permanece pending.
- [x] Ejecutar node --test tests/server/matching.test.mjs tests/server/requirements-matching.test.mjs y comprobar fallos atribuibles al contrato nuevo.
- [x] Retirar MIN_SCORE, MAX_FOUND y POINTS.published, y la suma del bonus. Actualizar comentarios/consumidores junto a las tareas siguientes; no cambiar pesos restantes.
- [x] Repetir esas pruebas hasta PASS sin alterar reglas de requisitos para obtenerlo.

## Task2: Persistencia completa, versiones e idempotencia

**Files:** Modify server/match-store.js y server/routes/matches.js; Create migrations/0037_match_ranking.sql; Test tests/server/match-store.test.mjs, tests/server/match-hooks.test.mjs y tests/server/matches.test.mjs.
**Interfaces:** recomputeForApplicant(env,id,actor,restoreNotice=false) conserva {created}; recomputeForListing(env,id,actor) conserva su contrato. created cuenta inserciones efectivas.

- [x] Añadir casos:60 candidatas incluidas de score<35; recomputar una vivienda no elimina otras; archivada no entra nueva; Shortlisted conserva estado; Rejected no cambia; cierre/requisitos/vivienda editados durante evaluación invalidan resultados obsoletos.
- [x] Añadir carrera con dos recomputes que leen una pareja ausente: una pareja, un evento efectivo y un aviso abierto. Segunda ejecución idéntica no añade evento; cambios de score sin incorporaciones tampoco.
- [x] Ejecutar node --test tests/server/match-store.test.mjs tests/server/match-hooks.test.mjs tests/server/matches.test.mjs y registrar RED.
- [x] Crear migración con applicants.matches_revision INTEGER NOT NULL DEFAULT0, applicants.match_ranking_version INTEGER NOT NULL DEFAULT0 y restricciones de versión; índice(applicant_id,status,requirements_rank,score DESC,listing_id COLLATE BINARY,id). Triggers de inserts/deletes y cambios relevantes de matches incrementan revisión sin tocar updated_at. Invalidar además por cambios relevantes de búsqueda/cierre/reapertura.
- [x] Retirar selección top25 y consulta de otros Found. Guardar todas las passing, actualizar Shortlisted y preservar Rejected con guards actuales y versión de vivienda. CANDIDATES_SQL excluye archived_at no nulo.
- [x] Contar ausencias efectivas dentro del batch para el evento antes de insertar parejas; crear aviso condicionado al evento y sincronizar título tras aplicar parejas. Calcular created con cambios efectivos de INSERT. Mantener la atomicidad del batch y probar changes() con los triggers nuevos.
- [x] Marcar ranking_version1 solo al completar el recálculo completo válido en su mismo batch. Un recálculo de vivienda no afirma una actualización completa de datos legacy.
- [x] Repetir las pruebas focales hasta PASS y comprobar migración sobre fixture poblada, integrity_check y decisiones conservadas.

## Task3: API paginada y orden común

**Files:** Create server/match-pages.js; Modify server/routes/applicants.js y server/routes/matches.js; Create tests/server/match-pages.test.mjs; Modify tests/server/matches.test.mjs y tests/server/applicants.test.mjs.
**Interface:** pageMatches(env,applicantId,{status,after=null}) devuelve {matches,counts,next,revision,rankingVersion}. Nueva GET autenticada /admin/applicants/:id/matches con status permitido found/shortlisted/rejected y cursor opcional. counts contiene los tres totales; next es cursor o null.

- [x] Escribir pruebas para60 resultados25/25/10, empates y referencias BINARY, status vacío, sesión ausente401, búsqueda inexistente404, cursor inválido/ajeno400 y revisión antigua409. Verificar que GET no escribe.
- [x] Ejecutar node --test tests/server/match-pages.test.mjs tests/server/matches.test.mjs tests/server/applicants.test.mjs y registrar RED.
- [x] Implementar cursor v1 con búsqueda, status, revisión y última clave de orden; máximo1024 caracteres, whitelist y tipos/rangos estrictos, sin SQL interpolado. Admitir score histórico hasta100 sin presentarlo como escala nueva.
- [x] Leer revisión/counts/página en un mismo DB.batch. LIMIT26, devolver25 y derivar next de la última devuelta; usar exactamente la misma clave en WHERE y ORDER BY.
- [x] Reutilizar ese orden en BEST/SAME_SEARCH de Review. matchCard conserva score/rango persistidos y añade aviso de comprobaciones desactualizadas; no reordenar las páginas en JS.
- [x] Hacer que detalle devuelva resumen en lugar de todas las tarjetas y ajustar sus respuestas de mutación. Timeline obtiene listing_title a partir de listing_id de sus eventos, sin depender del array paginado.
- [x] Repetir pruebas hasta PASS y revisar EXPLAIN QUERY PLAN sobre fixture grande: consultas restringidas a la búsqueda/estado, sin ordenar o recorrer toda la tabla de matches para entregar una página.

## Task4: Ficha paginada y transición visible

**Files:** Create admin/src/ApplicantMatches.jsx; Modify admin/src/ApplicantDetail.jsx, admin/src/MatchCard.jsx, admin/src/Review.jsx y admin/src/styles.css; Create tests/bus14-e2e.cjs.
**Interface:** ApplicantMatches({applicantId,applicant,counts,onChange}) mantiene página/cursor por estado y consume la API Task3. Reutilizar MatchCard y controles existentes.

- [x] Añadir recorrido e2e con60 coincidencias, navegación Found/Shortlisted/Rejected, páginas, revisión/Undo, títulos de Timeline de tarjetas no cargadas y formulario con cambios sin guardar.
- [x] Ejecutar el recorrido sobre fixtures locales según el lanzador existente y registrar el fallo anterior a la implementación.
- [x] Cargar máximo25 tarjetas por página. Invalidar páginas después de revisión/Undo/requisitos/cierre; descartar respuestas antiguas mediante generación de petición. Ante409, recargar resumen y primera página con explicación y foco conservado.
- [x] Mostrar loading textual, vacío con causa, error con reintento y orden anterior/recalcular mientras versión0. Rejected mantiene presentación histórica. Las discrepancias de comprobaciones muestran aviso sin cambiar el orden ni afirmar score actual.
- [x] Aplicar valores DESIGN del spec: paleta vigente, cuerpo14px/1.5, etiquetas12px, H1 26/H2 19, contenedor1240, gutters16, tarjetas radio14/padding24, foco2/offset2, controles nuevos44px. Sin rediseño general, gráficos o controles decorativos.
- [x] Repetir recorrido a1280 y390, teclado/foco, zoom200%, errores/vacíos, consola/red y ausencia de overflow; guardar evidencia real.

## Task5: Adaptación mínima de Widen

**Files:** Modify server/widen.js y server/routes/applicants.js; Test tests/server/widen.test.mjs.
**Interface:** widen mantiene propuestas sin escritura y sin aplicar criterios automáticamente. El conjunto de parejas se consulta completo independientemente de la página de tarjetas.

- [x] Escribir casos con alternativas fuera de primera página, mejora existente a meets, vivienda nueva que pasaría a meets, tres alternativas pero ninguna meets, Rejected/Shortlisted excluidas y prioridades legacy ausentes.
- [x] Ejecutar node --test tests/server/widen.test.mjs y registrar RED.
- [x] Quitar MIN_SCORE/MAX_FOUND de Widen; calcular mejoras reales sin cupo. Live cuenta meets ofrecidas; separar mejora de pareja existente de nueva vivienda en conteo/copy. Sin prioridades válidas, mostrar necesidad de confirmar y no inventar meets.
- [x] Repetir pruebas hasta PASS. No añadir ranking del día21 ni extracción nueva: siguen fuera de este alcance.

## Task6: Integración, validación y entrega

**Files:** Los anteriores; ESTADO/checklist/reconciliación y generados del roadmap únicamente con alcance autorizado; spec/plan/ledger de BUS-14.

- [x] Ejecutar npm test, npm run build y npm run check:release. Registrar resultados reales y separar fallos anteriores de regresiones.
- [x] Ejecutar npm run test:e2e para el general y el recorrido BUS-14 con el selector existente E2E_SCRIPT, sin modificar wrappers ni controles del entorno.
- [ ] Completar Playwright MCP local a1280/390: navegación, validaciones, vacíos/error, teclado/foco, zoom200%, consola/red. Fixtures propias y un e2e general por host; MCP no inicia por sandbox/root, registrado sin alterar controles.
- [x] Medir respuesta paginada y recálculos con fixture de volumen:25 tarjetas por respuesta, sin lectura de otros Found al guardar vivienda y sin N+1. Ajustar procesamiento por lotes existente si las mediciones lo requieren; nunca restaurar top25 para ocultar coste ni añadir infraestructura sin revisión de alcance.
- [x] Revisar independientemente el diff final y corregir hallazgos importantes; repetir comprobaciones afectadas. Esta revisión de plan no sustituye aquella revisión de código.
- [x] Actualizar documentos y generados desde sus fuentes con estado real, incluyendo publicación/migración/activación pendientes. Hacer commit de archivos concretos en main y preparar aprobación del SHA exacto; no migrar ni publicar sin la autorización correspondiente.

## Skills aplicadas

- writing-plans: archivos, interfaces, tareas verificables y pruebas RED/GREEN.
- brainstorming y grill-me: recuperar decisiones ya aprobadas y cerrar efectos en legado, concurrencia, Widen y paginación sin repetir preguntas.
- ponytail: continuar el motor y el lanzador existentes; ningún servicio, cola o dependencia nueva.
- web-performance-optimization: paginación de servidor, índice, ausencia de N+1 y medidas con volumen; no prometer límites de CPU a partir de comentarios históricos.
- impeccable y antislop: estados operativos y controles útiles, inglés funcional y accesibilidad. ENERGY1/RHYTHM1/MOTION1 por continuidad del panel. El runtime se comprueba en construcción; no afirmar PASS visual ahora.
- security-best-practices y frontend-security-coder: sesión/same-origin, validación autoritativa de cursor, SQL parametrizado, escape de React y sin PII en cursor/log/storage.
- taste-skill: no aplica a una página nueva; no hay nueva página pública. redesign-skill: no hay rediseño general; se mantiene la ficha y sus componentes.

## Estado de planificación original8-nov (histórico)

Plan revisado de forma independiente en solo lectura y auto-revisado contra la propuesta aprobada. Todas las casillas anteriores son trabajo futuro. No se han ejecutado npm test/build/e2e, migraciones, código o publicación durante esta planificación. Playwright: no aplica a esta entrega documental; obligatorio al construir.

Esta copia es una exportación solicitada por Luis. No es un commit ni una entrega registrada en el coordinador. El guardado canónico de BUS-14 sigue pendiente mientras el actor VPS tiene otra reserva. Modelo recomendado para futura construcción: gpt-6.1-terra, esfuerzo high.


## Estado de construcción9-nov

Implementación Tasks1–5 terminada. Task6 conserva resultados reales en ledger: suite1068JS+14Python, build/release y focal1280/390 con errores, concurrencia, formulario sucio, respuesta antigua y zoomCSS200. Revisión independiente con1Important corregido RED→GREEN y suite posterior. E2E general serial completoPASS (public/urls/admin/reg17); primera ejecución inconclusa por assets recompilados y baseline diagnóstica detenida sin veredicto; PlaywrightMCP bloqueado antes de navegar.0037 remota y publicación necesitan aprobación del SHA final. No se convierten estas limitaciones en PASS ni se presenta el producto como publicado.
