# /avanzar Codex y Hermes: registro

Fecha: 6-nov-2026.

Implementado el flujo nativo de Codex en `.agents/skills/avanzar`, con referencia para analizar la siguiente tarea y elegir modelo y esfuerzo por separado. El ciclo integra las skills solicitadas, reglas concretas de DESIGN.md en cada plan y validación final con Playwright MCP cuando cambia la interfaz. El análisis se hace tras pruebas y revisión, antes del commit; la recomendación se presenta al final junto al resultado real de publicación.

Instalado en el taller sin recrear contenedores, con fuentes persistentes para futuras reconstrucciones. Hermes 1 y 2 ven las skills actualizadas; Codex carga Playwright MCP con el servidor y Chromium ya instalados. Claude conserva su comando compatible. Las skills nativas de Superpowers, antes disponibles solo como plugin de Claude, quedaron instaladas y persistidas para Codex. Se sustituyó la confirmación presencial por el sí de Telegram para el SHA exacto, manteniendo candado, solo main, rechazo de force-push y autenticación existente. No se aplicaron migraciones de producción ni se publicó código de la aplicación.

Validación:

- Skills válidas con el validador de skill-creator; Bash y TOML con sintaxis correcta.
- 19 casos offline con remotos de archivo y wrangler simulado: consultas sin publicación, falta de sí, SHA incorrecto, commit posterior al sí, candado denegado, force-push, borrado, otra rama, alias, reemplazos de objetos, migración del commit y preflight sin push.
- Playwright MCP real del taller: inicialización, Chromium, clic a 1280, teclado a 390 y dos capturas de una página sintética en memoria. No es una prueba de la aplicación.
- Instalación contrastada por hash. Por SSH desde ambos Hermes: identidades conservadas, rechazo de operaciones no autorizadas y archivos administrados no editables.
- Revisión independiente: corregida la contradicción entre recomendación y commit; añadido el Playwright MCP que faltaba en Codex. Segunda revisión conforme; la rúbrica distingue documentación mecánica (modelo ligero, low) de migración concurrente con datos personales y cobertura incompleta (modelo de mayor capacidad, xhigh).

La entrega versiona únicamente skill, referencia, spec, plan y este registro. La configuración del host y del taller permanece local. Los cambios concurrentes de otras tareas en el checkout original se conservan; el commit se prepara desde el main actual de GitHub en una copia temporal. Luis autorizó commit y push en esta sesión; el SHA y el resultado de publicación se comunican en la respuesta de entrega.
