# Comprobación automática de repositorio y commit en avanzar

Petición: comprobar en cada instancia de VS Code o Hermes que avanzar usa el repositorio canónico y conoce su relación real con el commit publicado, sin comparación manual de Luis.

Base verificada el 8-nov-2026: `cfb3d3c2bb6660c6c68f5175c80cbedd8d6c2d1c` en main. Se conserva la copia inicial en otra rama con sus archivos pendientes; se reutiliza el worktree main previamente limpio, actualizado por fast-forward.

## Decisiones y plan

- Script `scripts/check-avanzar.mjs` con Node estándar y Git del PATH; sin instalar dependencias, hooks ni servicios. Entrada desde cualquier raíz/worktree, `--repo` opcional. Identidad canónica HTTPS/SSH, fetch explícito de main y consulta remota actual para evitar falsos positivos por referencias antiguas. No muestra URLs de autenticación ni errores crudos de Git.
- JSON con SHA, relación entre commits y cambios locales. Igualdad de SHA y limpieza son comprobaciones distintas. Clasificación separada de integración: el script conserva HEAD, índice y archivos; la skill aplica fast-forward solo cuando ya está autorizado y es seguro.
- La skill exige ejecución al iniciar/reanudar, preparar publicación y comprobar SHA aprobado. Se respeta candado de Hermes y congelación del commit aprobado. La verificación no concede autorización de publicación.
- Pruebas con repositorios temporales: igualdad, adelanto/atraso/divergencia, cambios locales, origen distinto, ausencia de red, refspec distinto, worktree y commit aprobado. Ninguna prueba usa credenciales o datos de producción.
- Actualizar el contrato AVANZAR, comando npm y entrada de Claude `.claude/commands/avanzar.md`, que remite a la misma skill sin duplicar su política. El checklist del producto no cambia: no se entrega una funcionalidad de negocio.

Skills aplicadas: avanzar como contrato existente, skill-creator para modificación acotada y comprobación del recurso ejecutable. Revisión independiente del script y pruebas. DESIGN.md: sin superficie visual; colores, tipografía, tamaños y movimiento no aplican. Regla de Rendimiento: ninguna librería nueva sin razón; se usa únicamente Node estándar. No cambia frontend, datos personales ni infraestructura. Playwright: no aplica.

## Evidencia y distribución

- `node --test tests/check-avanzar.test.js`: 25/25. Git real con remotos bare temporales; se simulan únicamente las URLs canónicas y fallos de transporte, sin red. Se corrigieron la variable de aprobación vacía y el mapeo configurado que podía mover una rama local ajena. Fetch usa `--refmap=`, `--no-tags` y `--no-prune`; preserva referencias ajenas y el estado local.
- `npm test`: 767/767 pruebas Node y 14/14 Python. `npm run build` y `npm run check:release`: correctos. Build conserva el aviso de tamaño del bundle existente; no se modificó código de aplicación.
- Ejecución real contra GitHub: main con HEAD/remoto iguales informa cambios locales pendientes de esta tarea; la copia inicial informa otra rama y 40 commits de atraso, sin cambiar su HEAD ni sus archivos.
- Revisión independiente: sin hallazgos bloqueantes pendientes. `git diff --check` correcto. Frontmatter y entradas Codex/Claude comprobados con Python estándar; `quick_validate.py` no pudo arrancar por PyYAML ausente. No se instalaron dependencias globales. Playwright: no aplica.
- Preparado para commit y publicación, pendiente de autorización de push de esta sesión. Las instalaciones existentes que ya remiten al clon actualizado obtendrán el comando al actualizar desde GitHub. La entrada Claude viaja ahora en el repositorio; solo se incorpora ese archivo de `.claude`, nunca el relevo privado. No se acredita ejecución real en Windows/VS Code ni en wrappers de Hermes: esa comprobación requiere esos entornos.
