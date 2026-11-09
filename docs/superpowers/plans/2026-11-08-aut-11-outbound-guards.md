# AUT-11 · Autorización vigente de toda salida y pausa compartida Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Autoridad de envío vigente, pausa y supresión.

**Para ejecutar/completar:** Guardia y pruebas sin canal activo son posibles; aceptación de salida exige correo operativo. C13 conserva respuesta humana del chat web. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03, V05, V13. Dependencias: BUS-15/EST-09; EST-15 antes de contacto automático; AUT-17 para email real.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Autorización vigente de toda salida y pausa compartida.

**Architecture:** Consumir servicios existentes y contratos propietarios del spec, con cambios aditivos, versiones y pruebas por tarea. No duplicar reloj/correo/inventario o autoridad.

**Tech Stack:** JavaScript, D1/R2, React o página privada según superficie; node:test/e2e de Hampton. Sin infraestructura nueva.

**Spec:** [Diseño compartido](../specs/2026-11-08-list2-agency-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** BUS-15/EST-09; EST-15 antes de consultas automáticas; AUT-17 operativo para correo real.

## Global Constraints

- Solo planificación; construcción futura en copia verificada y alcance propio. Migración aditiva: calcular siguiente ordinal libre y registrar ruta exacta antes de editar, sin renumerar las aplicadas. Adaptar tablas/servicios existentes en vez de duplicarlos.
- Disponibilidad general hasta información nueva, con fecha; llamada dos fechas lunes-viernes misma hora Jersey; revisión adicional para presentación. Auto no aprueba matches, criterios dictados o cierres. Respetar las dependencias externas del spec.
- UI de esta tanda: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion.
- Inglés, label/aria-describedby, status/alert, loading/vacío/error/parcial/conflicto. Staff/same-origin/no-store; portal grants por fila/medio. JSON131072bytes/lista50/poll30s visible; safeHref y texto escapado; no PII en logs/Telegram/localStorage ni HTML recibido activo.
- Ponytail reutiliza correo/reloj; impeccable product y antislop mantienen controles concretos; seguridad valida origen/versión/datos; rendimiento acota páginas. Taste/redesign no aplican a formularios de datos; sin assets/dependencias nuevas. Si no hay UI, reglas visuales/MCP no aplican a esa parte.

Excepción vigente: C13 de MSG-02 permite reply humano explícito del chat web activo durante pausa. Automatismos/correo siguen bloqueados; servidor determina origen, no campo cliente. Reconciliar con diseño de mensajería8-nov y CAS/versiones. No extrapolar a Meta/WhatsApp.

## Review Focus

1. Autorización única: casos enumerados en tarea1.
2. Dispatch existente: casos enumerados en tarea2.
3. Estado y recuperación: casos enumerados en tarea3.
4. Sesión/origen inválidos o versión antigua: pruebas de rutas,401/403/409 y cero escritura.
5. Error/respuesta tardía: pruebas de conflicto/recarga sin restaurar el estado anterior. Si módulo es documental, validar su referencia/versionado, sin prueba web artificial.

## Tarea 1 · Autorización única

**Files:** server/outbound-policy.js; prueba `tests/server/outbound-policy.test.mjs`.

**Interfaces:** authorizeOutbound(env,{kind,entity_id,revision,recipient_hash},at) -> {allowed,reasons,authorization_revision}.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] paused_blocks_all, only_staff_resumes, stale_match_blocks, resolved_search_blocks, unavailable_scope_blocks, presentation_extra_approval_required. Consulta general exige al menos un match aprobado vigente; cerrar uno de cinco conserva los otros, caso seleccionado inválido revoca su snapshot.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/outbound-policy.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 2 · Dispatch existente

**Files:** server/email.js; server/consultation-delivery.js; prueba `tests/server/outbound-dispatch.test.mjs`.

**Interfaces:** Revalidar antes de claim y justo antes de EMAIL.send; snapshot/revisiones en outbound.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] two_claims_single_call, pause_after_claim_blocks, material_change_invalidates, unknown_no_auto_retry. Mantener100intentos/día y supresiones; no segundo motor ni promesa exactamente-una-vez ante red incierta. Pausa no retira una llamada ya iniciada; registrar límite.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/outbound-dispatch.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 3 · Estado y recuperación

**Files:** server/routes/automations.js; admin/src/Automations.jsx; prueba `tests/outbound-policy-ui.test.js`.

**Interfaces:** Pausa/reanudación existentes y detalle {action,status,reasons}.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] unknown_not_sent, manual_channel_not_integrated, human_resume_only. Mostrar Unknown/Needs review/Cancelled sin PII en métricas. No añadir WhatsApp/SMS ni horarios ficticios. Checks de rutas/email y MCP con pausa/concurrencia/error.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/outbound-policy-ui.test.js` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Cierre futuro

- [ ] Contrastar aceptación de AUT-11 en task JSON con evidencias reales; ledger propio y actualización tarea/checklist/ESTADO solo al construir, no durante esta planificación. Distinguir código, integración, aceptación de proveedor y activación real.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e con datos sintéticos y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. No dos e2e generales simultáneos en el host.
- [ ] Revisión independiente futura y corrección de hallazgos; publicación/migración bajo autorización constructora. Fake no acredita envío/modelo/canal real ni una ficha acredita activación.


**Decisión posterior B04/B05:** leer [evaluación y autorización de aclaración](../specs/2026-11-08-search-evaluation-batch-design.md). Se permite consulta general con autorización humana purpose clarification para datos imprescindibles desconocidos; evaluación sigue pending y no se presenta al cliente. La autorización es un registro propio, no shortlist automático. Mascotas incompatibles excluyen; parking flexible salvo MUST explícito conservado. AGE-03/AUT-11 aceptan referencia humana vigente y alcance de búsqueda; AGE-11 sigue exigiendo criterios/condiciones/disponibilidad/fotos y revisión extra, sin usar aclaración como aprobación de presentación.
