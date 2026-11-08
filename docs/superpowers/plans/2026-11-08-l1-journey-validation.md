# AUT-20 · Validación integral del recorrido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. No implementar este documento sin encargo, revisión del alcance y reserva build propios.

**Goal:** Dejar una suite integrada reproducible que demuestre A01–A16 y los cinco casos transversales con fixtures locales, sin sustituir resultados por planes.

**Architecture:** Organizar los módulos integrados con sus APIs reales y un fixture común, no un mock que siempre aprueba. Mantener un manifiesto de criterios que identifique escenario, evidencia y fallo; pendiente de dependencia es resultado no ejecutado, nunca PASS/SKIP interpretado como aprobación. Un ejecutor futuro adapta fixtures a interfaces integradas tras el preflight, sin rellenar módulos ausentes. Tests de incertidumbre de transporte usan el proveedor local que acepta y pierde acuse, sin enviar correo real ni abrir servicios públicos.

**Tech Stack:** JavaScript ESM, React/CSS actual, Pages Functions/D1 y node:test/Playwright locales; sin paquetes nuevos.

**Spec:** [Diseño](../specs/2026-11-08-l1-journey-validation-design.md).

## Global Constraints

Lista1 · AUT-20. Estado de producto sin cambios. Plan cerrado técnicamente; construcción condicionada a sus dependencias y encargo propio.

Catálogo AUT-20 requiere BUS-23 research_accepted y integrated de BUS-04, BUS-13, BUS-14, BUS-15, REG-12, REG-17, AGE-08, AGE-09, AGE-11, VIS-08, BUS-17, AUT-19, EST-19, NOT-01, NOT-08, NOT-09, NOT-11 y EST-18. Verificar además contratos transversales del recorrido (inventario/consulta/portal), sin cambiar el catálogo por inferencia. Antes de ejecución exigir decisiones de los módulos y activación de canales solo cuando la prueba pretenda afirmar integración real; fixtures pueden probar comportamiento local pero no acreditan activación. AUT-20 no se cierra hasta ejecución real completa.

Panel existente: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d para foco, bronze-dk#86542d para texto pequeño/hover, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. CSS actual prevalece sobre propuestas antiguas DESIGN.md Colors/Shapes. Tenor Sans/Georgia/serif H1 26px/H2 19px400; Montserrat/system-ui14px/1.5, auxiliar12px, tabla12px600 y celdas10px12px. page1240px, padding24px16px120px, radio14 tarjeta/10 campo/999 botón, gaps8/12/16/24px. Tabla a tarjetas760px; link/control32px escritorio44px móvil, foco2px/offset2px, contraste4.5:1 texto/3:1 foco. Probar1280/390, teclado/zoom200%/reduced motion. No paquetes, fuentes, imágenes o animaciones nuevas. ENERGY1/RHYTHM1/MOTION1 por comparación operativa y continuidad Hampton.

Crear `tests/server/journey.test.mjs` con casos A01–A16 y `tests/journey.e2e.cjs` con recorrido UI autenticado/público. Crear `tests/fixtures/journey.mjs` export `seedJourney(env):Promise<FixtureRefs>` con IDs estables de dos empleados, dos contactos con hogares distintos, tres búsquedas y dos operaciones para una propiedad/varias publicaciones, solo datos .test. `FixtureRefs` identifica property, publications, searches, matches, outreach, viewings, files y decisionVersions; obtiene IDs de APIs/fixtures reales, no asume entero compartido. `tests/fixtures/journey-manifest.json` enumera por A01…A16 su testName, productUnits y evidenceArtifacts, junto a X01…X05. Reporte final por criterio y logs sin PII. No nuevo endpoint ni permiso del producto.

No leer credenciales ni usar datos reales para fixtures. No cambiar red, servicios o controles. Migraciones, si se indican, se numeran contra main vigente al construir, sin ocupar0032 por inercia ni sobrescribir migraciones ajenas. Publicación/activación requieren su autorización separada.

## Review Focus

