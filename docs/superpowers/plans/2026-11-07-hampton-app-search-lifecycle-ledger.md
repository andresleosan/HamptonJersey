# Ledger EST-09 · 7-nov-2026

Base d0738c77fd7a3267f9516a1514e124061baf5c1d, main en /tmp/hampton-roadmap-integration. Skill leída: .agents/skills/avanzar/SKILL.md de esa base. Plan: 2026-11-07-hampton-app-search-lifecycle.md; spec homónima.

- Luis eligió opción1 de conservación; desarrollo local autorizado. Sin autorización de publicación/migración remota.
- Ruling: ejecución propia con revisión independiente final; requisitos y política ya acordados, sin repetir aprobación de método. Un commit final código+documentación conforme avanzar.
- Ruling: migración marca duplicados activos históricos para revisión antes de crear índice único; no escoger un ganador ni perder registros. Actor/fecha de cierre nunca inferidos.
- Ruling: adaptar conservación del contacto; visitas, correo y chat mantienen plazos propios. El cierre conserva historial disponible, no promete datos personales ilimitados.
- Pre-flight: Task1 entrega estado/guards que consumen Task2 y Task3; nombres fijados en plan. Task2 entrega flags/count consumidos por Task3. Sin contratos incompatibles detectados.
- npm ci completado en worktree con lockfile existente y cache en /tmp. Main avanzado solo por fast-forward a origin/main; rama de diseño original preservada.
- Centinela: aviso al leer fixture de pruebas, verificado como constante explícitamente ficticia en SQLite :memory:, sin leer entorno real. No remediación.
- Inicio registrado: Task1 en curso, Task2–4 pendientes; los resultados finales constan a continuación.

## Implementación final

- Task1 completa: migración aditiva 0024, estado separado, transición autenticada con motivo/actor/fecha, unicidad activa por contacto/operación y versión en batch. Etapas comerciales nunca resuelven. Archivo exige resolved; restaurar conserva resolución. Históricos ambiguos y duplicados esperan decisión humana; no se pierden filas ni matches.
- Task2 completa: protección del contacto por cualquiera de sus búsquedas active/needs_review, incluso archivada; cola/count de Review retention desde el umbral existente del mes 11. Cuando todas se resuelven vuelve el plazo de 12 meses desde última actividad, con excepciones existentes. No se han ejecutado borrados reales ni cambios del cron.
- Task3 completa: formulario de decisión y motivo, Timeline, filtros de estado, cola de conservación, Matches de solo lectura e historial en Listings. Privacidad pública diferencia política de contacto de visitas/correo/chat.
- Ruling: versiones de applicants estrictamente crecientes también en edición de criterios, archivo/restauración y avance comercial. Sales calcula la nueva versión sobre la fila vigente dentro de su UPDATE; no puede devolverla hacia atrás.
- Ruling: recargar tras conflicto reconcilia los campos que no se editaron localmente; conserva lo escrito mientras llega la respuesta y el motivo de resolución. El formulario de decisión participa en la advertencia de navegación sin guardar.
- Ruling: al reabrir, un aviso nuevo enlazado al evento de reapertura devuelve Found al Inbox aunque no haya matches nuevos; los avisos resueltos previos siguen como historial. El INSERT vuelve a comprobar versión/actividad.
- Valores DESIGN corregidos en plan: se conserva la paleta ya aplicada en CSS; la cabecera YAML de DESIGN conserva valores históricos y se añadió una nota explícita para no usarlos como vigentes.

## Pruebas y revisión

- RED inicial: las 7 pruebas nuevas fallaban por contrato ausente (`/tmp/hampton-est09-red.log`). GREEN inicial 7/7; pruebas anteriores adaptadas para separar etapa y resolución sin perder aserciones de datos, archivado y conflictos.
- Reapertura sin nuevos matches: nueva aserción detectó 0 avisos abiertos en vez de 1; corregida y verde.
- Revisión independiente de todo el cambio por `gpt-6-astra`, agente `est09_final_review`, sobre diff desde d0738c7 y archivos nuevos (incluye norma avanzar 8388560). Sin Critical; dos Important, ambos corregidos en una pasada:
  1. Versión repetida bajo reloj fijo permitía cierre obsoleto. Prueba RED 200 en vez de 409; prueba final cubre criterios, Sales, archivo/restauración dentro de un milisegundo. Archivo `/tmp/hampton-est09-version-red.log` y verde correspondiente.
  2. Reload search conservaba criterios antiguos como edición local ficticia. Regresión en navegador RED presupuesto 900000 en vez de 950000, GREEN tras reconciliar formulario. Se conserva motivo y ya no se ofrece sobrescribir cambios ajenos.
