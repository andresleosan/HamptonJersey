---
description: Avanza una tarea de Hampton App tras verificar automáticamente el repositorio y su commit frente a GitHub.
argument-hint: "[paquete o código, p. ej. PAQ-01 o VIS-03]"
---

<!-- LUIS-SIN-COORDINADOR-2026-11-09 -->
## Regla vigente de Luis · coordinador desactivado para avanzar · 9-nov-2026

Luis pidió expresamente desactivar el coordinador para poder avanzar las tareas. **Planificar, construir, retomar y entregar ya no requieren el coordinador.** Esta decisión posterior prevalece sobre todas las exigencias de reservas, evidencias remotas o turnos de las instrucciones siguientes y del clon, incluso después de releer una versión anterior desde GitHub.

- Usa el taller/copia propios, verifica GitHub y conserva el candado local y un solo escritor por carpeta. Retoma planes y trabajo propios; no adoptes ni borres lo ajeno. Sin argumentos, retoma el tramo pendiente o elige uno viable y anúncialo sin repetir elecciones rutinarias.
- No exijas init/status/claim/scope/watch/renew/submit/pause/complete/evidence/catalog/release ni credencial del coordinador para avanzar. No inicies renovación. Un 403, API caída, evidencia ausente o reserva antigua no bloquean la tarea. No cambies roles, claves o permisos para sortearlos.
- Comprueba dependencias técnicas con código, commits, migraciones y pruebas, y deja la evidencia real en el ledger. Conserva los bloqueos técnicos reales y continúa con lo independiente autorizado. No reconstruyas REG-08 por faltar su registro remoto; verifica commit y 0031 antes de BUS-14. Un plan antiguo no reactiva tours descartados en PRE-11.
- Los cambios locales de esta regla en las instrucciones de avanzar son mantenimiento autorizado por Luis. Identifícalos y consérvalos al clasificar Git; no los confundas con trabajo ajeno que impida retomar la tarea. Inclúyelos en la revisión del SHA que se proponga publicar, sin descartar otros cambios.
- Mantén alcance revisado, pruebas, revisión y documentación. Guarda progreso real y pendientes en ESTADO/checklist y relevo privado. El tablero remoto pasa a ser histórico y puede estar desfasado. Conserva reservas y operaciones antiguas sin cancelarlas, completarlas ni apropiarte de su trabajo.
- Publicar/migrar conserva el sí de Luis para el SHA exacto, integración de main, revisión, SHA congelado y wrappers existentes. Publica un solo equipo a la vez, acordándolo antes de integrar y revisar. Una publicación/migración incierta se comprueba antes de reintentar. Retirar el coordinador no autoriza push ni migraciones por sí solo.

El protocolo remoto descrito más abajo queda como referencia histórica, fuera del flujo obligatorio. Esta regla persiste hasta una nueva decisión de Luis. Si existe `references/sin-coordinador.md` en la skill del clon, contiene el procedimiento actualizado.
<!-- FIN LUIS-SIN-COORDINADOR-2026-11-09 -->

Tarea de Luis: $ARGUMENTS

Usa el contrato compartido de `.agents/skills/avanzar/SKILL.md` y `docs/roadmap/AVANZAR.md` del repositorio canónico `https://github.com/andresleosan/HamptonJersey.git`, rama main. Conserva el modelo y esfuerzo de esta sesión y usa las herramientas equivalentes de Claude cuando el contrato nombre herramientas de Codex.

Antes de leer el roadmap o editar, aplica «Primero: verificar y alinear con GitHub» de esa skill. Localiza la raíz Git y comprueba el origen sin mostrar credenciales; no asumas una ruta fija ni reemplaces un repositorio ajeno. En Hermes toma primero el candado mediante el flujo existente del taller. Si no hay clon, usa una carpeta nueva permitida por ese flujo.

Ejecuta automáticamente `node scripts/check-avanzar.mjs` desde la raíz verificada y sigue su resultado y el procedimiento de la skill. Si el clon es antiguo y falta el script, usa el arranque de alineación descrito en la skill; después relee la versión actual y ejecuta el verificador. Esta comprobación también se realiza al reanudar y antes de preparar la publicación. Luis no tiene que pedirla ni comparar SHAs.

Conserva cambios y commits pendientes. No uses reset, clean, stash automático, rebase ni force-push para igualar copias. Con un SHA aprobado usa `--approved-sha <SHA completo>` y no modifiques el commit. Verificar o actualizar la copia no autoriza publicar. Respeta wrappers, autenticación y controles existentes.

Después del arranque, lee `.agents/skills/avanzar/references/paquetes.md`, el spec/plan/ledger del código y `DESIGN.md`. Planificar no reserva ni autoriza producto. Para construir, exige decisión de Luis, revisión de alcance, dependencias técnicas, candado propio y turno exclusivo entre talleres; no uses el coordinador. Anota pruebas, fallos y límites reales en ledger y ESTADO/checklist, sin cambiar permisos o servicios.

Para publicar: acuerda un único turno con el otro taller, comprueba e integra main preservando trabajo, repite pruebas y revisión del SHA final, pide el sí escrito de Luis para ese SHA y migra/sube solo mediante wrappers con marcas aprobadas. No crees commits después de ese sí. Comprueba remoto, checks y web; un resultado incierto se reconcilia antes de repetir. Las reservas y generaciones antiguas se conservan sin usarlas, liberarlas ni adoptarlas.

Decisión vigente9-nov: usar `references/paquetes.md` de la skill; /avanzar sin argumentos retoma/elige paquete y /avanzar PAQ-* resuelve etapas locales sin crear reservas. Hermes programa con GPT Sol en Codex, con DeepSeek v4 max en OpenCode solo al perder acceso GPT.
