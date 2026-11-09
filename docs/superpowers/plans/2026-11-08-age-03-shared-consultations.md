# AGE-03 · Consulta general por propiedad/operación para matches aprobados Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Consulta compartida de inmueble/operación y aprobación vigente.

**Para ejecutar/completar:** Modelo de consulta integrado; al activar automático exigir EST-15. Ningún dato de hogar se envía por consulta general. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03. Dependencias: BUS-15 decisión humana; BUS-10 identidad; AGE-04 contactos; EST-09 búsqueda activa; AUT-11 guardia; NOT-11 contrato de gestión si se consume.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Consulta general por propiedad/operación para matches aprobados.

**Architecture:** Consumir servicios existentes y contratos propietarios del spec, con cambios aditivos, versiones y pruebas por tarea. No duplicar reloj/correo/inventario o autoridad.

**Tech Stack:** JavaScript, D1/R2, React o página privada según superficie; node:test/e2e de Hampton. Sin infraestructura nueva.

**Spec:** [Diseño compartido](../specs/2026-11-08-list2-agency-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** BUS-15/BUS-10/AGE-04/EST-09/AUT-11; EST-15 antes de activar envío automático.

## Global Constraints

- Solo planificación; construcción futura en copia verificada y alcance propio. Migración aditiva: calcular siguiente ordinal libre y registrar ruta exacta antes de editar, sin renumerar las aplicadas. Adaptar tablas/servicios existentes en vez de duplicarlos.
- Disponibilidad general hasta información nueva, con fecha; llamada dos fechas lunes-viernes misma hora Jersey; revisión adicional para presentación. Auto no aprueba matches, criterios dictados o cierres. Respetar las dependencias externas del spec.
- UI de esta tanda: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion.
- Inglés, label/aria-describedby, status/alert, loading/vacío/error/parcial/conflicto. Staff/same-origin/no-store; portal grants por fila/medio. JSON131072bytes/lista50/poll30s visible; safeHref y texto escapado; no PII en logs/Telegram/localStorage ni HTML recibido activo.
- Ponytail reutiliza correo/reloj; impeccable product y antislop mantienen controles concretos; seguridad valida origen/versión/datos; rendimiento acota páginas. Taste/redesign no aplican a formularios de datos; sin assets/dependencias nuevas. Si no hay UI, reglas visuales/MCP no aplican a esa parte.

## Review Focus

1. Entidad compartida: casos enumerados en tarea1.
2. Snapshot aprobado: casos enumerados en tarea2.
3. Revisión en panel: casos enumerados en tarea3.
4. Sesión/origen inválidos o versión antigua: pruebas de rutas,401/403/409 y cero escritura.
5. Error/respuesta tardía: pruebas de conflicto/recarga sin restaurar el estado anterior. Si módulo es documental, validar su referencia/versionado, sin prueba web artificial.

## Tarea 1 · Entidad compartida

**Files:** server/consultations.js; migración consultations/consultation_matches/attempts/responses/call_tasks; prueba `tests/server/consultations.test.mjs`.

**Interfaces:** prepareConsultation(env,{property_id,operation,approved_match_ids,selected_case_id,channel},actor); getConsultationContext(env,id).

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] five_matches_one_general_query, unapproved_cannot_contact, operations_not_mixed, households_not_summed. Clave propiedad/operación/scope/context_hash con acción abierta única y relaciones de targets legacy/market. No crear consultas por cada anuncio o por cada familia.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/consultations.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 2 · Snapshot aprobado

**Files:** server/consultations.js; prueba `tests/server/consultation-approval.test.mjs`.

**Interfaces:** approveConsultation(env,id,{revision,snapshot_hash},actor) -> Consultation.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] recipient_change_invalidates, commercial_no_residents, selected_case_closed_invalidates, one_of_five_closed_keeps_general. Mensaje identifica inmueble/interés y pide disponibilidad/horarios; ocupantes opcionales de un solo caso, sin nombres/contacto/presupuesto/documentos/comisiones. Al salir queda al menos un aprobado vigente; condiciones de hogar no son generales.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/consultation-approval.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 3 · Revisión en panel

**Files:** server/routes/consultations.js; server/api.js; admin/src/ConsultationDetail.jsx; prueba `tests/server/consultation-routes.test.mjs`.

**Interfaces:** GET/POST /api/admin/consultations; POST /:id/approve; páginas50.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] staff_origin_required, stale_approval_409, manual_pending_no_sent_at. Mostrar contenido/destinatario/contexto para aprobación explícita; conectar desde match aprobado sin aprobar otros. Tests/consultation-ui.test.js y MCP de cinco matches, uno cerrado, caso seleccionado inválido y conflicto.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/consultation-routes.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Cierre futuro

- [ ] Contrastar aceptación de AGE-03 en task JSON con evidencias reales; ledger propio y actualización tarea/checklist/ESTADO solo al construir, no durante esta planificación. Distinguir código, integración, aceptación de proveedor y activación real.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e con datos sintéticos y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. No dos e2e generales simultáneos en el host.
- [ ] Revisión independiente futura y corrección de hallazgos; publicación/migración bajo autorización constructora. Fake no acredita envío/modelo/canal real ni una ficha acredita activación.


**Decisión posterior B04/B05:** leer [evaluación y autorización de aclaración](../specs/2026-11-08-search-evaluation-batch-design.md). Se permite consulta general con autorización humana purpose clarification para datos imprescindibles desconocidos; evaluación sigue pending y no se presenta al cliente. La autorización es un registro propio, no shortlist automático. Mascotas incompatibles excluyen; parking flexible salvo MUST explícito conservado. AGE-03/AUT-11 aceptan referencia humana vigente y alcance de búsqueda; AGE-11 sigue exigiendo criterios/condiciones/disponibilidad/fotos y revisión extra, sin usar aclaración como aprobación de presentación.