- `npm test`: **630/630 JavaScript y 14/14 Python PASS**, `/tmp/hampton-est09-suite-final.log`.
- `npm run build`: **PASS**, `/tmp/hampton-est09-build-final.log`. Advertencia existente de chunk principal >500kB; sin dependencias nuevas. `npm run check:release`: **PASS**, `/tmp/hampton-est09-release-final.log`.
- Migraciones 0001–0024 aplicadas únicamente en D1 local nuevo y fixture ficticio, tanto en host como en copia temporal del taller; prueba de migración sobre esquema previo también PASS. Ninguna migración remota.
- E2E general `tests/e2e.cjs` ejecutado según cabecera contra localhost/base aislada: **NO aprobado**. Se detuvo en `publicSite`, línea130, al pulsar `.stage-nav.next`: la cabecera de la galería intercepta el clic. Es un recorrido anterior al panel; ese código de galería/cabecera no cambia en EST-09. Log `/tmp/hampton-est09-e2e.log`. No se ha demostrado de nuevo todo el recorrido general ni se ha corregido la galería dentro de esta tarea.
- `tests/search-lifecycle.e2e.cjs`: **PASS**, flujo local independiente de widgets públicos. Valida motivo vacío, foco, edición concurrente de criterios, 409/recarga sin sobrescritura, conservación del motivo, cierre, Timeline con texto escapado, reapertura por teclado, ausencia de Archive en activa, 503 simulado/reintento, 1280/390 sin desbordamiento, zoom200% escritorio, filtros y vacío. Log `/tmp/hampton-est09-ui-green.log`.
- Playwright MCP directo del host no pudo arrancar por sandbox de Chromium como root. Se utilizó el MCP instalado del taller como usuario taller, con su navegador aislado y la misma configuración temporal ya usada por el proyecto; no se modificaron red, permisos, credenciales reales ni servicios del VPS.
- **Playwright MCP PASS**: repite el flujo anterior a1280/390 y zoom200%; además Review retention, Needs review, acción Confirm still searching y protección visible. Cero pageerror; consola solo 409 de conflicto y 503 inducido, ambos recuperados. Red API termina en200. Evidencia redactada `/tmp/hampton-est09-mcp-redacted.json`; resumen `/tmp/hampton-est09-mcp.log`.
- Capturas de fixtures en `/home/taller/encargos/capturas/est09-desktop.png`, `est09-mobile-error.png`, `est09-zoom.png`, `est09-retention-mobile.png` y `est09-needs-review-mobile.png` del taller. Inspección visual del formulario móvil realizada. No se añaden a Git.
- Centinela: segunda alerta al leer una plantilla comentada de e2e; sin material criptográfico ni lectura de variables reales, falso positivo documentado privadamente. Configuración de pruebas generada desde cero, local e ignorada por Git.

## Entrega y siguiente tarea

- Re-fetch antes de entregar: origin/main sigue `d0738c77fd7a3267f9516a1514e124061baf5c1d`; es antecesor del trabajo local. Norma de arranque en commit `8388560db97b4771c81442b17878afcf6e8512aa`. Rama ajena de diseño conservada.
- ESTADO, checklist y reconciliación distinguen construido/verificado de publicado/activado; EST-09 sigue parcial hasta publicación. PRE-12 conserva pendientes de correo/portal/ventas5años y plazos de otros dominios, que no forman parte del cierre actual.
- Pendiente de Luis: aprobación del SHA final para publicación y migración0024; después verificar despliegue. No hay push ni migración remota autorizados. Pendiente de desarrollo: resolver el bloqueo del e2e general de galería antes de dar por aprobado ese recorrido completo.
- Próxima construcción analizada: **REG-11**, M03b; después REG-17. Código existente revisado: `server/applicants.js`, `site/apply.js`, `admin/src/ApplicantFields.jsx` y esquema0008/0024. Faltan modalidades comercial/negocio, semántica explícita de hogar y búsquedas relacionadas con presupuestos separados. D08 debe concretarse en el diseño; no depende de correo operativo. AGE-04/M01 puede seguir por su propio orden y sus investigaciones secuenciales.
- Modelo recomendado Codex para REG-11: **gpt-6.1-terra · high**. Catálogo local confirma modelo/esfuerzo. Implementación en formulario público, panel, validación y migración con patrones existentes; exige diseño de campos y regresiones, sin justificar ultra ni copiar xhigh de las carreras de EST-09.

## Actualización posterior a la entrega

Activación posterior autorizada por Luis sobre aea7eb5e5f0f7ae91ad5a37241755b8748d47fbd: 0024 aplicada el7-nov01:53:56UTC, sin pérdida de6contactos/6aplicantes/28matches, todos activos. Main publicado y checks Pages/Workers Builds correctos01:55:51/01:54:57UTC. Verificación pública de bundle, aviso y protección401 sin sesión completada. El marcador de recuperación y detalle operativo están en el relevo privado. El e2e general se resuelve en el ledger2026-11-07-hampton-gallery-fallback; los pendientes de arriba describen el momento previo a esa autorización.
