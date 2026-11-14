> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# SPR-01 · Ledger de planificación

Fecha: 8-nov-2026. Lista 4. Encargo de Luis: solo planes listos para construir; seleccionó SPR-01. No hay autorización de implementar, migrar, publicar ni activar producto.

## Base y conservación

- Copia: `[copia local de planificación]`, `main`, base `6d2f77922f797a1ffd6a23e2030308440ca81adf`.
- Verificador canónico al retomar: 2026-11-08T11:46:38Z, salida 0, main/HEAD/GitHub iguales y copia limpia. La rama y archivos pendientes de la copia original se conservaron íntegros.
- NOT-11 dejó de ocupar la identidad antes de empezar. El coordinador confirmó SPR-01 en Lista 4, modo plan, generación 1. Se mantiene watch en primer plano durante la redacción.
- Primera ampliación de scope rechazada por conflicto: ESTADO/checklist y derivados están reservados por BUS-21, cuya reserva stale conserva recursos. La ampliación acotada a los tres Markdown propios fue aceptada. No editar documentos generales ni declarar esa tarea libre.

## Documentos

- [Spec y decisiones D1–D10](../specs/2026-11-08-spr-01-listing-availability-design.md).
- [Plan de construcción](2026-11-08-spr-01-listing-availability.md).
- Este ledger registra únicamente hechos comprobados de la planificación; los checkboxes del plan son trabajo futuro.

## Decisiones y evidencia

| Alcance | Decisiones | Evidencia examinada | Comprobación futura |
| --- | --- | --- | --- |
| A1 Baños | D6 | bathrooms en schema/validateListing/editor, ausente de LIST_SQL; bedsLabel existente. | UI1 + e2e. |
| A2 Fecha | D1–D3, D5, D8 | Sin columna disponible; realDate y fmtDayMonth reutilizables. | V1/V2 + API1/API2 + UI2/UI5. |
| A3 Rechazo inválidos | D2–D3 | Whitelist y fieldErrors existentes. | V2 y ruta 400 sin escritura. |
| A4 Confirmación/estado | D4, D7 | confirmed_at/TO_CONFIRM y rutas update/confirm existentes. | API3/API4 + UI3/UI4. |
| A5 Historial | D9 | EST-18 usa triggers con campos enumerados; agregar columna solo no la audita. | EV1–EV4 y pruebas EST-18. |
| A6 Interfaz | D5–D7 | CSS actual, DESIGN con nota de paleta ya migrada; formulario con versión, error y Discard. | MCP 1280/390, teclado/foco/zoom. |
| A7 PUB-06 | D10 | Arquitectura §5.10, checklist y reparto incluyen misma fecha. | Revisión de contrato y cierre real. |

## Skills aplicadas y límites

Brainstorming/grill-me resueltos por lectura de requisitos y propuesta explícita; writing-plans estructura la ejecución. Impeccable/adapt, seguridad, antislop durante el trabajo, rendimiento y ponytail concretados en el plan. Taste para página nueva y redesign no aplican. No se instalaron herramientas ni se creó interfaz de producto.

El original privado de Luis no existe en este clon. No se copió desde otro equipo ni se incluyó en documentación pública. Arquitectura/checklist aportan el requisito de SPR-01.

## Centinela: clasificación limitada

Dos alertas de salida se clasificaron mediante comprobaciones booleanas: fixture de pruebas con valor sintético y comentario de ejemplo de configuración e2e. Sin reproducir valores. No se identificó una credencial de producción en esas lecturas; no se hizo una auditoría general del VPS ni se afirma nada sobre su estado global. Sin rotaciones ni remediaciones.

## Comprobaciones de esta entrega

