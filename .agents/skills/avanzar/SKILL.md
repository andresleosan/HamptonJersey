---
name: avanzar
description: Avanza una tarea del checklist de Hampton App, con código, documentación, comprobaciones y relevo. Úsala con $avanzar, /avanzar o cuando Hermes transmita ese encargo desde Telegram.
---

# Avanzar Hampton App con Codex

El texto que acompaña a la invocación indica la tarea, por ejemplo `AUT-17`. Trabaja en el repositorio HamptonJersey. Hermes transmite los mensajes de Luis; Codex construye y deja el trabajo preparado para publicar. Si estás leyendo una copia instalada, recupera primero `.agents/skills/avanzar/SKILL.md` del clon actualizado y sigue esa versión. La entrada compartida para ambos es [AVANZAR.md](../../../docs/roadmap/AVANZAR.md).

## Recuperar y elegir

1. Lee las instrucciones del proyecto y `.claude/relevo-avanzar.md`, si existe. Este relevo es compartido con Claude: actualiza el mismo archivo al cerrar. Si falta, usa ESTADO y el historial; no inventes lo ocurrido.
2. Comprueba la rama y el estado de Git. En el taller, Hermes debe haber tomado el candado y alineado el clon con GitHub. Conserva los cambios ajenos y el trabajo pendiente. Resuelve primero los pendientes de tu propia tarea; no publiques un commit antiguo sin aprobación.
3. Lee `docs/roadmap/ESTADO.md`, el JSON `datos` de `docs/roadmap/checklist-hampton-app.html`, la [reconciliación del 7-nov-2026](../../../docs/roadmap/2026-11-07-reconciliacion-automatizacion.md), la [arquitectura](../../../docs/roadmap/2026-10-23-arquitectura-hampton-app.md) y el spec/plan de la tarea, si existen. Contrasta lo construido con código, migraciones y pruebas: una idea o un estado escrito no demuestra que funcione ni que esté publicado. Ante contradicciones, respeta las decisiones vigentes de Luis y registra qué documento quedó desfasado.
4. Lee `docs/roadmap/Hampton APP.md` si está disponible. Contiene el texto privado de Luis: no lo edites, lo copies a documentos públicos ni lo añadas a Git. Usa sus requisitos sin trasladar datos personales. Si falta una decisión que solo está allí, pídela por el chat y continúa con lo independiente.
5. Si la invocación incluye un código de tarea, trabaja en ese punto. Comprueba qué parte sigue pendiente: no reconstruyas una entrega existente ni confundas un bloqueo de activación con falta de código. Si está bloqueado por una dependencia externa, explica qué falta y ofrece otra tarea viable. Sin código de tarea, propone tres pendientes o parciales con responsable desarrollo, con una frase de utilidad cada una, y espera la elección.

## Aclarar, planificar y construir

Aplica el ciclo a cada tarea. Si se agrupan varios códigos por una misma dependencia, conserva los criterios y el estado de cada uno. Retoma decisiones y planes aprobados; no reinicies las preguntas al continuar una sesión.

