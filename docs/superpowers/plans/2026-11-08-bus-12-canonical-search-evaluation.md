# BUS-12 · Matching con imprescindibles, exclusiones, rangos y datos desconocidos Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Evaluar inventario propio/externo con criterios residenciales y comerciales, mascotas obligatorias y parking flexible por defecto.

**Architecture:** Adapter canónico reutiliza evaluate/requirements y añade snapshots/revisiones; clasificación separada de ranking/aprobación/disponibilidad.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-evaluation-batch-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** REG-08/REG-11 integrados; EST-09; contrato BUS-10 y almacenamiento BUS-06; BUS-13 para regla normativa validada.

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

1. criteria_change_increments_once; same_save_no_revision; ready_or_stage_no_criteria_revision; two_writers_stale_rejected; old_priorities_unknown_not_flexible; new_parking_preferred_explicit_must_preserved.
2. pet_owner_explicit_no_excluded; pets_unknown_pending; no_pets_not_applicable; parking_preferred_fails_still_meets_other_must; historical_parking_must_not_relaxed; bedrooms_max_inclusive; unknown_not_false_zero; parish_veto_excluded.
3. annual_24000_monthly_2000_preserves_original; no_sum_premium_and_rent; mixed_currency_pending; sqft_to_sqm_0_09290304; transfer_not_property_sale; same_person_buy_rent_separate; no_residential_beds_for_business.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Snapshot de criterios y revisión real

**Files:** Create: server/search-criteria.js y migración aditiva criteria_revision; Modify: server/applicants.js/escritores de criterios identificados; Test: tests/server/search-criteria.test.mjs.

**Interfaces:** loadCriteriaSnapshot(env,applicantId)->{criteria_revision,search_state,search_category,operation,criteria}.

- [ ] Preparar casos y aserciones: criteria_change_increments_once; same_save_no_revision; ready_or_stage_no_criteria_revision; two_writers_stale_rejected; old_priorities_unknown_not_flexible; new_parking_preferred_explicit_must_preserved.
- [ ] Escribir pruebas en `tests/server/search-criteria.test.mjs`; ejecutar `node --test tests/server/search-criteria.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Inventariar campos del snapshot y escritores existentes; trigger de revisión solo cambios efectivos. CAS de guardado protege cambios; no inventar datos previos ni reabrir needs_review/resolved.
- [ ] Ejecutar `node --test tests/server/search-criteria.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Clasificación residencial y reglas de mascotas

**Files:** Create: server/search-evaluation.js, server/search-eligibility.js; Modify: server/requirements.js, site/requirements.js, server/matching.js; Test: tests/server/search-evaluation.test.mjs.

**Interfaces:** evaluateSearchCandidate(searchSnapshot,candidateSnapshot,context)->Evaluation meets/pending/alternative/excluded con checks/versiones.

- [ ] Preparar casos y aserciones: pet_owner_explicit_no_excluded; pets_unknown_pending; no_pets_not_applicable; parking_preferred_fails_still_meets_other_must; historical_parking_must_not_relaxed; bedrooms_max_inclusive; unknown_not_false_zero; parish_veto_excluded.
- [ ] Escribir pruebas en `tests/server/search-evaluation.test.mjs`; ejecutar `node --test tests/server/search-evaluation.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Extraer adapter al único motor y retirar límites opacos previos como criterios duros no declarados. Mascotas incompatibles jamás near/top20; species/condición no probada sigue unknown. Prioridad no cambia hechos del hogar.
- [ ] Ejecutar `node --test tests/server/search-evaluation.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Términos comerciales y origen financiero

**Files:** Modify: server/search-evaluation.js, server/market-inventory.js cuando esté integrado; Create: tests/server/commercial-evaluation.test.mjs.

**Interfaces:** Checks por commercial_kind/use/area y cada término purchase/rent/premium/expenses, originales/minorunits/currency/period.

- [ ] Preparar casos y aserciones: annual_24000_monthly_2000_preserves_original; no_sum_premium_and_rent; mixed_currency_pending; sqft_to_sqm_0_09290304; transfer_not_property_sale; same_person_buy_rent_separate; no_residential_beds_for_business.
- [ ] Escribir pruebas en `tests/server/commercial-evaluation.test.mjs`; ejecutar `node --test tests/server/commercial-evaluation.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Normalizar términos con servicio BUS-06, no otra fuente de verdad. Uso no acreditado pending, límites por término sin FX inferido; no remitir datos financieros privados a modelo para evaluar determinísticamente.
- [ ] Ejecutar `node --test tests/server/commercial-evaluation.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 4 · Integrar recálculo y tarjetas con versiones

**Files:** Modify: server/match-store.js, server/routes/matches.js, admin/src/MatchCard.jsx, Review.jsx; Test: tests/server/search-evaluation-integration.test.mjs.

**Interfaces:** Compatibilidad evaluate/requirements_status/rank y episodios BUS-01; feedback de exclusión/motivo y stale.

- [ ] Preparar casos y aserciones: no_valid_candidate_lost_by_score; recalculation_preserves_review; material_change_invalidates_old_authorization; pet_policy_no_excludes_only_this_search; queued_old_snapshot_cannot_send.
- [ ] Escribir pruebas en `tests/server/search-evaluation-integration.test.mjs`; ejecutar `node --test tests/server/search-evaluation-integration.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Conectar fuentes reales integradas, mantener legacy/market discriminados y snapshot por candidato. No cerrar cobertura externa o permiso por pasar fixtures; registrar pendientes y regresiones originales.
- [ ] Ejecutar `node --test tests/server/search-evaluation-integration.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.

**Predicado compartido:** BUS-12 posee isFullAvailableCandidate(state) en server/search-eligibility.js, consumido por SAP-02 y BUS-17. Añadir a tests/server/search-evaluation-integration.test.mjs los casos staff_rejected_not_full, client_declined_not_full, stale_episode_not_full y no_approval_required_if_not_rejected_and_other_conditions_met. AUT-18/Ready no se usa como sustituto de elegibilidad.
