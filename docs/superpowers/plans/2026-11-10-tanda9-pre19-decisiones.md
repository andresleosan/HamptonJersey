# PRE-19 · Reconciliación de decisiones anteriores

**Objetivo:** conservar el historial de decisiones de búsqueda y evitar que una decisión antigua reintroduzca tours o una compra de equipo 360. **Tipo:** documentación; no hay una función nueva que construir.

**Fuentes:** [tarea histórica](../../roadmap/tasks/PRE-19.json), [arquitectura histórica](../../roadmap/2026-10-23-arquitectura-hampton-app.md), [reconciliación de automatización](../../roadmap/2026-11-07-reconciliacion-automatizacion.md) y [decisiones de Lista 4](2026-11-09-lista4-inventario-y-preguntas.md). La evidencia de una decisión no demuestra que todos los componentes estén construidos o activados.

## Decisiones aplicables

- P-01 conserva inventario diario y matching SQL, con investigación profunda para casos raros según los documentos históricos; revalidar el código y planes de cada productor antes de implementarlos.
- La puerta de IA posterior es Hermes con su plan de ChatGPT, en lugar de la opción histórica AI Gateway; uso y tratamiento de datos se sujetan a los acuerdos y al alcance autorizados. No introducir AI Gateway o modelos locales solo por referencias anteriores.
- Luis descartó por ahora los tours 3D y la decisión sobre equipo 360. Solo se podrá reconsiderar más adelante mediante una decisión nueva. No planificar, construir, adquirir o activar esa capacidad como parte de PRE-19.
- Las decisiones de búsqueda se conservan sin afirmar, por eso solo, que un componente o integración exista en producción. Mantener separadas decisiones, planes, implementación, publicación y activación.

## Pasos de la gestión documental

1. [ ] Al recibir el encargo de ejecución, comprobar el `main` vigente y leer estas fuentes y la tarea PRE-19. Registrar cuáles referencias son históricas y cuál decisión posterior prevalece.
2. [ ] Revisar que los documentos de planificación aplicables no manden construir tours o equipo 360; enlazar esta reconciliación desde los documentos que la contradigan, conservando el antecedente. No borrar funcionalidades, datos o documentación histórica.
3. [ ] Registrar la revisión, la evidencia utilizada y los pendientes concretos en el seguimiento de PRE-19. Una tarea documental revisada no cierra tareas de búsqueda, infraestructura o producto cuyo resultado no esté comprobado.

**Aceptación:** un lector puede identificar la decisión vigente y distinguirla del histórico; no quedan instrucciones activas en los documentos revisados para construir tours o adquirir equipo 360; no se cambian servicios ni se envían mensajes. No se necesitan pruebas de aplicación para revisar solo documentación.
