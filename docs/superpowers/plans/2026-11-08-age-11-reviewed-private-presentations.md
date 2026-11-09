# AGE-11 · Presentación con revisión adicional humana y condiciones vigentes Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Presentación privada con revisión final adicional.

**Para ejecutar/completar:** Enviar snapshot revisado; grant dormant se activa con acuse/evidencia manual. La decisión del disparador ya está respondida. Decisiones: Q10. Verificaciones: V03, V05, V10, V13. Dependencias: BUS-15, AGE-06, SPR-03, AGE-10/12, AUT-11; NOT-11 si crea gestión; canal AUT-17 o entrega manual.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Presentación con revisión adicional humana y condiciones vigentes.

**Architecture:** Consumir servicios existentes y contratos propietarios del spec, con cambios aditivos, versiones y pruebas por tarea. No duplicar reloj/correo/inventario o autoridad.

**Tech Stack:** JavaScript, D1/R2, React o página privada según superficie; node:test/e2e de Hampton. Sin infraestructura nueva.

**Spec:** [Diseño compartido](../specs/2026-11-08-list2-agency-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** BUS-15/AGE-06/SPR-03/AGE-10/AGE-12, AUT-11 y canal real o manual.

## Global Constraints

- Solo planificación; construcción futura en copia verificada y alcance propio. Migración aditiva: calcular siguiente ordinal libre y registrar ruta exacta antes de editar, sin renumerar las aplicadas. Adaptar tablas/servicios existentes en vez de duplicarlos.
- Disponibilidad general hasta información nueva, con fecha; llamada dos fechas lunes-viernes misma hora Jersey; revisión adicional para presentación. Auto no aprueba matches, criterios dictados o cierres. Respetar las dependencias externas del spec.
- UI de esta tanda: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion.
- Inglés, label/aria-describedby, status/alert, loading/vacío/error/parcial/conflicto. Staff/same-origin/no-store; portal grants por fila/medio. JSON131072bytes/lista50/poll30s visible; safeHref y texto escapado; no PII en logs/Telegram/localStorage ni HTML recibido activo.
- Ponytail reutiliza correo/reloj; impeccable product y antislop mantienen controles concretos; seguridad valida origen/versión/datos; rendimiento acota páginas. Taste/redesign no aplican a formularios de datos; sin assets/dependencias nuevas. Si no hay UI, reglas visuales/MCP no aplican a esa parte.

## Review Focus

1. Preparación del snapshot: casos enumerados en tarea1.
2. Revisión y acción de salida: casos enumerados en tarea2.
3. Preview y alternativa manual: casos enumerados en tarea3.
4. Sesión/origen inválidos o versión antigua: pruebas de rutas,401/403/409 y cero escritura.
5. Error/respuesta tardía: pruebas de conflicto/recarga sin restaurar el estado anterior. Si módulo es documental, validar su referencia/versionado, sin prueba web artificial.

## Tarea 1 · Preparación del snapshot

**Files:** server/private-presentations.js; migración presentations/items/approvals; prueba `tests/server/private-presentations.test.mjs`.

**Interfaces:** preparePresentation(env,{match_target,property_id,operation,media_ids},actor) -> {presentation_id,revision,status}.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] unapproved_blocks, unknown_availability_blocks, no_image_blocks, internal_alternative_not_sent, confirmation_date_visible. Reutilizar ficha compartida; snapshot de match/criterios/disponibilidad/medios/destinatario y grant dormant, no nueva captura o publicación.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/private-presentations.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 2 · Revisión y acción de salida

**Files:** server/private-presentations.js; server/consultation-delivery.js; server/email.js; prueba `tests/server/presentation-delivery.test.mjs`.

**Interfaces:** approvePresentation(env,id,{revision,snapshot_hash},actor); queuePresentation(env,id,{revision},actor).

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] auto_does_not_skip_extra_review, changed_image_or_match_invalidates, two_staff_single_action, unknown_no_retry, grant_activates_on_ack_only. Plantilla private_presentation separada, motor/outbound y AUT-11 compartidos. Enlace dormant antes de enviar; acuse/manual activa acceso, unknown requiere conciliación. Sin cadena24/72h.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/presentation-delivery.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 3 · Preview y alternativa manual

**Files:** server/routes/presentations.js; admin/src/PrivatePresentationReview.jsx; prueba `tests/private-presentation-ui.test.js`.

**Interfaces:** GET/POST /api/admin/presentations; POST /:id/approve, /:id/send, /:id/manual-send.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] revoked_image_before_dispatch, resolved_search_before_dispatch, manual_ready_not_sent. Preview exacto de texto/fotos/destinatario y revisión extra; manual exige evidencia. Checks/e2e/MCP hasta respuesta AGE-12, sin autoaprobar visita ni dar acceso a borradores.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/private-presentation-ui.test.js` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Cierre futuro

- [ ] Contrastar aceptación de AGE-11 en task JSON con evidencias reales; ledger propio y actualización tarea/checklist/ESTADO solo al construir, no durante esta planificación. Distinguir código, integración, aceptación de proveedor y activación real.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e con datos sintéticos y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. No dos e2e generales simultáneos en el host.
- [ ] Revisión independiente futura y corrección de hallazgos; publicación/migración bajo autorización constructora. Fake no acredita envío/modelo/canal real ni una ficha acredita activación.


**Decisión posterior B04/B05:** leer [evaluación y autorización de aclaración](../specs/2026-11-08-search-evaluation-batch-design.md). Se permite consulta general con autorización humana purpose clarification para datos imprescindibles desconocidos; evaluación sigue pending y no se presenta al cliente. La autorización es un registro propio, no shortlist automático. Mascotas incompatibles excluyen; parking flexible salvo MUST explícito conservado. AGE-03/AUT-11 aceptan referencia humana vigente y alcance de búsqueda; AGE-11 sigue exigiendo criterios/condiciones/disponibilidad/fotos y revisión extra, sin usar aclaración como aprobación de presentación.
