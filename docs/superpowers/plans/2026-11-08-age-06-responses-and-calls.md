# AGE-06 · Respuestas útiles y llamadas con evidencia, alcance y prioridad humana Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Respuesta útil/llamada con evidencia y alcance.

**Para ejecutar/completar:** Personal valida respuesta y actualiza solo alcance confirmado; estado independiente. No hace falta IA para procesar manualmente. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03. Dependencias: AGE-03/05, EST-13; hechos comerciales consumen EST-16/15.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Respuestas útiles y llamadas con evidencia, alcance y prioridad humana.

**Architecture:** Consumir servicios existentes y contratos propietarios del spec, con cambios aditivos, versiones y pruebas por tarea. No duplicar reloj/correo/inventario o autoridad.

**Tech Stack:** JavaScript, D1/R2, React o página privada según superficie; node:test/e2e de Hampton. Sin infraestructura nueva.

**Spec:** [Diseño compartido](../specs/2026-11-08-list2-agency-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** AGE-03/05/EST-13; hechos comerciales consumen EST-16/15.

## Global Constraints

- Solo planificación; construcción futura en copia verificada y alcance propio. Migración aditiva: calcular siguiente ordinal libre y registrar ruta exacta antes de editar, sin renumerar las aplicadas. Adaptar tablas/servicios existentes en vez de duplicarlos.
- Disponibilidad general hasta información nueva, con fecha; llamada dos fechas lunes-viernes misma hora Jersey; revisión adicional para presentación. Auto no aprueba matches, criterios dictados o cierres. Respetar las dependencias externas del spec.
- UI de esta tanda: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion.
- Inglés, label/aria-describedby, status/alert, loading/vacío/error/parcial/conflicto. Staff/same-origin/no-store; portal grants por fila/medio. JSON131072bytes/lista50/poll30s visible; safeHref y texto escapado; no PII en logs/Telegram/localStorage ni HTML recibido activo.
- Ponytail reutiliza correo/reloj; impeccable product y antislop mantienen controles concretos; seguridad valida origen/versión/datos; rendimiento acota páginas. Taste/redesign no aplican a formularios de datos; sin assets/dependencias nuevas. Si no hay UI, reglas visuales/MCP no aplican a esa parte.

## Review Focus

1. Vínculo y tipado: casos enumerados en tarea1.
2. Propagación de hechos: casos enumerados en tarea2.
3. Revisión y llamada: casos enumerados en tarea3.
4. Sesión/origen inválidos o versión antigua: pruebas de rutas,401/403/409 y cero escritura.
5. Error/respuesta tardía: pruebas de conflicto/recarga sin restaurar el estado anterior. Si módulo es documental, validar su referencia/versionado, sin prueba web artificial.

## Tarea 1 · Vínculo y tipado

**Files:** server/consultation-responses.js; server/email-inbound.js; prueba `tests/server/consultation-responses.test.mjs`.

**Interfaces:** recordConsultationResponse(env,id,{revision,kind,evidence_ref,scope,availability,conditions,received_at},actor).

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] auto_ack_not_useful, spoofed_from_not_identity, wrong_property_not_linked, duplicate_inbound_not_reapplied, reply_without_sent_at_stored. Headers son pista; personal confirma vínculo y alcance. Referenciar raw existente con su retención, no duplicarlo entero.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/consultation-responses.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 2 · Propagación de hechos

**Files:** server/consultation-responses.js; adaptador EST-13/16/15; prueba `tests/server/consultation-availability.test.mjs`.

**Interfaces:** applyConsultationOutcome(env,responseId,actor,expectedVersion) -> {facts,affected,pending}.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] general_available_no_expiry, new_contradiction_needs_review, human_fact_beats_old_web, unavailable_only_this_operation, one_household_not_all, search_stays_active. Mostrar fecha/fuente; no contestar no equivale a baja ni visita confirmada. Resolver solo aspectos contestados y mantener condiciones pendientes.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/consultation-availability.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 3 · Revisión y llamada

**Files:** server/routes/consultations.js; admin/src/ConsultationResponse.jsx; prueba `tests/consultation-response-ui.test.js`.

**Interfaces:** POST /api/admin/consultations/:id/responses; útil/acuse/ambigua/inconclusa.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] late_response_updates_call, stale_call_outcome_409, no_auto_ia_confirmation. Quién/cuándo/qué alcance y evidencia; IA no es requisito ni confirma autónomamente. Checks de recepción/propagación y MCP con respuesta mientras la llamada está abierta.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/consultation-response-ui.test.js` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Cierre futuro

- [ ] Contrastar aceptación de AGE-06 en task JSON con evidencias reales; ledger propio y actualización tarea/checklist/ESTADO solo al construir, no durante esta planificación. Distinguir código, integración, aceptación de proveedor y activación real.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e con datos sintéticos y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. No dos e2e generales simultáneos en el host.
- [ ] Revisión independiente futura y corrección de hallazgos; publicación/migración bajo autorización constructora. Fake no acredita envío/modelo/canal real ni una ficha acredita activación.
