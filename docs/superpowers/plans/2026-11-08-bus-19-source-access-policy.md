# BUS-19 · Source access policy Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Autoridad de permiso/método por canal y registro versionado.

**Para ejecutar/completar:** Código y revisión fuente son entregas distintas: ningún permiso global. Places/Properties sin conexión actual; otras fuentes válidas continúan. Decisiones: Q07. Verificaciones: V01, V02, V03. Dependencias: Directorio/manifiesto aceptado para fuente; no exige capturar todo para construir guardia.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; este documento no la inicia.

**Goal:** Cada canal del directorio indica método permitido o pendiente manual con evidencia, sin bloquear las demás fuentes.

**Architecture:** Reutilizar el manifiesto BUS-23 y el registro BUS-06. Una sola autoridad versionada de acceso, historial y comprobación por lector; revisión de evidencia separada de captura.

**Tech Stack:** JavaScript, Cloudflare D1, React existente, node:test; sin nuevas dependencias.

**Spec:** [Diseño común, contratos1 y2](../specs/2026-11-08-list2-market-batch-design.md). Leer también [BUS-06](2026-11-09-list2-build-ready-github.md).

## Global Constraints

- Solo planificación en esta entrega; construir después en copia verificada y con alcance propio. No hay reserva por este plan.
- Homely excluido; Properties.je con permiso escrito; política por canal/método/versionado. No inferir permiso de robots, de público o del manifiesto.
- Leer hasta1048576 bytes, timeout10s, intervalo mínimo max(60s,política), HTTPS/host aprobado y redirecciones validadas. Fallo de fuente no equivale a vacío.
- Panel vigente: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, bronze-dk#86542d, ok#2f6b4f, err#a32020, warn#fff6e5 y field-line#8f8a82. Valores exactos de DESIGN.md §Colors verificado7-nov, no YAML antiguo.
- Tenor26/19px, Montserrat14px/1.5, labels12px; tarjeta24px/r14, campo r10, botón10px20px/r999; celdas10px12px; reflujo760px, foco2px/offset2 y nuevos controles44px. Copy inglés, teclado/zoom200 y roles status/alert.
- Políticas privadas/no-store, same-origin, versión servidor; evidencia personal fuera de Git/logs/modelos. Skills y criterios comunes del spec aplican; no hay rediseño ni fuentes/imágenes nuevas.

## Review Focus

1. Archivo que se declara approved no concede permiso: probar en tarea1.
2. Un permiso de feed no autoriza HTML ni otro host/canal: probar en tarea2.
3. Revocación mientras llega una respuesta impide su escritura: probar en tarea2.
4. Evidencia escrita privada no sale en el manifiesto/pantalla de lista: probar en tarea3.
5. Fuente desconocida o falta de evidencia deja un pendiente distinto de cero anuncios: comprobar en tareas1 y4.

## Tarea 1 · Decisiones e historial sin duplicar autoridad

Archivos: crear `server/market-source-policy.js`, `tests/server/market-source-policy.test.mjs`; migración nominal `migrations/0033_market_source_policy.sql`, verificar/sustituir por siguiente ordinal libre antes de editar. Leer tablas/rutas reales de BUS-06 y adaptar si ya tienen este contrato.

Interfaces: `reviewSourceAccess(env,input,actor,expectedVersion) -> Promise<SourceAccessDecision>`; `getSourceAccess(env,sourceId,channelId) -> Promise<SourceAccessDecision>`, forma exacta en spec1.

- [ ] Escribir pruebas `manifest_cannot_approve`, `unknown_source_requires_review`, `stale_version_conflicts` y `historical_decision_preserved`; sin servicio implementado deben fallar.
- [ ] Registrar una decisión vigente por fuente/canal y versiones inmutables, actor/fecha del servidor, referencias de evidencia y método. Fuente sin decisión devuelve review_required, no approved.
- [ ] Validar ID contra manifiesto aceptado; aprobar requiere evidencia y canal/hosts explícitos. Rechazar Homely y aprobación de Properties.je sin permiso escrito comprobable. No pedir ni guardar el documento privado en JSON público.
- [ ] Si BUS-06 tiene política, conservar decisiones previas y delegar su servicio en este; no mantener dos campos approved que puedan contradecirse.
- [ ] Ejecutar `node --test tests/server/market-source-policy.test.mjs`; esperar éxito y que una actualización concurrente pierda con409 sin pisar historial. Commit concreto de estos archivos tras revisión de la tarea.

