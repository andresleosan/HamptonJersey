# AUT-19 · Dictado de criterios: propuesta antes/después y confirmación del empleado Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Preparar cambios aceptados por cliente y confirmarlos con CAS/eventos/recálculo, dejando audio para el carril futuro.

**Architecture:** Un escritor confirmado de propuestas/manualtexto comparte revisión BUS-12; dictado no se finge construido con textarea.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-review-criteria-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** REG-11/BUS-12/EST-18/NOT-11; BUS-01/04consumen cambio; audio posterior requiere carril local/módulo dueño.

**Readiness:** conditional. Condición de cierre: texto definido; captura/transcripción de voz y casoC3 en etapa posterior. «defined» significa diseño concreto, no reserva o dependencia ya integrada. Ninguna decisión humana nueva pendiente de esta ronda.

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

1. proposal_no_criteria_change; unrelated_patch_denied; before_from_server_not_client; stale_source_marked; pet_fact_not_flexible_priority; other_case_denied.
2. two_confirm_one_revision; same_proposal_replay_no_duplicate; different_payload_409; batch_failure_no_criteria_or_event; old_enquiry_invalidated_before_send; budget_change_preserves_all_other_must.
3. text_confirm_explicit; no_browser_remote_speech; unsupported_audio_not_silently_sent; c3_transcript_not_hermes; done_not_search_closed.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Propuesta antes/después y campos acotados

**Files:** Create: server/criteria-proposals.js y migración de proposals; Test: tests/server/criteria-proposals.test.mjs.

**Interfaces:** createCriteriaProposal(env,{applicant_id,criteria_revision,source_kind,changes,evidence_ref},actor); discardCriteriaProposal(env,{proposal_id,version},actor).

- [ ] Preparar casos y aserciones: proposal_no_criteria_change; unrelated_patch_denied; before_from_server_not_client; stale_source_marked; pet_fact_not_flexible_priority; other_case_denied.
- [ ] Escribir pruebas en `tests/server/criteria-proposals.test.mjs`; ejecutar `node --test tests/server/criteria-proposals.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Guardar proposal privado/allowlist, estado/versiones/origen y evidencia sin duplicar texto personal en audit general; no aplicar automáticamente del modelo.
- [ ] Ejecutar `node --test tests/server/criteria-proposals.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Confirmación transaccional y recálculo

**Files:** Modify: server/criteria-proposals.js, rutasApplicants/escritores de criterios; Test: tests/server/criteria-proposal-confirm.test.mjs.

**Interfaces:** confirmCriteriaProposal(env,{proposal_id,version,criteria_revision,confirmed_changes,confirmation_ref},actor).

- [ ] Preparar casos y aserciones: two_confirm_one_revision; same_proposal_replay_no_duplicate; different_payload_409; batch_failure_no_criteria_or_event; old_enquiry_invalidated_before_send; budget_change_preserves_all_other_must.
- [ ] Escribir pruebas en `tests/server/criteria-proposal-confirm.test.mjs`; ejecutar `node --test tests/server/criteria-proposal-confirm.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] CASporcriterios y propuesta, mutación/evento/cola/gestiones atómicos por statementsdueños; no guardado sin acción humana ni idempotenciaHTTPglobal nueva.
- [ ] Ejecutar `node --test tests/server/criteria-proposal-confirm.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Entrada textual actual y voz posterior

**Files:** Modify: ApplicantDetail/rutas privadas; Create: tests/criteria-proposals-ui.test.js y docs/roadmap/work/AUT-19/audio-dependency.md.

**Interfaces:** Stafftextactual; transcription_refsolo cuando exista proveedorlocalautorizado con origen/versión/clasificación.

- [ ] Preparar casos y aserciones: text_confirm_explicit; no_browser_remote_speech; unsupported_audio_not_silently_sent; c3_transcript_not_hermes; done_not_search_closed.
- [ ] Escribir pruebas en `tests/criteria-proposals-ui.test.js`; ejecutar `node --test tests/criteria-proposals-ui.test.js` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Entregar UItextual/revisión ahora y dependencia de audio explícita. Definir contrato futuro con módulo de transcripción sin montar servidores o confundir una demo textual con dictadooperativo.
- [ ] Ejecutar `node --test tests/criteria-proposals-ui.test.js` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