- Repetición de acción/tick y dos empleados: una mutación efectiva por versión, sin tarea/evento duplicados.
- Cambio de búsqueda/identidad durante respuesta: no aplicar resultado viejo ni afectar otra búsqueda.
- Cero/no-op/fallo/ausencia de upstream: no afirmar éxito ni construir una dependencia ficticia.
- Privacidad/actor equivocado: conservar los límites del canal y no exponer datos de terceros.
- Fechas de Jersey/reflow/foco: resultados y controles utilizables en sus límites exactos.

## Archivos y responsabilidad

Crear tests/server/journey.test.mjs, tests/journey.e2e.cjs, tests/fixtures/journey.mjs y tests/fixtures/journey-manifest.json; extender helpers de fixtures de cada módulo solo si hace falta export público de test, sin configuración de producción. docs/roadmap/work/AUT-20/validation.md registra matriz y capturas al ejecutar; no incorpora datos reales. No cambiar jobs/wrangler.toml ni network/auth para que pase.

## Task 1: Preflight y fixture integrado

**Interfaces:** Consume catálogo/evidencias y APIs reales, produce FixtureRefs/manifiesto completo.

- [ ] 1. Añadir prueba de comportamiento: 16 IDs A y5X únicos, cada uno enlaza test real; falta de módulo lanza dependencia no verificada sin éxito falso; seed reproducible local no .envproduction. Ejecutar `node --test tests/server/journey.test.mjs` y comprobar RED específico por funcionalidad ausente, distinguiéndolo de fixture roto o dependencia no integrada.
- [ ] 2. Implementar el mínimo descrito: Construir manifest/seed con contratos ya integrados. No implementar funciones de negocio ausentes para facilitar test. Respetar el contrato y errores del diseño; no reemplazar APIs del productor con datos de muestra.
- [ ] 3. Ejecutar `node --test tests/server/journey.test.mjs` -> PASS. Revisar el diff de esta unidad y hacer commit acotado en inglés con autor autorizado, sin publicar.

## Task 2: Flujo y fallos transversales

**Interfaces:** Consume FixtureRefs y clocks/providers de prueba inyectados.

- [ ] 1. Añadir prueba de comportamiento: A01–A16 y X01–X05 con asserts del manifiesto; snapshots antes/después prueban ausencia de duplicados, cambios solo explícitos e historial conservado. Ejecutar `node --test tests/server/journey.test.mjs` y comprobar RED específico por funcionalidad ausente, distinguiéndolo de fixture roto o dependencia no integrada.
- [ ] 2. Implementar el mínimo descrito: Añadir escenarios reales por API, barreras deterministas para carreras y clocks inyectados; evitar sleeps lentos/fakes que sustituyen la lógica bajo prueba. Respetar el contrato y errores del diseño; no reemplazar APIs del productor con datos de muestra.
- [ ] 3. Ejecutar `node --test tests/server/journey.test.mjs` -> PASS. Revisar el diff de esta unidad y hacer commit acotado en inglés con autor autorizado, sin publicar.

## Task 3: Recorrido UI y evidencia

**Interfaces:** Produce evidencia local por criterio sin PII.

- [ ] 1. Añadir prueba de comportamiento: Todas acciones navegan entidades exactas; 1280/390+zoom200%, errores recuperables, enlaces, teclado y red sin envíos externos. Ejecutar `E2E_SCRIPT=tests/journey.e2e.cjs npm run test:e2e` y comprobar RED específico por funcionalidad ausente, distinguiéndolo de fixture roto o dependencia no integrada.
- [ ] 2. Implementar el mínimo descrito: Integrar flujo completo, registrar capturas y resultados21/21; no ocultar fallos con retries sin diagnóstico ni confundir noejecutado con PASS. Respetar el contrato y errores del diseño; no reemplazar APIs del productor con datos de muestra.
- [ ] 3. Ejecutar `E2E_SCRIPT=tests/journey.e2e.cjs npm run test:e2e` -> PASS. Revisar el diff de esta unidad y hacer commit acotado en inglés con autor autorizado, sin publicar.

## Validación final y entrega

