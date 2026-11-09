# AGE-14 · Supresión humana que no se restaure por ediciones obsoletas Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Supresión humana, versiones y antirrestauración.

**Para ejecutar/completar:** Mapa de copias concreto y pruebas de servidor/pestañas/outbound. No hace falta decidir borrado automático nuevo. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03, V11. Dependencias: AGE-04 base y servicios dueños de copias.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Supresión humana que no se restaure por ediciones obsoletas.

**Architecture:** Consumir servicios existentes y contratos propietarios del spec, con cambios aditivos, versiones y pruebas por tarea. No duplicar reloj/correo/inventario o autoridad.

**Tech Stack:** JavaScript, D1/R2, React o página privada según superficie; node:test/e2e de Hampton. Sin infraestructura nueva.

**Spec:** [Diseño compartido](../specs/2026-11-08-list2-agency-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** AGE-04 y conciliación de materializaciones/políticas relacionadas antes de cierre completo.

## Global Constraints

- Solo planificación; construcción futura en copia verificada y alcance propio. Migración aditiva: calcular siguiente ordinal libre y registrar ruta exacta antes de editar, sin renumerar las aplicadas. Adaptar tablas/servicios existentes en vez de duplicarlos.
- Disponibilidad general hasta información nueva, con fecha; llamada dos fechas lunes-viernes misma hora Jersey; revisión adicional para presentación. Auto no aprueba matches, criterios dictados o cierres. Respetar las dependencias externas del spec.
- UI de esta tanda: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion.
- Inglés, label/aria-describedby, status/alert, loading/vacío/error/parcial/conflicto. Staff/same-origin/no-store; portal grants por fila/medio. JSON131072bytes/lista50/poll30s visible; safeHref y texto escapado; no PII en logs/Telegram/localStorage ni HTML recibido activo.
- Ponytail reutiliza correo/reloj; impeccable product y antislop mantienen controles concretos; seguridad valida origen/versión/datos; rendimiento acota páginas. Taste/redesign no aplican a formularios de datos; sin assets/dependencias nuevas. Si no hay UI, reglas visuales/MCP no aplican a esa parte.

## Review Focus

1. Mapa y preview: casos enumerados en tarea1.
2. Supresión y barrera servidor: casos enumerados en tarea2.
3. Pestañas y fallos: casos enumerados en tarea3.
4. Sesión/origen inválidos o versión antigua: pruebas de rutas,401/403/409 y cero escritura.
5. Error/respuesta tardía: pruebas de conflicto/recarga sin restaurar el estado anterior. Si módulo es documental, validar su referencia/versionado, sin prueba web artificial.

## Tarea 1 · Mapa y preview

**Files:** server/advertiser-privacy.js; docs/roadmap/work/AGE-14/data-map.md; prueba `tests/server/advertiser-privacy-preview.test.mjs`.

**Interfaces:** previewAdvertiserSuppression(env,id) -> {version,affected_fields,related_materializations,blockers}.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] individual_name_in_scope, contact_phone_in_scope, event_copy_detected, email_copy_not_ignored, preview_read_only. Mapear copias reales y acciones pendientes sin volcar PII al documento; dependencias no depurables bloquean con causa. No prometer borrado de backups/proveedores ni datos de otros clientes.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/advertiser-privacy-preview.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 2 · Supresión y barrera servidor

**Files:** server/advertiser-privacy.js; server/routes/advertisers.js; migración privacy_version/tombstone mínima; prueba `tests/server/advertiser-suppression.test.mjs`.

**Interfaces:** suppressAdvertiserPersonalData(env,id,{version,reason,preview_hash},actor).

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] stale_put_cannot_restore, atomic_rollback, no_pii_before_snapshot_in_audit, queued_action_cancelled_or_scrubbed, retain_reason_not_fake_activity. Confirmación staff específica, revisión11meses/decisión12 sin automatismo; conservar FK/evidencia técnica no personal. No volver a ofrecer acción retirada hasta probar todas las fronteras.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/advertiser-suppression.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 3 · Pestañas y fallos

**Files:** admin/src/Advertisers.jsx; admin/src/advertiserSession.js; tests/age14-e2e.cjs; prueba `tests/advertiser-privacy-ui.test.js`.

**Interfaces:** Preview/confirmación; privacy epoch numérico y revalidación servidor.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] held_GET_after_delete, pending_POST_after_broadcast, lost_event_then_focus, offline_resume_hidden, reload_503_no_old_pii, back_navigation_no_restore. BroadcastChannel solo mejora; no PII en storage. Ocultar al reanudar/navegar hasta revalidar, descartar respuesta vieja y bloquear edición offline. MCP dospestañas/GET retenido/503 verifica DOM+inputs; no prometer borrar instantáneamente pestaña suspendida o copia leída.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/advertiser-privacy-ui.test.js` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Cierre futuro

- [ ] Contrastar aceptación de AGE-14 en task JSON con evidencias reales; ledger propio y actualización tarea/checklist/ESTADO solo al construir, no durante esta planificación. Distinguir código, integración, aceptación de proveedor y activación real.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e con datos sintéticos y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. No dos e2e generales simultáneos en el host.
- [ ] Revisión independiente futura y corrección de hallazgos; publicación/migración bajo autorización constructora. Fake no acredita envío/modelo/canal real ni una ficha acredita activación.
