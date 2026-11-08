# Avanzar una tarea de Hampton App

Contrato compartido por Codex y Hermes, actualizado el 8-nov-2026. En Codex se invoca `$avanzar <código>`; por Telegram, `/avanzar <código>`. Con coordinación activada y sin código, el servidor recupera trabajo propio o asigna la siguiente unidad viable del reparto. Si todavía no está activada, se presentan tres tareas para elección explícita, sin afirmar una reserva compartida.

La [skill versionada](../../.agents/skills/avanzar/SKILL.md) contiene el procedimiento completo. Se lee desde el clon actual de HamptonJersey, también cuando Hermes arranca una skill instalada en el taller. Esta guía enlaza el contrato; no instala ni sincroniza copias externas.

## Trabajo de equipo

La referencia canónica [equipo.md](../../.agents/skills/avanzar/references/equipo.md) contiene los comandos concretos para los cuatro puestos, inicialización privada, planificación, alcance, renovación, relevo y entrega. El cliente se ejecuta desde el repositorio con `node scripts/avanzar-team.mjs`; no necesita un binario global. Requiere Node 20.18.1 o posterior, Git 2.36 o posterior con `--remerge-diff` y `npm ci`. [Reparto de equipo](reparto-equipo.html) muestra el catálogo; como archivo local es una fotografía sin conexión.

**Estado de esta entrega local: activación pendiente.** Este cambio no configura Cloudflare Access ni identidades y el taller Hermes rechaza nuevos hostnames. No se ha validado una reserva real desde los cuatro equipos. Un endpoint nuevo requiere preparación autorizada, sin modificar controles para eludirlos. El catálogo o sus pruebas no demuestran un servicio vivo. Sin conexión no se obtiene permiso para editar ni publicar en paralelo. Tras superar el piloto de cuatro puestos, ESTADO debe publicar el estado operativo y el origen real, y este apartado debe actualizarse. Desde ese estado, una configuración local ausente o fallida bloquea la incorporación y nunca autoriza un fallback individual sin coordinador.

Los puestos son `vps`, `hermes`, `vscode` y `codex-desktop`. Hermes1 y Hermes2 comparten el mismo puesto `hermes`, el clon permitido y el candado actual; no pueden esquivarlo con otro clon. La API autenticada arbitra ocupación, dependencias y recursos. El modo plan solo permite editar documentos, aunque primero se reservan también las rutas de producto y recursos de prueba que revisará el diseño. El paso a build exige evidencia de revisión ligada a esos recursos; reservar no autoriza editar código. Para e2e del mismo equipo se reserva `e2e:<hostId>` con `scope --resource`. Las pausas y caducidades conservan conflictos hasta resolverlos. El relevo se acepta explícitamente en su destino con `accept-handoff --claim <id> --generation <nueva>`: verifica procedencia, identidad autenticada y alcance antes de guardar la generación; conserva trabajo legítimo pendiente incluso en el checkout original recuperado. `watch` renueva cada 60 segundos en primer plano; no instala servicio. Consultar estado no renueva.

Las entregas distinguen diseño, investigación aceptada, decisión, integración y activación real. El turno se toma sobre una entrega provisional para integrar main y documentos y ejecutar pruebas sin otra publicación simultánea. Si main avanzó, solo submit/adquisición provisionales y la aceptación explícita del relevo de esa misma reserva, sin aprobación, admiten esa divergencia comprobada. La recuperación archiva operaciones desconocidas de esa reserva cuya generación fue revocada, conservando su cuerpo e identificador sin repetirlas ni declararlas exitosas; los demás pendientes siguen bloqueando. La auditoría separa los commits propios y resoluciones de merge de los cambios ya publicados por otros, sin perder archivos preparados, sueltos o sin seguimiento. El SHA final debe incluir el main canónico actual y estar limpio. Después se entrega el SHA final y se actualiza ese turno con `release renew --sha FINAL`. Solo entonces se revisa y aprueba ese SHA concreto, que queda congelado por `TALLER_SHA_APROBADO` o `--approved-sha` hasta el cierre verificado. No se integra ni se añaden commits después del sí. El turno no sustituye las autorizaciones existentes, los wrappers ni el candado de Hermes. Un resultado de publicación incierto conserva el turno hasta reconciliar. El cliente nunca ejecuta push ni despliegue.

## Contexto de cada tarea

**Primero GitHub, en VPS, Hermes1/Hermes2 y PC/VS Code:** aplicar «Primero: verificar y alinear con GitHub» de la skill. Origen canónico `https://github.com/andresleosan/HamptonJersey.git`, rama main. Clonar si falta; fetch y comparación real si existe; fast-forward solo para main limpio atrasado. Conservar cambios/commits de la tarea al retomar. Para ramas o trabajo ajenos, copia aislada si el entorno la permite; en Hermes prevalecen candado y clon obligatorio. Sin red no declarar sincronización. Leer después la skill y los documentos de la copia verificada. Esto no publica ni transfiere cambios privados sin subir.