- [ ] Ejecutar npm test, npm run build y npm run check:release; suites focales de cada Task y e2e general cuando cambie producto. E2E_SCRIPT selecciona el focal nuevo del mapa de archivos, mediante npm run test:e2e con fixtures locales aislados. No simultanear suites que usen el mismo puerto del host.
- [ ] Recorrido Playwright MCP1280/390 y zoom200% de los controles/estados cambiados, foco/teclado/contraste/consola/red, sin pruebas destructivas reales. Si no está disponible, registrar el pendiente exacto. Cambios solo de pruebas no requieren UI nueva, pero sí ejecutar el recorrido AUT-20.
- [ ] Revisión independiente, resolver defectos importantes y repetir checks afectados. Actualizar ledger/ESTADO y tasks/generados oficiales solo con resultados reales; no cerrar el código completo si el alcance es un tramo. Autor autorizado y SHA exacto antes de revisión de publicación; relevo privado fuera de Git.

## Cobertura

A01 parkingMUST ausente no completo aunque score100; A02 mascotas desconocidas pendiente; A03 una vivienda/tres publicaciones; A04 fuente fallida no baja; A05 sin decisión humana no contacto; A06 consulta compartida sin sumar ocupantes; A07 llamada a2días con teléfonos según política acordadaAGE08; A08 confirmación propaga solo alcance; A09 captura y descarga parcial visible; A10 propuesta externa no confirma partes; A11 visita no cierra búsqueda; A12 día21hasta20 interno; A13 dictado sin confirmar no escribe; A14 baja confirmada prevalece ante scrapingviejo; A15 seis meses solo archivos acordados; A16 cerrar una búsqueda preserva otras y barrido.
X01 dos empleados y dos ticks: exactamente una acción efectiva por episodio/version.
X02 cambio material tras aprobar y antes de enviar: bloqueo/revisión, sin envío con autorización vieja.
X03 proveedor acepta, acuse perdido: estado incierto y reconciliación antes de reintentar, un solo envío.
X04 lectura/captura/purga parcial: progreso/reintento por pieza, sin éxito falso ni borrado extra.
X05 límites Jersey, DST y meses distintos: fechas/vencimientos correctos y sin saltos de episodio.
AUT20: todos21 criterios ejecutados juntos, cero fallos que invaliden recorrido, evidencia real. Documentar no completa la tarea.

avanzar conserva tarea/dependencias/estados; brainstorming y grill-me documentan decisiones y límites; writing-plans fija archivos/interfaces/pruebas; impeccable conserva foco y copy operativo; security-best-practices/frontend-security-coder exigen auth/SQL parametrizado/texto seguro y datos mínimos; antislop evita estados/estadísticas ficticios y aplica diales; web-performance-optimization limita rondas/bytes y polling; ponytail reutiliza módulos existentes. taste-skill/redesign-skill no aplica a páginas nuevas: no se crea una página ni se rediseña la identidad. Gates runtime se ejecutan al construir, no se acreditan por Markdown.

Todas las casillas anteriores son futuras. Hoy solo se revisan documentos; no se ejecutaron test/build/e2e/migraciones ni se modificó producto.

## Actualización Q01: revisión final de presentación

D05 aprobada por Luis el8-nov: cada presentación requiere revisión final humana y click Enviar del empleado. Añadir al criterio integrado del envío: aprobación de match/disponibilidad/preparación no envían; confirmar registra actor/instante/versión, y un cambio material obliga a revisar de nuevo. El transporte conserva idempotencia y resultado desconocido sin reintento ciego. Caso futuro, no prueba ejecutada en esta entrevista.

## Actualización: presentación directa por email

El recorrido M08 debe probar la presentación con fotos preparada por Hermes y enviada por email tras revisión y confirmación del empleado. El cliente no necesita entrar a un portal para verla. Formato aprobado: texto explicativo breve con fotos como adjuntos descargables, sin fotos inline ni portal. Respuesta normal al email y revisión humana adoptada por el planificador para mantener sencillez, sin acciones automáticas por texto. Adaptar el contrato productor AGE11/AUT17 antes de ejecutar AUT20; el envío con fotos no está construido por esta actualización. Privacidad/copia de datos es un alcance separado.

Q11 incorporada: AUT20 verificará adjuntos descargables JPEG/PNG, texto sencillo, snapshot revisado y límites del contrato SAP09/AGE11. Si falla una foto o cambian permisos no se envía un paquete parcial; doble click/acuse perdido no repiten. Son comprobaciones futuras de producto, no ejecutadas ahora.
