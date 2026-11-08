---
description: Avanza una tarea de Hampton App tras verificar automáticamente el repositorio y su commit frente a GitHub.
argument-hint: "[código del punto, p. ej. VIS-03]"
---

Tarea de Luis: $ARGUMENTS

Usa el contrato compartido de `.agents/skills/avanzar/SKILL.md` y `docs/roadmap/AVANZAR.md` del repositorio canónico `https://github.com/andresleosan/HamptonJersey.git`, rama main. Conserva el modelo y esfuerzo de esta sesión y usa las herramientas equivalentes de Claude cuando el contrato nombre herramientas de Codex.

Antes de leer el roadmap o editar, aplica «Primero: verificar y alinear con GitHub» de esa skill. Localiza la raíz Git y comprueba el origen sin mostrar credenciales; no asumas una ruta fija ni reemplaces un repositorio ajeno. En Hermes toma primero el candado mediante el flujo existente del taller. Si no hay clon, usa una carpeta nueva permitida por ese flujo.

Ejecuta automáticamente `node scripts/check-avanzar.mjs` desde la raíz verificada y sigue su resultado y el procedimiento de la skill. Si el clon es antiguo y falta el script, usa el arranque de alineación descrito en la skill; después relee la versión actual y ejecuta el verificador. Esta comprobación también se realiza al reanudar y antes de preparar la publicación. Luis no tiene que pedirla ni comparar SHAs.

Conserva cambios y commits pendientes. No uses reset, clean, stash automático, rebase ni force-push para igualar copias. Con un SHA aprobado usa `--approved-sha <SHA completo>` y no modifiques el commit. Verificar o actualizar la copia no autoriza publicar. Respeta wrappers, autenticación y controles existentes.