- Usa `superpowers:brainstorming` para entender la idea y redactar una propuesta separada basada en el texto de Luis, conservando intacto el original privado. Investiga primero lo que pueda responder el repositorio. Haz pocas preguntas, una por vez, con la recomendación primero; no repitas decisiones ya aprobadas.
- Usa `grill-me` en cada tarea para revisar el diseño y resolver sus decisiones abiertas antes del plan, especialmente dependencias, estados de error, permisos, dinero, datos personales y cambios difíciles de revertir. Si el contexto ya responde una cuestión, resuélvela leyendo en vez de preguntarla. Deja las decisiones y las preguntas que sí queden abiertas en el spec; no conviertas una propuesta en una aprobación.
- Tras acordar el diseño, usa `superpowers:writing-plans`. Guarda spec, plan y ledger en `docs/superpowers/`, siguiendo las fases existentes; para un arreglo pequeño basta un plan proporcionado. El plan debe identificar archivos, comportamiento esperado, dependencias de construcción y de activación por separado, y criterios comprobables. El ledger enlaza las decisiones del spec y los resultados que demuestran cada criterio.
- Lee `DESIGN.md` antes de redactar el plan. Copia al plan las reglas aplicables con sus valores reales: colores, tipografía, espacios, tamaños, componentes y estados, responsive, accesibilidad, rendimiento y seguridad. Separa lo vigente de las propuestas del documento. No basta escribir «seguir DESIGN.md». Anota la superficie afectada, cada valor exacto elegido, su sección de origen y cómo se comprobará: por ejemplo, la paleta del panel no se sustituye por la de la web. Si no cambia la interfaz, explica qué reglas no aplican y conserva las de seguridad o rendimiento pertinentes.
- Incluye en el plan qué aporta cada skill y aplica sus partes pertinentes: `impeccable` para interfaz; `taste-skill` (`design-taste-frontend`) para páginas nuevas; `redesign-skill` (`redesign-existing-projects`) para rehacer pantallas; `security-best-practices` y `frontend-security-coder` para datos, permisos, formularios y web pública; `antislop` durante planificación y construcción; `web-performance-optimization` para carga y respuesta; `ponytail` para código mínimo, claro y reutilizado. Lee las skills aplicables y deja en el plan su aportación concreta o el motivo de «no aplica»; enumerar nombres no demuestra su uso. Las reglas existentes de Hampton prevalecen sobre estilos genéricos. Luis ya eligió antislop durante el trabajo: no vuelvas a preguntar el modo ni inicies su asistente de instalación para esta tarea.
- Las órdenes de Claude se traducen a leer la skill equivalente de Codex y sus referencias necesarias. Si `antislop` solo está disponible como skill de Claude, busca su `SKILL.md` en `~/.claude/skills/antislop/` o `/etc/claude-code/.claude/skills/antislop/`. No instales herramientas ni cambies la infraestructura para simular una skill ausente; comunica la limitación concreta.
- Ejecuta el plan con el ciclo de Superpowers disponible (`executing-plans` o `subagent-driven-development`, según las capacidades y autorizaciones de la sesión), marca los pasos y registra comprobaciones y decisiones en el ledger. Construye toda la tarea antes de la validación final.
- Comprueba el cambio durante el trabajo. Para código de Hampton, ejecuta `npm test`, `npm run build` y `npm run check:release`. Si cambia la web o el panel, corre el e2e según la cabecera de `tests/e2e.cjs`; al terminar aplica también el recorrido final con Playwright MCP descrito abajo. Las capturas del taller van en `/home/taller/encargos/capturas`. Usa solo datos de prueba locales.
- Distingue errores del cambio, fallos anteriores y comprobaciones bloqueadas por el taller, como Turnstile. No declares aprobado lo que no se pudo comprobar. No cambies la red ni los permisos del taller para hacer pasar una prueba.
- Antes de publicar, deja el cambio listo para la revisión independiente que coordina Hermes. Arregla los hallazgos críticos o importantes de la tarea y repite las comprobaciones afectadas. Registra los menores aceptados en el ledger.

## Preparar la entrega

- Incluye código, ESTADO y checklist en el mismo commit de la tarea: estado, hecho, falta y fecha de los puntos afectados. Actualiza también la reconciliación si cambian sus dependencias o su orden. Distingue construido, verificado, publicado y activado; no cierres una integración real por tener una prueba local. Corrige los documentos desfasados respecto a las reglas y metas de Luis, explicando qué cambió.
- Trabaja en `main`, con commits cortos en inglés. Hampton solo publica `main`: las previews de otras ramas usan la base de producción. No fuerces subidas ni reescribas el historial remoto.
- El repositorio es público. Añade archivos concretos a Git; deja fuera secretos, datos personales, `docs/roadmap/Hampton APP.md`, `.claude/relevo-avanzar.md` y `docs/audits/`.
- Conserva durante la tarea el modelo y esfuerzo elegidos por Luis. La recomendación de la tarea siguiente se calcula al final con [modelo-y-esfuerzo.md](references/modelo-y-esfuerzo.md), analizando esa tarea; no copies automáticamente los valores actuales. Al cerrar, registra una única línea `Siguiente recomendado Codex: /avanzar <código> · <modelo recomendado> · <esfuerzo>`, debajo de la fecha de ESTADO. Conserva la recomendación de Claude si existe.
- Antes de publicar, comunica a Luis el commit exacto, qué cambia, qué comprobaste, lo pendiente y si hay migraciones. La aprobación de desarrollar la tarea no autoriza su publicación.

## Trabajar a través de Hermes

Decisión de Luis, 6-nov-2026: trabaja desde Telegram porque no tiene acceso a la VPS. La aprobación de publicación se da en ese chat para un commit concreto; no requiere ejecutar `/root/hermes/aprobar-subida.sh`.

