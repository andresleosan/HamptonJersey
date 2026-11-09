# AGE-08 · Una Call tras dos días M-F sin respuesta útil Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Gestión de llamada única tras dos fechas lunes-viernes.

**Para ejecutar/completar:** Probar jueves->lunes/viernes->martes, misma horaJersey desde envío real, respuesta útil cancela/actualiza. Decisión ya resuelta, no preguntar plazo. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03. Dependencias: AGE-05/06/04; AUT-07 reloj existente; NOT-11 tareas/responsables/plazos.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Una Call tras dos días M-F sin respuesta útil.

**Architecture:** Consumir servicios existentes y contratos propietarios del spec, con cambios aditivos, versiones y pruebas por tarea. No duplicar reloj/correo/inventario o autoridad.

**Tech Stack:** JavaScript, D1/R2, React o página privada según superficie; node:test/e2e de Hampton. Sin infraestructura nueva.

**Spec:** [Diseño compartido](../specs/2026-11-08-list2-agency-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** AGE-05/06/04/AUT-07/NOT-11; reutilizar tarea y reloj existentes.

## Global Constraints

- Solo planificación; construcción futura en copia verificada y alcance propio. Migración aditiva: calcular siguiente ordinal libre y registrar ruta exacta antes de editar, sin renumerar las aplicadas. Adaptar tablas/servicios existentes en vez de duplicarlos.
- Disponibilidad general hasta información nueva, con fecha; llamada dos fechas lunes-viernes misma hora Jersey; revisión adicional para presentación. Auto no aprueba matches, criterios dictados o cierres. Respetar las dependencias externas del spec.
- UI de esta tanda: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion.
- Inglés, label/aria-describedby, status/alert, loading/vacío/error/parcial/conflicto. Staff/same-origin/no-store; portal grants por fila/medio. JSON131072bytes/lista50/poll30s visible; safeHref y texto escapado; no PII en logs/Telegram/localStorage ni HTML recibido activo.
- Ponytail reutiliza correo/reloj; impeccable product y antislop mantienen controles concretos; seguridad valida origen/versión/datos; rendimiento acota páginas. Taste/redesign no aplican a formularios de datos; sin assets/dependencias nuevas. Si no hay UI, reglas visuales/MCP no aplican a esa parte.

## Review Focus

1. Fecha de vencimiento: casos enumerados en tarea1.
2. Tarea única y carreras: casos enumerados en tarea2.
3. Teléfonos y ejecución humana: casos enumerados en tarea3.
4. Sesión/origen inválidos o versión antigua: pruebas de rutas,401/403/409 y cero escritura.
5. Error/respuesta tardía: pruebas de conflicto/recarga sin restaurar el estado anterior. Si módulo es documental, validar su referencia/versionado, sin prueba web artificial.

## Tarea 1 · Fecha de vencimiento

**Files:** server/consultation-calls.js; prueba `tests/server/consultation-call-dates.test.mjs`.

**Interfaces:** callDueAt(sent_at,'Europe/Jersey') -> ISO timestamp.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] thursday_to_monday, friday_to_tuesday, saturday_to_tuesday, weekday_holiday_counts, dst_same_local_hour. Dos fechas M-F a misma hora local, no48h. Hora inexistente primer instante válido posterior, repetida primera ocurrencia; sin sent_at acreditado no vence.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/consultation-call-dates.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 2 · Tarea única y carreras

**Files:** server/consultation-calls.js; server/jobs.js; adaptador NOT-11; prueba `tests/server/consultation-call-tasks.test.mjs`.

**Interfaces:** consultationCallTick(env,ts); recordCallOutcome(env,taskId,input,actor,expectedVersion).

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] two_ticks_one_call, useful_response_before_due_none, response_races_call_claim, late_ack_does_not_create_call, unanswered_not_unavailable. Clave consulta/ciclo y versiones transaccionales; respuesta útil actualiza/resuelve lo confirmado. No segundo correo automático ni borrar historial.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/consultation-call-tasks.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 3 · Teléfonos y ejecución humana

**Files:** admin/src/ConsultationCall.jsx; server/routes/consultations.js; prueba `tests/consultation-call-ui.test.js`.

**Interfaces:** GET /api/admin/consultations/:id/call; POST /api/admin/consultations/calls/:id/outcome.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] all_phones_labelled, stale_contact_revalidated, obsolete_task_cannot_complete. Mostrar propiedad, envío, historial y clientes solo staff; resultados van a AGE-06. Contadores/Telegram sin personas; checks/MCP1280/390 y reloj sintético sin llamadas reales.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/consultation-call-ui.test.js` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Cierre futuro

- [ ] Contrastar aceptación de AGE-08 en task JSON con evidencias reales; ledger propio y actualización tarea/checklist/ESTADO solo al construir, no durante esta planificación. Distinguir código, integración, aceptación de proveedor y activación real.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e con datos sintéticos y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. No dos e2e generales simultáneos en el host.
- [ ] Revisión independiente futura y corrección de hallazgos; publicación/migración bajo autorización constructora. Fake no acredita envío/modelo/canal real ni una ficha acredita activación.
