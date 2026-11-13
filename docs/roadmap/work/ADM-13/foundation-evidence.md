# ADM-13 · Base interna de inspecciones, sin activación

Fecha: 2026-11-13. Base examinada: `ca60556eb40ece19691d1023fe4342e2ba1afe26`. El trabajo de este documento es **parcial** y no cierra ADM-13 ni cambia el porcentaje de tareas terminadas. Todos los datos usados en las pruebas son ficticios.

## Alcance y decisión

El [plan vigente de ADM-13](../../../superpowers/plans/2026-11-09-adm-13-internal-six-month-inspections.md) retira expresamente el informe al propietario y conserva agenda, checklist y evidencia interna. El [contrato TP-05](../../../superpowers/specs/2026-11-10-tp05-continuity-scope-design.md) limita la evidencia a referencias externas opacas declaradas como revisadas y excluye un nuevo repositorio, carga/descarga de fotos y envíos al propietario. La [ficha histórica](../../tasks/ADM-13.json) aún menciona fotos e informe imprimible: es una discrepancia pendiente de reconciliar en el tablero; no es autorización para incluirlos.

**Ruling:** prevalece el plan posterior y TP-05 sobre esa ficha histórica; no se añade informe ni custodia de archivos. Si se dejara la ficha sin reconciliar, podría sugerir un alcance retirado; el responsable de integración debe corregirla al registrar este avance sin marcar la tarea terminada.

**Ruling:** el propósito de inspección no figura en la lista de `server/case-capabilities.js` ni en el `CHECK` de `migrations/0046_case_capabilities.sql`. Las capacidades genéricas existentes no demuestran por sí solas autorización sobre inspecciones. La fachada `server/rental-inspections.js` responde siempre 503; no se han añadido rutas ni consumidores. Esto conserva la denegación mientras se diseña el acceso por entidad, propósito y capacidad. El coste es que ningún empleado puede todavía usar la funcionalidad preparada aquí.

**Ruling:** el plan inicial solicitaba una migración, rutas y UI; la ausencia de autorización específica y del ciclo de vida de referencias hace insegura su activación. Se entrega un modelo puro y un esquema **propuesto**, fuera de `migrations`, para que su siguiente integración pueda verificarse sin tocar datos. No se aplica SQL, no se cambia la autoridad de alquileres y no se crean tablas reales. El coste es que no hay agenda persistente, tareas ni pantalla accesible.

## Modelo preparado

`server/internal/rental-inspections-domain.js` opera sobre valores en memoria y no autentica, autoriza, consulta ni guarda datos. Recibe fechas y actor como argumentos: antes de usarlo, un servicio real debe obtener el actor y reloj del servidor y contrastar el alquiler, la tenencia y la fecha histórica con sus autoridades existentes. Un identificador de alquiler correcto no demuestra pertenencia ni permiso.

- Sin última inspección, exige fecha inicial explícita; si falta, devuelve `baseline_required`, sin inventar historial ni crear una tarea. Con última fecha informada, calcula seis meses naturales con ajuste al último día del mes cuando procede; finalizar calcula la siguiente desde la fecha de la inspección efectivamente registrada. El tiempo de Jersey se usa para no admitir una finalización futura en el modelo.
- El checklist nace con `not_checked`; notas y lecturas son datos privados estructurados. Un borrador no se cierra con lista vacía o controles pendientes. Reprogramar conserva vencimiento e historial y no registra finalización.
- Las mutaciones del modelo usan revisión esperada y devuelven conflicto si la instantánea, el alquiler o la plantilla no coinciden. Es un control de valores en memoria, no una prueba de escritura atómica ni de autorización. No implementa `checked_items_hash`, `operation_id` ni recibos persistentes de idempotencia.
- Las referencias declaradas tienen como máximo 120 caracteres, se limitan a un formato opaco y rechazan URL, rutas y prefijos explícitos como `data:` o `r2:`. El formato por sí solo no puede determinar si un texto aparentemente opaco es una clave real o un dato personal: el flujo futuro debe impedirlo. La fecha y el actor de revisión los aporta el servidor de integración, no el cuerpo de la solicitud. Una declaración no demuestra que la aplicación haya accedido a un documento ni certificado su contenido. La revocación invalida la declaración dentro de la inspección, impide cerrarla y, tras el cierre, marca revisión pendiente sin reescribir la fecha completada. No se resuelve ni comprueba ninguna referencia de forma remota. La propagación entre inspecciones o casos no está implementada y necesita una autoridad de revocación explícita antes de activar el servicio.

