# REG-05 REG-07 REG-08 REG-11 REG-17 · Verificación de entregas existentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta entrega solo redacta documentos; no ejecutar ahora.

**Goal:** REG-05 REG-07 REG-08 REG-11 REG-17 · Verificación de entregas existentes.

**Architecture:** Ampliación de los módulos existentes con contratos explícitos y guardas dentro de la transacción. Las dependencias propuestas requieren prueba real antes de integrarse.

**Tech Stack:** JavaScript ES modules, React19, Cloudflare Pages/Workers, D1/SQLite y pruebas Node/e2e existentes.

**Spec:** [diseño](../specs/2026-11-08-l1b-existing-deliveries-verification-design.md).

## Global Constraints

Base `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1`; solo documentos ahora. Construir exige revisión de alcance/diseño, dependencias y reserva build. Publicación/migración se autorizan aparte. No modificar el catálogo por terminar el plan.

**UI comprobada en código, frente a la cabecera desfasada de DESIGN.md:** `admin/src/styles.css`: ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#6b665e`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, warn-bg `#fff6e5`, field-line `#8f8a82`. Tenor Sans/Georgia H1 26px/H2 19px, peso400; Montserrat/system-ui 14px/1.5, labels12px. Page1240px y padding24px16px120px; card24px/radio14px, field9px12px/radio10px, botones10px20px/radio999px. Reusar `.card/.field/.btn/.warn/.actionbar/.badge`, gaps12/16/24px, editor280px y apilado900px; piezas nuevas apilan760px. Botón hover bronze-dk, disabled opacity.45; foco2px bronze/offset2px y, si contraste medido lo exige, bronze-dk en el control tocado. Contraste texto≥4.5:1, foco/bordes≥3:1; estados con texto, labels nativos, aria-invalid/describedby y status/alert. Controles32px escritorio/44px móvil, teclado, 1280/390 y zoom200%, reduced motion. Copy/API inglés. ENERGY1/RHYTHM1/MOTION1; sin fuentes, imágenes, librerías o animaciones nuevas. React escapa texto; URLs por helpers existentes; sin PII/tokens en storage, URL, analytics o logs. No polling de ficha completa ni N+1; las solicitudes tardías no sobrescriben formularios.

## Review Focus

- El catálogo antiguo puede contradecir un ledger posterior: clasificar la fuente, la fecha y el commit, Task1.
- Código en main con migración pendiente no acredita activación, Task2.
- Una migración aplicada puede seguir pendiente en documentación antigua: no repetirla, Task2.
- Las franjas de visita no confirman una cita; el alta comercial no completa el matching, Task3.
- La evidencia autenticada puede contener datos personales: conservar solo metadatos depurados, Tasks1/2.

## Task1: Matriz de evidencia

**Files:** crear `docs/roadmap/work/REG-08/delivery-verification.md` al ejecutar esta guía. Leer las fichas, ledgers y migraciones citados en el spec. No crear archivos de producto.

**Interfaces:** `DeliveryEvidenceV1` del spec es un registro documental; no requiere una API nueva.

- [ ] Ejecutar el verificador oficial de GitHub, registrar SHA, fecha y estado y preservar los cambios pendientes.
- [ ] Revisar Git, task JSON, ESTADO y los ledgers de los cinco códigos; completar campos con enlaces y hashes, y usar `unverified` donde falte prueba. No reutilizar un PASS antiguo como prueba ejecutada hoy.
- [ ] Cotejar REG-05/07 con REG-08/0031, REG-11 con0025 y REG-17 con0026/VIS-18. Documentar contradicciones con fecha y fuente sin editar todavía el catálogo.

## Task2: Publicación, migración y activación

**Files:** el mismo artefacto. No editar configuraciones, permisos o wrappers.

- [ ] Consultar los despliegues de GitHub/Pages/Jobs y el estado de migraciones mediante herramientas autorizadas de lectura. Registrar únicamente SHA, nombre, estado y fecha, sin imprimir respuestas privadas.
- [ ] Si falta acceso, marcar `unverified` e identificar al responsable. No solicitar credenciales por chat ni usar otro canal. El estado Git local no es evidencia de producción.
- [ ] Comprobar las superficies públicas mediante lectura. La presencia de0031 en el repositorio no convierte una publicación pendiente de REG-08 en una entrega activa. Guardar evidencia DV01–DV06.

## Task3: Aceptación local y conciliación documental

**Files:** ejecutar las suites existentes de REG-08/11/17; no crear tests que solo reflejen este documento. Actualizar después `docs/roadmap/tasks/REG-{05,07,08,11,17}.json` y `docs/roadmap/ESTADO.md` solo cuando la evidencia justifique el estado.

- [ ] Ejecutar las suites Node existentes de prioridades, registro y franjas con datos locales sintéticos. Registrar comandos y resultados para dormitorios/baños, mascotas desconocidas, parking imprescindible, traspaso, búsquedas separadas y CAS de horarios.
- [ ] Ejecutar `npm run test:e2e` y los recorridos focales REG-11/17 presentes en main vigente dentro de una fixture aislada. Verificar escritorio1280, móvil390, foco, errores y zoom200% mediante Playwright MCP local.
- [ ] Una vez comprobados DV01–DV08, conciliar task JSON y ESTADO y regenerar con `node scripts/render-roadmap.mjs`. Ejecutar `node scripts/render-roadmap.mjs --check` y exigir PASS. Si queda un bloqueo, conservar el estado parcial y describir el alcance pendiente.
- [ ] Obtener revisión independiente de la evidencia y el diff. Preparar la entrega documental y describir la publicación/migración pendiente sin ejecutarlas por inferencia.

## Autorrevisión

DV01/04/05 corresponden a Task1; DV02/03/06 a Task2; DV07/08 a Task3. Es una guía para verificar entregas existentes: no son cinco funciones nuevas ni evidencia actual de producción.

## Entrega futura

- [ ] Ejecutar las suites focales, `npm test`, `npm run build`, `npm run check:release` y e2e relevante en fixture local, sin tocar producción. Registrar PASS/FAIL real.
- [ ] Para cambios UI, Playwright MCP local1280/390: camino correcto, vacíos, error, permisos, conflicto, teclado/foco/zoom200%, consola/red; corregir hallazgos y repetir solo pruebas afectadas. Para unidad sin UI, registrar no aplica.
- [ ] Revisión independiente; actualizar estado por tramo con evidencia, ledger y relevo privado. Preparar commit con rutas explícitas y SHA revisable, sin publicar ni migrar por inferencia.

Skills y alcance aprobable se detallan en el spec. Las casillas abiertas son trabajo futuro: no constituyen pruebas ejecutadas.
