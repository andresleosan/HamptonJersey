# SAP-10 · Cambios de criterios confirmados por el equipo; pausa pendiente de definición Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Mostrar propuestas de cambio y guardar solo después de confirmación humana del cliente.

**Architecture:** Use this rellena sin persistir; AUT-19 posee confirmación/versiones y búsqueda conserva actividad.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-review-criteria-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** BUS-17, AUT-19 y EST-09.

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

1. use_this_no_save; navigate_cancel_clears_proposal; no_pets_relaxation_option; parking_existing_must_not_flipped; unrelated_fields_unchanged.
2. stale_revision_conflict_keeps_input; model_output_not_confirmation; changed_budget_only_not_parking; same_confirm_no_second_run; hidden_source_cannot_confirm.
3. new_criteria_shows_matching_pending; stale_shortlist_not_sent; review_task_updated_once; proposal_cannot_change_other_operation.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Propuesta en memoria sin mutación

**Files:** Modify: admin/src/ApplicantDetail.jsx y ApplicantFields; Test: tests/criteria-proposal-ui.test.js.

**Interfaces:** Before/after por campo allowlist y source proposal/version, sin localStorage.

- [ ] Preparar casos y aserciones: use_this_no_save; navigate_cancel_clears_proposal; no_pets_relaxation_option; parking_existing_must_not_flipped; unrelated_fields_unchanged.
- [ ] Escribir pruebas en `tests/criteria-proposal-ui.test.js`; ejecutar `node --test tests/criteria-proposal-ui.test.js` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Reutilizar guard de cambios y formularios actuales, sin nuevo estadoPaused o mensaje de flexibilización automático.
- [ ] Ejecutar `node --test tests/criteria-proposal-ui.test.js` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Confirmación y conflicto

**Files:** Modify: integración de confirmCriteriaProposal en detalle; Test: tests/server/criteria-confirmation-ui-contract.test.mjs.

**Interfaces:** Confirm envía proposal/version/criteria_revision/confirmation_ref y cambios aceptados explícitos.

- [ ] Preparar casos y aserciones: stale_revision_conflict_keeps_input; model_output_not_confirmation; changed_budget_only_not_parking; same_confirm_no_second_run; hidden_source_cannot_confirm.
- [ ] Escribir pruebas en `tests/server/criteria-confirmation-ui-contract.test.mjs`; ejecutar `node --test tests/server/criteria-confirmation-ui-contract.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Mostrar origen de propuesta y confirmación sin asumir que pulsar interés o abrir alternativa autoriza editar. Revalidar en servidor y actualizar vistas con resultado real.
- [ ] Ejecutar `node --test tests/server/criteria-confirmation-ui-contract.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Recálculo y revisión coherentes

**Files:** Modify: detalles de progreso/ciclo; Create: tests/criteria-confirmation.e2e.cjs.

**Interfaces:** Guardar por AUT-19encola comparación y revisa autorizaciones pendientes; no abre búsqueda resuelta.

- [ ] Preparar casos y aserciones: new_criteria_shows_matching_pending; stale_shortlist_not_sent; review_task_updated_once; proposal_cannot_change_other_operation.
- [ ] Escribir pruebas en `tests/server/criteria-change-regression.test.mjs`; ejecutar `node --test tests/server/criteria-change-regression.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Probar recorrido completo de propuesta/cancelar/confirmar/conflicto y criterios intactos salvo aceptados. Voz no queda habilitada por UItextual.
- [ ] Ejecutar `node --test tests/server/criteria-change-regression.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
