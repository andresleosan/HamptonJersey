# BUS-15 · Cola de revisión rápida (Review) con teclas y aprobación en lote Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Registrar aprobación/rechazo y autorización de aclaración como decisiones humanas versionadas.

**Architecture:** Extender cola existente sobre evaluación canónica; autorización de consulta por propósito no es disponibilidad o presentación.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-evaluation-batch-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** BUS-12/EST-09, episodios BUS-01; AGE-03/AUT-11 para consumo de autorización.

**Readiness:** defined. Condición de cierre: integrar y verificar las dependencias indicadas y cumplir los criterios del plan. «defined» significa diseño concreto, no reserva o dependencia ya integrada. Ninguna decisión humana nueva pendiente de esta ronda.

## Global Constraints

- Solo planificación en esta entrega; otra sesión ejecuta con main/scope/evidencia y dependencias reales. No reservas plan, publicación, migraciones remotas, capturas o modelos por recibir el documento. Propuestas de nombres se reconcilian con implementación integrada.
- Mascotas no negociables si el hogar las tiene: no confirmado=pending, incompatibilidad conocida=excluded, sin alternativa que elimine mascota. Parkingpreferred por defecto nuevo; MUST histórico no se rebaja sin cambio humano confirmado. Aclaración desconocida requiere autorización expresa y no presentación.
- Reloj ausencia21díasJersey, suspendido con opcióncompleta+disponibilidadconfirmada; siguiente revisión7díastras cierre si sigue sin opción, una abierta/búsqueda. Sin envío/top20/criterios automáticos. Purga6meses naturales solo fotos/derivados; conservar documentos/historial/personas y refs activas.
- CentralPro/Hermes y tratamiento personal sujetos a vía/purpose/acuerdos verificados; ningún plan/OAuth por empleado. C3/audio/local para etapa posterior; no WebSpeechremoto. Fuera Meta, WhatsApp y Places/Properties ahora. Timelineglobal/pausavoluntaria siguen fuera. C13 humanaweb mantiene excepción de pausa.
- No segundo motor/Inbox/reloj/inventario. Integrar REG-08/REG-11/EST-18 existentes y NOT-11 conservado. Migraciones aditivas con siguiente ordinal libre al construir y ruta registrada antes de editar; no reescribir aplicadas ni reservar0032porinferencia.
- DESIGN.md Typography/Layout/Components y CSSvigente: ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d foco-decoración/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82; Tenor26/19px400, Montserrat14px/1.5, label12, card24/r14,inputr10,botón10px20px/r999,página1240/gutter16/24arriba/120abajo,celdas10px12px,reflujo760. Acciónnueva44px propuesta; foco2/offset2, contraste4.5texto/3control, zoom200/reduced-motion.
- Inglés,labels/status/alert y estados loading/empty/error/pending/conflict; staff/same-origin/no-store,SQLparametrizado,React/textoescapado/safeHref. Sin PII/tokens/prompts en URL/storage/logs/Telegram. JSON128KiB/lista50/poll30svisible salvo contrato específico: NOT-11listado200heredado, lotes50; captura5archivos/tick20MiB/archivo,ZIP25fotos/50MiB.
- Avanzar/writing-plans fijan alcance/interfaces; ponytail reutiliza; seguridad servidor/frontend valida; impeccable/antislop preservan flujo/copy; web-performance limita consultas/stream. Taste/redesign no requieren estética nueva. Sin fuentes tipográficas/dependencias/assets de diseño nuevos; medios de captura pertenecen a SPR-03.

## Review Focus

1. two_employees_one_winner; stale_criteria_409; excluded_pets_cannot_approve; pending_clarification_keeps_pending; no_reason_rejection_fails.
2. unknown_pet_approved_enquiry_allowed; known_pet_no_denied; query_has_no_client_data; repeated_authorization_one_consultation; clarification_not_private_presentation.
3. shortcut_in_input_ignored; mixed_batch_conflict_not_all_success; pending_stays_pending_after_enquiry; undo_after_other_edit_denied; no_auto_send_from_ui.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Comandos y guardias de revisión

**Files:** Modify: server/routes/matches.js; Create: server/candidate-review.js; Test: tests/server/candidate-review.test.mjs.

**Interfaces:** reviewCandidate(env,target,{version,criteria_revision,candidate_revision,decision,reason,purpose},actor).

- [ ] Preparar casos y aserciones: two_employees_one_winner; stale_criteria_409; excluded_pets_cannot_approve; pending_clarification_keeps_pending; no_reason_rejection_fails.
- [ ] Escribir pruebas en `tests/server/candidate-review.test.mjs`; ejecutar `node --test tests/server/candidate-review.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Añadir purpose initial_enquiry/clarification y snapshot guardado en misma transacción que decisión/evento. Target discriminado legacy/market, actor servidor; ningún umbral o modelo aprueba.
- [ ] Ejecutar `node --test tests/server/candidate-review.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Aclaración compartida sin presentar al cliente

**Files:** Modify: consumidores AGE-03/AUT-11 y prepareconsulta; Test: tests/server/clarification-enquiry.test.mjs.

**Interfaces:** Autorización purpose clarification consume mismo inmueble/op/snapshot vigente; no requiere falsificar clasificaciónmeets.

- [ ] Preparar casos y aserciones: unknown_pet_approved_enquiry_allowed; known_pet_no_denied; query_has_no_client_data; repeated_authorization_one_consultation; clarification_not_private_presentation.
- [ ] Escribir pruebas en `tests/server/clarification-enquiry.test.mjs`; ejecutar `node --test tests/server/clarification-enquiry.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Extender contrato de consultas compatible con búsqueda activa y autorización humana de aclaración; mantener datos de hogar fuera de consulta general y revalidar antes de salida.
- [ ] Ejecutar `node --test tests/server/clarification-enquiry.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Review por teclado/lote y estados claros

**Files:** Modify: admin/src/Review.jsx, MatchCard.jsx; Test: tests/candidate-review-ui.test.js.

**Interfaces:** Approve enquiry frente a match apto, Reject/Skip y lote con resultados por fila; Undo versionado.

- [ ] Preparar casos y aserciones: shortcut_in_input_ignored; mixed_batch_conflict_not_all_success; pending_stays_pending_after_enquiry; undo_after_other_edit_denied; no_auto_send_from_ui.
- [ ] Escribir pruebas en `tests/candidate-review-ui.test.js`; ejecutar `node --test tests/candidate-review-ui.test.js` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Usar botones/accesos A/R/S dentro de región y foco restaurado, mostrar evidencia/fechas/dudas. Lote requiere selección/acción explícita, sin aprobar por score ni ampliar destinatarios.
- [ ] Ejecutar `node --test tests/candidate-review-ui.test.js` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.

**Aclaración:** registrar enquiry_authorizations por candidato/purpose/actor/versiones en migración aditiva; no mover un match pendiente a Shortlisted por aprobar aclaración. La API devuelve authorization_id y estado real; AGE-03/AUT-11 consumen esa referencia, AGE-11 la rechaza como permiso de presentación. Solo datos factuales del anunciante, no aprobación de regla normativa.
