# Avanzar una tarea de Hampton App

Contrato compartido por Codex y Hermes, actualizado el 7-nov-2026. En Codex se invoca `$avanzar <código>`; por Telegram, `/avanzar <código>`. Sin código, se presentan tres tareas viables para que Luis elija.

La [skill versionada](../../.agents/skills/avanzar/SKILL.md) contiene el procedimiento completo. Se lee desde el clon actual de HamptonJersey, también cuando Hermes arranca una skill instalada en el taller. Esta guía enlaza el contrato; no instala ni sincroniza copias externas.

## Contexto de cada tarea

Leer [ESTADO](ESTADO.md), [checklist](checklist-hampton-app.html), [reconciliación y orden de automatización](2026-11-07-reconciliacion-automatizacion.md), [arquitectura](2026-10-23-arquitectura-hampton-app.md), spec/plan de la tarea y [DESIGN.md](../../DESIGN.md). Contrastar la documentación con código y pruebas; separar lo construido de lo que espera configuración, autorización o un proveedor externo.

El texto original de Luis y el relevo privado permanecen fuera de Git. Los requisitos públicos pueden resumirse sin copiar datos personales, credenciales ni el documento privado completo.

## Ciclo y evidencia

| Paso | Resultado comprobable |
| --- | --- |
| Brainstorming y grill-me, por tarea | Spec con comportamiento, decisiones vigentes, dependencias y preguntas abiertas resueltas antes de implementar. Reutilizar respuestas ya dadas. |
| Writing-plans | Archivos, criterios de aceptación y valores reales aplicables de DESIGN.md. Distinguir reglas vigentes de propuestas. |
| Construcción con Superpowers | Tarea completa, ledger y uso concreto de impeccable, taste-skill, redesign-skill, security-best-practices, frontend-security-coder, antislop durante el trabajo, web-performance-optimization y ponytail, con «no aplica» razonado cuando corresponda. |
| Pruebas y recorrido final | Para código: test, build y check:release. Para interfaz: e2e y Playwright MCP local a 1280 y 390, con estados, teclado, foco, zoom, consola/red y capturas. En documentación sin interfaz, Playwright no aplica. |
| Revisión y cierre | Corregir hallazgos de la tarea, distinguir pruebas pasadas/fallidas/bloqueadas y actualizar documentación. Solo después analizar la próxima tarea y recomendar modelo y esfuerzo con una razón. |
| Commit y publicación | Autorización vigente, SHA remoto y despliegue verificados por separado. No confundir implementación con activación real de una integración. |

La [rúbrica de modelo y esfuerzo](../../.agents/skills/avanzar/references/modelo-y-esfuerzo.md) se aplica después de pruebas y revisión. La recomendación se incluye en ESTADO antes del commit final revisado y se presenta al usuario al cerrar. Se conserva el modelo y esfuerzo elegidos para la tarea en curso.

## Hermes

Al abrir el encargo, Hermes transmite a Codex la lectura explícita de `.agents/skills/avanzar/SKILL.md` desde el clon actualizado y de esta guía. Retoma el mismo `thread_id` para preguntas y respuestas; conserva el candado, el modelo y esfuerzo de la tarea, y la autenticación instalada. La disponibilidad de esta guía no demuestra que una copia global haya sido actualizada.

La publicación por Hermes conserva la revisión independiente y el sí de Luis por Telegram para el SHA completo. Solo ese encargo recibe `TALLER_PUSH_APROBADO=1`, `TALLER_SHA_APROBADO=<sha completo>` y, si procede, `TALLER_MIGRACION_APROBADA=1`. HEAD y main deben coincidir con el SHA aprobado; las migraciones aprobadas preceden al push. Si cambia el commit, se revisa y aprueba de nuevo. No se alteran candados, permisos, envoltorios, credenciales ni controles para completar el flujo.

Fuera de Hermes se aplican las autorizaciones de la sesión; un push ya autorizado no exige repetir la misma pregunta. El resultado final distingue commit local, subida, despliegue y activación, con sus pendientes reales.
