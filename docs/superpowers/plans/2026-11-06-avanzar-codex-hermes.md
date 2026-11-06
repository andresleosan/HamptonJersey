# /avanzar Codex y Hermes: plan de implementación

> **Para ejecución:** usar Superpowers executing-plans en esta sesión, conservando el alcance y las autorizaciones de Luis.

**Objetivo:** usar /avanzar con Codex desde la VPS o Hermes, cerrar con pruebas y publicación y recomendar modelo y esfuerzo según la próxima tarea.

**Arquitectura:** skill de proyecto versionada, instalada también en `/etc/codex/skills` del taller. Hermes coordina decisiones, revisión y aprobación de un SHA por Telegram mediante sus envoltorios existentes.

**Tecnologías:** Markdown, Bash, Python estándar para instalación y comprobaciones temporales; Git y Docker ya instalados.

**Spec:** `docs/superpowers/specs/2026-11-06-avanzar-codex-hermes-design.md`.

## Restricciones globales

- Conservar autenticación de Hermes; no solicitar tokens por Telegram. La configuración local de Git de esta sesión es exclusiva del repositorio del host.
- Aprobación por Telegram vinculada al SHA completo; sin ejecutar aprobar-subida.sh. Conservar candado, solo main y rechazo de operaciones destructivas.
- No incluir archivos privados, datos personales ni secretos en Git. Añadir solo los archivos de esta entrega.
- Esta configuración no cambia la interfaz: Playwright no aplica a su verificación. El flujo resultante sí exige Playwright MCP al terminar tareas que cambien interfaz.
- Cada plan de interfaz debe extraer de DESIGN.md la paleta de la superficie afectada, Tenor Sans/Montserrat, tamaños y espacios, componentes y estados, contraste normal ≥4.5:1, foco ≥3:1, navegación con teclado, adaptación móvil y reduced motion; además, imágenes dimensionadas y miniaturas, validadores de URL y escape de datos. No aplicar estilos genéricos que contradigan Hampton.

## Foco de revisión

- Un --dry-run, incluso con aprobación, nunca escribe en el remoto.
- Un SHA distinto del aprobado bloquea push y migración.
- La migración usa blobs del commit aunque cambie la carpeta de trabajo.
- Hermes 1 y 2 leen el mismo flujo y preservan su identidad y candado.
- La recomendación evalúa la siguiente tarea y no reutiliza sin análisis los valores de la anterior.

## Tarea 1: skill y ciclo completo

- [ ] Crear `.agents/skills/avanzar/SKILL.md` y `references/modelo-y-esfuerzo.md`, con fases, DESIGN.md, skills, comprobaciones, relevo y recomendación.
- [ ] Adaptar las skills `avanzar` y `taller-claude` de Hermes: Codex por defecto, Claude opcional, resultados por ID y sí de Telegram.
- [ ] Mantener compatible el comando de Claude y copiar la skill de Codex al contexto de construcción de la imagen.
- [ ] Validar frontmatter y comprobar los dos casos de recomendación: tarea mecánica y tarea de arquitectura con incertidumbre.

## Tarea 2: aprobación remota de un commit

- [ ] Preparar versiones de `taller/git` y `taller/migrar-hampton` que exijan `TALLER_SHA_APROBADO`, manteniendo los límites anteriores.
- [ ] Comprobar sintaxis y comportamiento con remotos temporales de archivo, sin acceso a GitHub ni D1.
- [ ] Probar dry-run, falta de aprobación, SHA incorrecto, candado rechazado, ramas distintas, force-push y migración desde blobs.
- [ ] Actualizar las comprobaciones relevantes de `verificar.sh` sin modificar las ajenas.

## Tarea 3: instalar y entregar

- [ ] Guardar una copia de los archivos anteriores e instalar fuentes y archivos del taller en marcha sin reiniciarlo.
- [ ] Actualizar la regla antigua de Hermes 2 y confirmar que ambos ven las skills nuevas; no enviar mensajes de Telegram.
- [ ] Verificar SHA de los archivos instalados, permisos no editables, identidad, candado y rechazo de operaciones sin aprobación por las rutas SSH de ambos Hermes.
- [ ] Commit y push solo de skill, spec, plan y ledger a origin/main, con identidad andresleosan; si falta autenticación de esta sesión, comunicar el bloqueo sin pedir el token por chat.
- [ ] Registrar resultados reales en el ledger y dar instrucciones breves de uso.