## Propuesta SQL y límites

`inspection-schema-proposal.sql` se usa únicamente en SQLite local con alquileres ficticios. Propone un único borrador abierto por alquiler, pertenencia básica de la tenencia, ítems, lecturas y referencias externas, además de restricciones de revisión y cierre. El índice de un solo borrador protege el esquema propuesto; el modelo puro por sí solo no impide que dos llamadas creen valores en memoria. Ningún adaptador de D1 ejecuta esta propuesta.

El esquema todavía **no es una migración lista para producción**: la integración debe garantizar transacciones y comparación de revisión de la inspección junto con todos sus hijos, verificando que cambios o revocaciones no queden ocultos a una pestaña antigua. Las restricciones SQL por sí solas no calculan ni verifican que el vencimiento sea exactamente el de la última fecha real, no comprueban el día local de Jersey ni sustituyen validación de actor, capacidad y pertenencia de caso. Debe resolverse también el flujo de revisión posterior a una revocación, sin restaurarla silenciosamente. El disparador que bloquea eliminar referencias es una medida de prueba para impedir borrar una revocación; **no define una política de conservación ni un mecanismo de purga**, que deben diseñarse y revisarse antes de cualquier despliegue. La prueba sintética no acredita semántica D1, concurrencia de red ni recuperación de un resultado incierto.

## Comprobación

Se siguió el ciclo de prueba fallida y corrección: primero faltaban las interfaces de dominio, y después los casos nuevos reprodujeron la falta de límites en ítems, referencias, lecturas y fechas del SQL propuesto. Resultado final de `node --test --test-concurrency=1 tests/server/adm-13-inspections.test.mjs`: **17 pruebas, 17 pasan**. Regresión local con esa prueba más `tests/server/rentals-rules.test.mjs`, `notification-tasks.test.mjs`, `notification-task-producers.test.mjs` y `viewing-policy.test.mjs`: **64 pruebas, 64 pasan**, cero omitidas. Son pruebas locales de lógica y SQLite, no validan el entorno desplegado. No se ejecutaron D1/Miniflare, suite completa ni navegador; Playwright no aplica a este tramo sin UI.

## Pendiente para terminar ADM-13

1. Definir e integrar propósito de inspección, autorización por entidad/capacidad, vínculo real de tenencia, retención y ciclo de vida verificable de referencias externas; mantener cerrado hasta entonces.
2. Integrar el esquema revisado y el almacenamiento con una única autoridad, transacciones, `expectedRevision`, `checked_items_hash`, `operation_id`, idempotencia, revocación y pruebas de carrera en D1 local. No modificar migraciones históricas ya aplicadas.
3. Integrar ADM-03/NOT-11 para generar y reconciliar la tarea inicial y los avisos periódicos con el reloj compartido, sin inferir que un aviso acredita una inspección completada. Incorporar creación de reparación con confirmación humana e idempotencia.
4. Construir rutas y UI móvil protegidas, con errores y conflictos que conserven la entrada no guardada, y verificar 1280/390 px, teclado y zoom en el lanzador aislado. Sin almacenamiento offline de datos personales ni informe al propietario.
5. Ejecutar pruebas completas e integración, revisión independiente y reconciliar ficha/estado solo con evidencia del alcance realmente terminado.