- [x] GitHub/base verificados y reserva plan confirmada.
- [x] Scope de los tres documentos confirmado; producto y documentos ajenos intactos.
- [x] Contratos API, SQL, formulario, formatos y triggers revisados por lectura.
- [x] Revisión independiente del spec/plan por `spr01_builder_check`: dos aclaraciones menores resueltas en D4/D7 y Tasks 1/3: ocultar fecha activa en archivadas y conservar recálculo existente sin añadir criterio de fecha. Sin otras decisiones bloqueantes detectadas.
- [x] Revisión documental: enlaces internos válidos, decisiones D1–D10, aceptación A1–A7 y 31 pasos futuros sin placeholders. Rutas existentes comprobadas; migración/test nuevos identificados como creación.
- [x] `node scripts/render-roadmap.mjs --check`: salida 0, 250 tareas/250 unidades, sin generar assets ni modificar roadmap. `git diff --check` correcto; repetir sobre los archivos preparados antes del commit.
- [x] Preparados exclusivamente los tres Markdown; enlaces y ausencia de patrones de credencial comprobados; scope de escritura contrastado contra reserva activa plan. `git diff --cached --check` correcto.
- [x] Intento de commit local: bloqueado por identidad de autor no configurada. La copia operativa del proyecto tampoco proporciona user.name/user.email; no se inventó un autor ni se cambió configuración global. Documentos conservados en el índice, sin commit nuevo.
- [x] `submit` intentado con los tres documentos: rechazo definitivo `PLAN_ONLY`. Diagnóstico en `coordination/src/state.mjs:176`: el servidor exige `changedPaths.length === 0` para una reserva plan, mientras el cliente/documentación permiten Markdown dentro del scope. No se cambió el servidor ni se enviaron changedPaths falsos para eludirlo. Reserva confirmada todavía propia, activa y en plan, sin operación incierta.
- Cierre inicial: pausa confirmada revisión115, conservando documentos. No presentar el SHA base como commit que contiene estos archivos ni la planificación como integrada/publicada.
- Playwright: no aplica a esta entrega documental. Pruebas de producto/build/e2e/migración: no ejecutadas, previstas en Tasks 1–4.

## Siguiente paso

Revisar/aprobar el diseño de SPR-01 y, en un encargo separado de construcción, reservar los paths de producto/pruebas/generados exactos y obtener transición build. La coincidencia del campo con PUB-06 queda especificada, no declarada como aprobación de esa tarea.

Recomendación Codex para construir SPR-01: `gpt-6.1-terra` · esfuerzo `high`: migración con recreación de triggers, guardado concurrente, API y React con regresiones existentes. Modelo y esfuerzo comprobados en el catálogo local de Codex el 8-nov-2026. No cambia el modelo/esfuerzo de la sesión actual. Publicación y migración remota no autorizadas en este encargo.

## Reanudación: cierre documental previsto por el protocolo

Luis autorizó resolver el bloqueo y después planificar PUB-06. La inspección adicional encontró una vía existente suficiente para ese objetivo: `coordination/src/state.mjs` permite `complete` en modo plan con evidencia `design` vigente que cubra el scope. No exige `submit`, commit ni integración. Se evita así modificar o desplegar el servidor solo para liberar esta planificación.

- Revisión independiente `spr01_builder_check` confirma esa vía y que la proyección pública solo considera construido `completed` con `mode: build`; el cierre plan no construye SPR-01 ni revisa paths de producto ausentes del scope.
- Reanudación confirmada, revisión117, todavía `mode: plan`.
- `node --test tests/team-coordinator.test.js`: 25/25 PASS; advertencia previa de module type, sin modificación de package.json.
- Comprobación adicional en memoria: sin evidencia se rechaza complete; tras evidencia documental vigente se cierra plan y libera recursos, sin evidencia integrated ni construcción. PASS.
- Se corrige el procedimiento de cierre de este plan. Registrar únicamente la revisión documental real y cerrar esta fase; conservar archivos locales y preparar una copia limpia independiente para la reserva de PUB-06. El resultado de las operaciones reales se registra en el relevo privado.

## Integración combinada · 14-nov-2026

Se prepara `migrations/0052_listing_economics_history.sql` con PUB-06 para registrar antes/después de `available_on`, sin backfill ni segundo campo. El contrato efectivo sigue `available_on` de 0042 y conserva su proyección pública ya existente. A4 se concilia con D4 en el spec: mismas reglas de filtros, estado/visibilidad/confirmed_at conservados, recencia y derivación ordinaria de parroquia visibles y probadas. La preparación local no acredita aplicación remota ni cierre; la evidencia conjunta registra pruebas y revisión de retención.