Una instalación en otro equipo necesita poder descubrir `/avanzar` o `$avanzar` una primera vez. Las copias de arranque deben contener esta comprobación y remitir a la skill versionada, sin mantener otra política independiente. Publicar la skill en GitHub no acredita que ya se haya actualizado una instalación inaccesible; registrar cuáles se comprobaron.

**Comprobación automática por invocación:** el agente ejecuta `node scripts/check-avanzar.mjs` desde la raíz del clon al iniciar o reanudar, y antes de preparar la publicación. Luis solo invoca avanzar. Requiere Git y Node, sin dependencias npm nuevas; admite `--repo <ruta>` para comprobar una copia desde otra carpeta. Funciona con raíces Git y worktrees, sin rutas fijas de VPS, Windows, VS Code o Hermes. El Git que resuelve el entorno conserva sus wrappers; en Hermes se toma primero el candado. Si una copia vieja todavía no contiene el script, el arranque de la skill la verifica y alinea antes de ejecutarlo.

El JSON deja fecha, ruta, rama, SHA local/main/remoto, relación entre commits y recuentos de cambios preparados, sin preparar y sin seguimiento. Salida `0`: main limpio e igual; `2`: clasificar trabajo local o desalineación; `1`: sincronización no verificada. Un SHA igual con archivos modificados no es una copia idéntica. La skill define cómo continuar preservando la tarea. Antes de publicar un SHA aprobado se usa `--approved-sha <SHA completo>` (o `TALLER_SHA_APROBADO` en Hermes): comprueba que el commit sigue intacto e incluye lo publicado, sin autorizar el push.

| Entorno | Entrada al contrato compartido |
| --- | --- |
| Codex en VS Code o terminal | `.agents/skills/avanzar/SKILL.md`, invocada con `$avanzar`. |
| Claude Code en VS Code o terminal | [`.claude/commands/avanzar.md`](../../.claude/commands/avanzar.md), invocada con `/avanzar`; conserva los argumentos y remite a la misma skill. |
| Hermes con Codex o Claude | Arranque instalado → candado → clon verificado → skill versionada → verificador. Conserva el flujo de publicación del taller. |

Estos archivos viajan con el repositorio. Una copia que nunca recibió este arranque necesita obtenerlo una vez mediante clon/actualización; una copia instalada antigua que ya remite a la skill del clon la relee tras alinear. No se requiere que Luis ejecute el verificador en cada tarea.

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

## E2E local reproducible

`npm run test:e2e` prepara una base D1 nueva, aplica migraciones **solo locales**, carga fixtures, compila el panel y las Pages Functions, y ejecuta `tests/e2e.cjs`. Genera credenciales ficticias en una carpeta privada temporal y las elimina al cerrar; conserva intacto `.dev.vars`. `PW` y `CHROME` siguen señalando la instalación de Playwright y Chromium del equipo, como indica la cabecera del test. En el taller:

```sh
PW=/usr/local/lib/node_modules/@playwright/mcp/node_modules/playwright-core CHROME=/opt/ms-playwright/chromium-1228/chrome-linux64/chrome npm run test:e2e
```

El servidor escucha solo en `127.0.0.1`. Sus llamadas externas usan el proxy ya configurado y sus exclusiones, mediante EnvHttpProxyAgent. Se mantiene la llamada real a Siteverify con el par oficial de claves de prueba; no se simula una respuesta aprobada. El DNS directo de workerd puede fallar aunque el navegador y el proxy sí alcancen Turnstile. No convertir esa diferencia en un bloqueo permanente ni cambiar controles de red para resolverla.

Para un recorrido MCP separado, `npm run dev:e2e` acepta `E2E_PERSIST`, `E2E_VARS` y `PORT` de un fixture local ya preparado. Exige claves de prueba; nunca reutilizar variables o datos de producción. No ejecutar dos e2e generales simultáneos: el proveedor Drive ficticio de esa suite ocupa el puerto local 8799. Build, reglas de servidor y aserciones del e2e siguen vigentes. El arreglo y la evidencia están en el [ledger del entorno](../superpowers/plans/2026-11-07-hermes-e2e-proxy-ledger.md).

## Hermes

Al abrir el encargo, Hermes transmite a Codex la lectura explícita de `.agents/skills/avanzar/SKILL.md` desde el clon actualizado y de esta guía. Retoma el mismo `thread_id` para preguntas y respuestas; conserva el candado, el modelo y esfuerzo de la tarea, y la autenticación instalada. La disponibilidad de esta guía no demuestra que una copia global haya sido actualizada.

La publicación por Hermes conserva la revisión independiente y el sí de Luis por Telegram para el SHA completo. Solo ese encargo recibe `TALLER_PUSH_APROBADO=1`, `TALLER_SHA_APROBADO=<sha completo>` y, si procede, `TALLER_MIGRACION_APROBADA=1`. HEAD y main deben coincidir con el SHA aprobado; las migraciones aprobadas preceden al push. Si cambia el commit, se revisa y aprueba de nuevo. No se alteran candados, permisos, envoltorios, credenciales ni controles para completar el flujo.

Fuera de Hermes se aplican las autorizaciones de la sesión; un push ya autorizado no exige repetir la misma pregunta. El resultado final distingue commit local, subida, despliegue y activación, con sus pendientes reales.
