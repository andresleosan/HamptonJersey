# Avanzar Hampton App

`/avanzar` (Claude Code y Hermes) o `$avanzar` (Codex) trabaja el checklist en bucle hasta que no quede trabajo viable. Las reglas viven en dos archivos; este documento solo orienta y guarda la referencia de pruebas.

| Qué | Dónde |
| --- | --- |
| Procedimiento completo | [.agents/skills/avanzar/SKILL.md](../../.agents/skills/avanzar/SKILL.md) |
| Lo que Luis autorizó y lo que no | [CONTINUIDAD-AVANZAR.md](CONTINUIDAD-AVANZAR.md) |
| Qué tarea toca ahora | `node scripts/avanzar-ruta.mjs` |
| Lo que espera a Luis, Hampton o terceros | [COLA-LUIS.md](COLA-LUIS.md) |
| Mejoras que no bloquean un cierre | [MEJORAS.md](MEJORAS.md) |
| Ficha y evidencia de cada tarea | `docs/roadmap/tasks/<CÓDIGO>.json` y `docs/roadmap/work/<CÓDIGO>/` |
| Plan de cada tarea | `node scripts/plan-packages.mjs --task <CÓDIGO>` (campo `planReferences`) |
| Registro de cierres | [ESTADO.md](ESTADO.md), una línea por cierre arriba del todo |

El 14-nov-2026 Luis pidió simplificar el flujo para terminar antes: se retiraron el coordinador, las reservas, los turnos entre talleres y el ciclo obligatorio de brainstorming, grill-me y spec por tarea. Los planes y ledgers anteriores que los mencionan son historia; su texto anterior está en el historial de Git.

Cada entorno entra por su archivo de arranque y termina en la misma skill: Codex por `.agents/skills/avanzar/SKILL.md`, Claude Code por [`.claude/commands/avanzar.md`](../../.claude/commands/avanzar.md) y Hermes por la skill instalada en su taller, que lee la del clon actualizado y conserva su candado, sus envoltorios y el sí por Telegram.

## Preparar las pruebas como parte de cada tarea · 9-nov-2026

Luis pide que las tareas no se queden abiertas por falta de preparar o ejecutar pruebas. El agente incluye en la entrega fixtures representativos, forma reproducible de ejecutar el recorrido, validaciones/errores, resultados y corrección de los fallos encontrados. Reutiliza primero el lanzador local y las herramientas disponibles; un fallo de una herramienta no sustituye la investigación de otra vía autorizada que compruebe el mismo comportamiento. Registra con precisión qué herramienta y entorno se usaron.

Antes de pedir intervención humana, contrasta la matriz de aceptación con la evidencia real y concreta qué criterio falta. La comprobación manual se limita al acceso o comportamiento externo que de verdad la requiera; no se exige repetir en producción todos los casos ya comprobados localmente si el alcance aprobado no lo exige. Si un criterio requiere el servicio real, se prueba o se conserva ese bloqueo concreto: no se elimina para cerrar. Los datos ficticios y las mutaciones de ensayo van en fixtures locales; no se añaden administradores de producción ni se intercambian credenciales por chat para sustituir la preparación de pruebas. Se mantienen autorización de publicación, controles del entorno y evidencia honesta.

## Alternativa de navegador aislado

Guía de requisitos, comandos y límites: [Pruebas de WebKit aislado](../PRUEBAS-WEBKIT.md).

Si Playwright MCP no puede arrancar, `E2E_PRODUCTION_READONLY=0 npm run test:e2e:isolated` ejecuta los recorridos disponibles con Playwright y WebKit real en un contenedor temporal sin red, con fixtures locales. Para el recorrido de zonas y mascotas, usar `E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/reg06-area-e2e.cjs npm run test:e2e:isolated`. La asignación explícita de la variable evita heredar el modo de producción de otra ejecución. La ejecución debe cubrir los estados y dispositivos aplicables, conservar capturas y registrar el resultado. La suite general no vigila de forma completa los fallos de red: añade esa comprobación al recorrido afectado. El fixture aislado sustituye Turnstile, usa un certificado local, emula el portapapeles y no carga fuentes externas: no acredita esos servicios ni la producción. Si falta comprobar algún criterio, permanece pendiente.

## E2E local reproducible

`npm run test:e2e` prepara una base D1 nueva, aplica migraciones **solo locales**, carga fixtures, compila el panel y las Pages Functions, y ejecuta `tests/e2e.cjs`. Genera credenciales ficticias en una carpeta privada temporal y las elimina al cerrar; conserva intacto `.dev.vars`. `PW` y `CHROME` siguen señalando la instalación de Playwright y Chromium del equipo, como indica la cabecera del test. En el taller:

```sh
PW=/usr/local/lib/node_modules/@playwright/mcp/node_modules/playwright-core CHROME=/opt/ms-playwright/chromium-1228/chrome-linux64/chrome npm run test:e2e
```

El servidor escucha solo en `127.0.0.1`. Sus llamadas externas usan el proxy ya configurado y sus exclusiones, mediante EnvHttpProxyAgent. Se mantiene la llamada real a Siteverify con el par oficial de claves de prueba; no se simula una respuesta aprobada. El DNS directo de workerd puede fallar aunque el navegador y el proxy sí alcancen Turnstile. No convertir esa diferencia en un bloqueo permanente ni cambiar controles de red para resolverla.

Para un recorrido MCP separado, `npm run dev:e2e` acepta `E2E_PERSIST`, `E2E_VARS` y `PORT` de un fixture local ya preparado. Exige claves de prueba; nunca reutilizar variables o datos de producción. No ejecutar dos e2e generales simultáneos **en el mismo taller/host**: el proveedor Drive ficticio de esa suite ocupa el puerto local 8799. Build, reglas de servidor y aserciones del e2e siguen vigentes. El arreglo y la evidencia están en el [ledger del entorno](../superpowers/plans/2026-11-07-hermes-e2e-proxy-ledger.md).
