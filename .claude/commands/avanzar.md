---
description: Avanza una tarea de Hampton App tras verificar automáticamente el repositorio y su commit frente a GitHub.
argument-hint: "[paquete o código, p. ej. PAQ-01 o VIS-03]"
---

Tarea de Luis: $ARGUMENTS

Usa el contrato compartido de `.agents/skills/avanzar/SKILL.md` y `docs/roadmap/AVANZAR.md` del repositorio canónico `https://github.com/andresleosan/HamptonJersey.git`, rama main. Conserva el modelo y esfuerzo de esta sesión y usa las herramientas equivalentes de Claude cuando el contrato nombre herramientas de Codex.

Antes de leer el roadmap o editar, aplica «Primero: verificar y alinear con GitHub» de esa skill. Localiza la raíz Git y comprueba el origen sin mostrar credenciales; no asumas una ruta fija ni reemplaces un repositorio ajeno. En Hermes toma primero el candado mediante el flujo existente del taller. Si no hay clon, usa una carpeta nueva permitida por ese flujo.

Ejecuta automáticamente `node scripts/check-avanzar.mjs` desde la raíz verificada y sigue su resultado y el procedimiento de la skill. Si el clon es antiguo y falta el script, usa el arranque de alineación descrito en la skill; después relee la versión actual y ejecuta el verificador. Esta comprobación también se realiza al reanudar y antes de preparar la publicación. Luis no tiene que pedirla ni comparar SHAs.

Conserva cambios y commits pendientes. No uses reset, clean, stash automático, rebase ni force-push para igualar copias. Con un SHA aprobado usa `--approved-sha <SHA completo>` y no modifiques el commit. Verificar o actualizar la copia no autoriza publicar. Respeta wrappers, autenticación y controles existentes.

Después del arranque, lee `.agents/skills/avanzar/references/equipo.md` del mismo clon. Decisión de Luis del8-nov: **la planificación no crea reservas**. Usa `node scripts/avanzar-team.mjs plan --list N --task CODIGO`: catálogo local y base verificada, sin init, credenciales, plazas, scope, lease o watch; no bloquea por otra sesión ni por una dependencia sin construir. Guarda spec/plan/ledger y relevo, sin submit/pause/complete. Cada participante conserva carpeta exclusiva y no modifica archivos ajenos.

Solo al recibir encargo de construir: status, revisión coordinadora con alcance explícito sin reserva previa y claim --mode build. El servidor comprueba revisión, dependencias, identidad, capacidad y recursos antes de conceder build; entonces watch en primer plano. Cada Hermes conserva su propio taller, candado y credencial. Sin conexión autorizada, diagnosticar construcción sin afirmar reserva; la planificación local puede continuar si su base fue comprobada. Respetar generaciones, pausas, evidencia y turno de publicación; el cliente no concede autorización de push.

Para publicar en equipo: submit provisional → release acquire → integrar main/documentos/pruebas → submit final → release renew --sha FINAL → revisión y aprobación del SHA final → congelar con TALLER_SHA_APROBADO o --approved-sha → migraciones/push autorizados → release finish. No cambies el SHA después de aprobar ni canceles un resultado incierto; conserva y reconcilia ese turno.

Un relevo no se acepta con init ni copiando sesión: en su destino usa `accept-handoff --claim <id> --generation <nueva>`, que valida procedencia, alcance y autenticación antes de guardar autoridad, conservando commits y archivos legítimos. La entrega provisional puede esperar la integración de un main que avanzó; solo submit/acquire provisionales y accept-handoff de esa misma reserva admiten esa divergencia sin aprobación, conservando autenticación y alcance. Una operación desconocida de una generación anterior revocada de esa misma reserva se archiva como desconocida, sin repetirla ni declarar éxito; otros pendientes siguen bloqueando. La entrega final exige main integrado y auditoría de commits propios/resoluciones con Git 2.36 o posterior. Tras el piloto operativo publicado en ESTADO, cualquier fallo de configuración local bloquea la incorporación a construcción, sin fallback individual para producto; no exige reservas para planificación.

Decisión vigente9-nov: usar `references/paquetes.md` de la skill; /avanzar sin argumentos retoma/elige paquete y /avanzar PAQ-* resuelve etapas locales conservando reservas por código real. Hermes programa con GPT Sol en Codex, con DeepSeek v4 max en OpenCode solo al perder acceso GPT.