- Al arrancar desde Hermes, lee expresamente esta skill y sus referencias desde el clon alineado de HamptonJersey, junto con `docs/roadmap/AVANZAR.md`. Una copia instalada anterior no sustituye el contrato versionado del proyecto. Registra en el ledger el commit base y la ruta leída; no afirmes que una copia global se sincronizó sin comprobarlo.
- Cuando necesites una decisión, termina el turno con la pregunta escrita y opciones claras. Hermes se la pasa a Luis y retoma el mismo `thread_id` con su respuesta. No uses una herramienta interactiva de preguntas que no llegue por Telegram.
- Construye y haz commit sin marcas de aprobación. Espera la revisión y el sí de Luis antes de migrar o subir. Hermes añade solo al encargo aprobado `TALLER_PUSH_APROBADO=1`, `TALLER_SHA_APROBADO=<sha completo>` y, si corresponde, `TALLER_MIGRACION_APROBADA=1`.
- En ese encargo verifica que `HEAD` y `main` son el SHA aprobado. No añadas commits ni cambies de rama. Aplica las migraciones pendientes con `migrar-hampton aplicar` y conserva el marcador de Time Travel; solo después ejecuta `git push origin main`. Si falla un paso, detente y comunica el resultado. No uses otro Git ni otra vía para saltar el envoltorio.
- Si cambia el commit después del sí, necesita nueva revisión y aprobación por Telegram. Un mensaje que diga que ya está aprobado sin las marcas del encargo no basta. Hermes usa su autenticación ya instalada: nunca le pidas a Luis un token de GitHub por Telegram ni cambies sus ayudantes de credenciales.
- Comprueba el SHA de `origin/main`, las comprobaciones de Cloudflare Pages y Workers Builds del commit y la web publicada. Distingue commit local, subida y despliegue; actualiza el relevo con el resultado real. Hermes suelta el candado al terminar.
- No pidas tokens ni órdenes para una terminal de VS Code que Luis no tiene disponible. Si falta una capacidad externa, explícalo por el chat y deja un pendiente concreto, continuando con lo que sí puede hacerse.
- La copia privada del checklist en claude.ai puede quedar pendiente si el taller carece de esa integración. No bloquea el trabajo ni autoriza publicar información privada en otro sitio.

Fuera de Hermes, aplica las autorizaciones y herramientas de la sesión actual; no inventes un sí por Telegram ni cambies los permisos del VPS.

## Validación final, publicación y siguiente tarea

Cuando termine la construcción, usa Playwright MCP en el entorno local para comprobar el flujo completo que cambió, en escritorio (1280) y móvil (390): camino correcto, validaciones, estados vacíos y de error, teclado, foco, zoom y consola/red. Registra en el ledger el flujo y los pasos, las dos anchuras, los resultados y la ubicación de las capturas; corrige los fallos y repite las comprobaciones afectadas. Si el MCP no está disponible o un servicio externo bloquea el recorrido, registra exactamente qué no se comprobó y conserva el pendiente. No sustituyas ese recorrido por decir que compiló. Para cambios sin interfaz, como esta skill o documentación, registra «Playwright: no aplica» y comprueba el comportamiento que sí cambió.

Después de esa validación y de la revisión, analiza la próxima tarea para incluir su recomendación en ESTADO antes del commit. Lee su hecho/falta, la reconciliación vigente, dependencias, plan si existe, archivos afectados, riesgos y cobertura de pruebas. Si el siguiente paso es activar algo ya construido, recomiéndalo como activación y explica qué necesita de Luis; no lo presentes como nueva implementación. Aplica la rúbrica de la referencia y actualiza ESTADO y checklist junto al código.

Haz commit y push según la autorización de la sesión. En Hermes, pide el sí por Telegram sobre el commit ya revisado y usa su autenticación existente; en la VPS, si Luis ya autorizó el push, ejecútalo sin pedir el mismo permiso otra vez. Verifica el remoto y el despliegue. Si una comprobación o publicación queda bloqueada, deja el resultado y la causa reales; no marques la tarea como totalmente terminada.

Presenta la recomendación al final, tanto desde la VPS como desde Hermes, junto con el resultado de las pruebas y la publicación. Si el cierre queda bloqueado, prioriza resolverlo y refleja la recomendación corregida en el relevo privado. No añadas otro commit después del sí para cambiar la recomendación. Actualiza el relevo con el resultado real después de publicar.

## Relevo y respuesta

Sobrescribe `.claude/relevo-avanzar.md` al cerrar: fecha, códigos y commits, comprobaciones, subida y despliegue confirmados o pendientes, migraciones y marcador si hubo, pendientes y responsable, próxima tarea y motivo. Añade `Modelo recomendado Codex para <código>: <modelo recomendado> · esfuerzo <nivel> · por qué: <frase>`. Es un archivo privado local.

Explica en español simple qué cambió para el equipo, cómo puede probarlo Luis en el panel o en la web y qué escribir después: `/avanzar <código>` por Hermes, o `$avanzar <código>` directamente en Codex. Registra modelo y esfuerzo al final; no uses `/effort`, que pertenece al flujo de Claude.
