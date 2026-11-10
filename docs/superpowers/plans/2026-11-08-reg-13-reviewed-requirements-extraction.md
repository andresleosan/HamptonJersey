# REG-13 · Requisitos libres convertidos en etiquetas con IA y confirmados por el equipo Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Convertir texto libre autorizado en una propuesta de criterios que el equipo revise y confirme.

**Architecture:** Purposecriteria_extraction del centralHermes, validación estricta y escritor AUT-19 común; sin tagging automático de MUST.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-review-criteria-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** EST-09; contratoBUS-12/NOT-11 y AUT-05/13verificados; AUT-19para confirmar.

**Readiness:** conditional. Condición de cierre: adapter criteria_extraction y carril personal autorizado por propósito; edición manual no espera IA. «defined» significa diseño concreto, no reserva o dependencia ya integrada. Ninguna decisión humana nueva pendiente de esta ronda.

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

1. invented_quote_rejected; unknown_key_denied; pets_removal_not_suggestion; ambiguous_priority_unknown; budget_patch_not_other_fields; prompt_injection_not_action.
2. unverified_personal_lane_no_call; c3_blocks_hermes; quota_zero_manual_pending; timeout_unknown_no_retry; deleted_source_no_result; strict_output32KiB.
3. extraction_only_draft; human_corrects_before_after; stale_text_cannot_apply; review_receipt_no_duplicate; source_text_not_copied_to_jobs90d.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Esquema y validador de extracción

**Files:** Create: server/criteria-extraction.js; Test: tests/server/criteria-extraction.test.mjs.

**Interfaces:** CriteriaExtraction={fields:[{key,proposed_value,proposed_priority,quote_start,quote_end}],unknowns}; tipos/citas sobre texto autorizado.

- [ ] Preparar casos y aserciones: invented_quote_rejected; unknown_key_denied; pets_removal_not_suggestion; ambiguous_priority_unknown; budget_patch_not_other_fields; prompt_injection_not_action.
- [ ] Escribir pruebas en `tests/server/criteria-extraction.test.mjs`; ejecutar `node --test tests/server/criteria-extraction.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Validar campo/valor/cita con límites del mismo esquema de criterios, sin ejecutar instrucciones del texto o usar cita como prueba de corrección.
- [ ] Ejecutar `node --test tests/server/criteria-extraction.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Adapter central autorizado y fallos

**Files:** Modify: server/criteria-extraction.js y registro AUT-13cuando esté integrado; Test: tests/server/criteria-extraction-central.test.mjs.

**Interfaces:** extractCriteriaProposal(env,{applicant_id,criteria_revision,text_ref},modelClient); purpose criteria_extraction, no listing_text.

- [ ] Preparar casos y aserciones: unverified_personal_lane_no_call; c3_blocks_hermes; quota_zero_manual_pending; timeout_unknown_no_retry; deleted_source_no_result; strict_output32KiB.
- [ ] Escribir pruebas en `tests/server/criteria-extraction-central.test.mjs`; ejecutar `node --test tests/server/criteria-extraction-central.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Clientinjection/fake para contrato, una llamada<=30s en carril permitido; adaptervivo requiere vía/purpose/evidencia real. Sin proveedor nuevo ni audio/local/Telegram por inferencia.
- [ ] Ejecutar `node --test tests/server/criteria-extraction-central.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Revisión y confirmación común

**Files:** Modify: server/criteria-proposals.js y ApplicantDetail; Test: tests/server/criteria-extraction-review.test.mjs.

**Interfaces:** Crear proposal requirements_text y confirmar solo con confirmCriteriaProposal, source revision vigente.

- [ ] Preparar casos y aserciones: extraction_only_draft; human_corrects_before_after; stale_text_cannot_apply; review_receipt_no_duplicate; source_text_not_copied_to_jobs90d.
- [ ] Escribir pruebas en `tests/server/criteria-extraction-review.test.mjs`; ejecutar `node --test tests/server/criteria-extraction-review.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Conservar texto/ciclo personal en módulo dueño y metadata mínima del dispatcher; UIantes/después y permiso humano, manual disponible si IA pendiente.
- [ ] Ejecutar `node --test tests/server/criteria-extraction-review.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