## Tarea 2 · Aplicación del permiso en lectura y escritura

Archivos: modificar `server/market-source-adapters.js`, `server/market-inventory.js`, `server/market-inventory-runner.js` de BUS-06 y sus pruebas; crear `tests/server/market-source-access.test.mjs`.

Interfaz producida: `assertSourceReadAllowed(decision,{method,host,at}) -> void`. Lectores consumen la versión aprobada; `applyMarketPage` comprueba de nuevo esa versión en la transacción.

- [ ] Añadir pruebas `feed_permission_does_not_allow_html`, `channel_permission_is_scoped`, `redirect_cannot_leave_hosts` y `revoked_inflight_page_cannot_commit`; comprobar fallo inicial.
- [ ] Validar permiso antes de solicitar y antes de confirmar observaciones. Una política revocada no borra datos ya guardados ni permite nueva escritura tardía.
- [ ] Registrar intento/limitación y respetar términos, robots, user-agent identificado y frecuencia por fuente; robots inaccesible deja revisión pendiente, no un permiso supuesto.
- [ ] Mantener internal/manual y restricciones diferenciadas. Manual no permite reutilizar material cuyo uso esté excluido; no añade una vía de evasión.
- [ ] Ejecutar `node --test tests/server/market-source-policy.test.mjs tests/server/market-source-access.test.mjs tests/server/market-inventory-runner.test.mjs`; aprobar permisos por canal y rechazo atómico del caso concurrente antes del commit.

## Tarea 3 · Revisión por personal y control visible

Archivos: crear `admin/src/SourceAccessReview.jsx`, `tests/source-access-ui.test.js`, `tests/server/market-source-policy-routes.test.mjs`; modificar `server/routes/market-inventory.js` y `admin/src/MarketInventory.jsx` de BUS-06; reutilizar estilos actuales.

Interfaces: GET privado de fuente devuelve decisión y referencias autorizadas; POST `/api/admin/market-inventory/sources/:id/approve` conserva contrato BUS-06 y delega en reviewSourceAccess; incluir channel_id/method/version. Si aún no existe BUS-06, integrar esta tarea al recibirlo; no crear una segunda pantalla.

- [ ] Probar401/403, escritura desde otro origen, versión vieja409 y que la lista no incluya contenido del permiso privado.
- [ ] Mostrar `Review source access`, `Approved method`, `Manual review needed`, fecha y próximo paso. Formulario exige evidencia, método y canal; error conserva lo escrito y enlaza label/aria-describedby.
- [ ] Probar diferencia entre acceso restringido y lector aún no implementado; ninguna se representa como0properties. Acciones deshabilitadas indican qué falta.
- [ ] Ejecutar pruebas de rutas/UI y recorrido MCP1280/390, teclado, foco, zoom200, vacío/error/conflicto; sin cambiar autenticación ni permisos de Hermes.
- [ ] Commit de rutas, componente y pruebas; no registrar aprobación por una captura del formulario.

## Tarea 4 · Revisión documentada de fuentes y cierre

Archivos: crear `docs/roadmap/work/BUS-19/access-decisions.json`, `docs/roadmap/work/BUS-19/review.md`; actualizar tarea JSON/checklist/ESTADO solo con evidencias reales.

- [ ] Partir de IDs existentes y revisar condiciones vigentes en fuentes oficiales para cada canal que se vaya a usar. Registrar URL/fecha/método/restricción y no copiar contenido personal ni permisos privados a Git.
- [ ] Cobertura del directorio: cada fuente tiene decisión o trabajo manual pendiente; no se exige aprobar todas para usar las aprobadas. No reutilizar las138 fuentes como138 permisos concedidos.
- [ ] Validar referencias e IDs; contrastar una aprobada, una restringida, Homely y una decisión revocada con las pruebas del servicio.
- [ ] Ejecutar checks comunes `npm test`, `npm run build`, `npm run check:release`; e2e/MCP si cambió interfaz. Registrar fallos/bloqueos sin declarar activación. Solicitar revisión independiente futura y corregir hallazgos.
- [ ] Registrar por separado código, revisión por fuente, integración y activación; conservar pendiente la captura no realizada. Commit/push/migración solo bajo el flujo autorizado de la sesión constructora.
