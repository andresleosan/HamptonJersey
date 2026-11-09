# AGE-10 · Fotos aptas para presentación privada sin alterar originales Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Permisos/versiones por foto y almacenamiento privado.

**Para ejecutar/completar:** Servicio construible; cada envío concreto necesita fotos/permisos reales, sin marcas eliminadas automáticamente. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03, V10. Dependencias: SPR-03 captura compartida; AGE-04 referencia anunciante.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Fotos aptas para presentación privada sin alterar originales.

**Architecture:** Consumir servicios existentes y contratos propietarios del spec, con cambios aditivos, versiones y pruebas por tarea. No duplicar reloj/correo/inventario o autoridad.

**Tech Stack:** JavaScript, D1/R2, React o página privada según superficie; node:test/e2e de Hampton. Sin infraestructura nueva.

**Spec:** [Diseño compartido](../specs/2026-11-08-list2-agency-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** SPR-03/AGE-04; captura completa pertenece a SPR-03.

## Global Constraints

- Solo planificación; construcción futura en copia verificada y alcance propio. Migración aditiva: calcular siguiente ordinal libre y registrar ruta exacta antes de editar, sin renumerar las aplicadas. Adaptar tablas/servicios existentes en vez de duplicarlos.
- Disponibilidad general hasta información nueva, con fecha; llamada dos fechas lunes-viernes misma hora Jersey; revisión adicional para presentación. Auto no aprueba matches, criterios dictados o cierres. Respetar las dependencias externas del spec.
- UI de esta tanda: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion.
- Inglés, label/aria-describedby, status/alert, loading/vacío/error/parcial/conflicto. Staff/same-origin/no-store; portal grants por fila/medio. JSON131072bytes/lista50/poll30s visible; safeHref y texto escapado; no PII en logs/Telegram/localStorage ni HTML recibido activo.
- Ponytail reutiliza correo/reloj; impeccable product y antislop mantienen controles concretos; seguridad valida origen/versión/datos; rendimiento acota páginas. Taste/redesign no aplican a formularios de datos; sin assets/dependencias nuevas. Si no hay UI, reglas visuales/MCP no aplican a esa parte.

## Review Focus

1. Permiso por medio: casos enumerados en tarea1.
2. Lectura protegida y revocación: casos enumerados en tarea2.
3. Revisión de aptitud: casos enumerados en tarea3.
4. Sesión/origen inválidos o versión antigua: pruebas de rutas,401/403/409 y cero escritura.
5. Error/respuesta tardía: pruebas de conflicto/recarga sin restaurar el estado anterior. Si módulo es documental, validar su referencia/versionado, sin prueba web artificial.

## Tarea 1 · Permiso por medio

**Files:** server/private-media.js; esquema image_permissions/variants si no existe; prueba `tests/server/private-media.test.mjs`.

**Interfaces:** approvePrivateMedia(env,input,actor,expectedVersion) -> ImagePermission.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] marked_only_pending, original_hash_preserved, one_image_not_agency_permission, commission_not_image_permission. Original/variante/hash/evidencia/alcance por archivo; sin quitar marcas automáticamente ni permisos públicos por permiso privado.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/private-media.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 2 · Lectura protegida y revocación

**Files:** server/routes/private-media.js; server/api.js; server/private-media.js; prueba `tests/server/private-media-access.test.mjs`.

**Interfaces:** getPrivateMediaForPresentation(env,mediaId,context) -> stream; GET /api/presentations/media/:id.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] other_client_denied, guessed_id_denied, revoked_medium_denied, public_url_not_used. Comprobar grant activo/scope/pertenencia al medio en toda lectura, miniatura y range; no-store, sin URL R2 pública. Revocar bloquea futuras lecturas, no recupera copia descargada.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/private-media-access.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 3 · Revisión de aptitud

**Files:** admin/src/PrivateMediaReview.jsx; prueba `tests/private-media-review-ui.test.js`.

**Interfaces:** Componente {propertyId,mediaIds,onChange} con Pending/Allowed/Revoked.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] no_eligible_image_blocks_presentation, replacement_not_overwrites_original, stale_permission_409. Captura parcial SPR-03 visible y tarea para obtener versión apta; no afirmar éxito si faltan archivos. Checks/e2e/MCP y cero publicación de originales externos.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/private-media-review-ui.test.js` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Cierre futuro

- [ ] Contrastar aceptación de AGE-10 en task JSON con evidencias reales; ledger propio y actualización tarea/checklist/ESTADO solo al construir, no durante esta planificación. Distinguir código, integración, aceptación de proveedor y activación real.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e con datos sintéticos y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. No dos e2e generales simultáneos en el host.
- [ ] Revisión independiente futura y corrección de hallazgos; publicación/migración bajo autorización constructora. Fake no acredita envío/modelo/canal real ni una ficha acredita activación.
