# BUS-17 · Revisión interna a los 21 días con hasta 20 alternativas explicables Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Crear revisión interna tras21días sin opción completa/disponible y repetir7días tras cierre sin duplicar abierta.

**Architecture:** Estado de ausencia/ciclo durable sobre hechos canónicos; máximo20alternativas internas, sin envíos ni cambios de criterios.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-review-criteria-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** EST-09/BUS-12/BUS-08/NOT-11 y hechosEST-16/13.

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

1. initial21_calendar_days; full_available_holds_clock; last_full_disappears_starts_absence_now; criteria_edit_no_silent_reset; legacy_unknown_baseline_not_fake_history; pets_incompatible_never_qualifies; staff_rejected_and_client_declined_do_not_hold_clock; stale_episode_does_not_count.
2. two_ticks_one_open_review; close_twice_one_next_due; next7_days_after_close; full_match_resolves_obsolete_review; review_done_not_search_resolved; internal_review_not_real_client_contact.
3. pets_no_not_in_top20; unknown_pets_verification_not_flex; fewer_than20_honest; failures_before_preferences; incomparable_units_not_summed; no_auto_email_or_save.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Predicado de opción completa y reloj

**Files:** Create: server/search-review-cycle.js y migración de ciclos; Test: tests/server/search-review-cycle.test.mjs.

**Interfaces:** isFullAvailableCandidate(state) importado de server/search-eligibility.js; reviewSearchTick(env,now,{limit:50})->{opened,updated,closed,pending}.

**Precondición de integración:** `false` del predicado por sí solo no acredita ausencia: también representa datos incompletos o inválidos. El adaptador debe producir DTO fiables desde un snapshot coherente, comprobar cobertura completa del conjunto y vigencia de cada evidencia y construir un agregado triestado (existe / ausencia acreditada / desconocido). Un error, cobertura parcial, revisión obsoleta o revocación no resuelta mantiene desconocido; no iniciar ni avanzar el reloj por inferencia. Revalidar identidad, revisiones y evidencia en la transacción antes de cualquier efecto. Los proxies sofisticados pueden aparentar registros ordinarios: las guardas del predicado no sustituyen una frontera DTO fiable.

- [ ] Probar conjunto incompleto sin candidatos aptos, error de carga y revocación o evidencia obsoleta: agregado desconocido, sin acreditar ausencia ni abrir revisión. Probar recuperación con cobertura completa, evidencia vigente y revalidación transaccional; comprobar que un candidato apto acreditado suspende el reloj.

- [ ] Preparar casos y aserciones: initial21_calendar_days; full_available_holds_clock; last_full_disappears_starts_absence_now; criteria_edit_no_silent_reset; legacy_unknown_baseline_not_fake_history; pets_incompatible_never_qualifies; staff_rejected_and_client_declined_do_not_hold_clock; stale_episode_does_not_count.
- [ ] Escribir pruebas en `tests/server/search-review-cycle.test.mjs`; ejecutar `node --test tests/server/search-review-cycle.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Definir no_full_since y baseline evidenciado, comparar revisiones de hechos/criterios y usar díasJersey/misma hora. Reloj10min existente, no nueva programación.
- [ ] Ejecutar `node --test tests/server/search-review-cycle.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Una revisión y repetición a7días

**Files:** Modify: server/search-review-cycle.js y NOT-11 consumidor; Test: tests/server/search-review-tasks.test.mjs.

**Interfaces:** completeSearchReview(env,{review_id,version,outcome,evidence_ref},actor); task_key estable por búsqueda/ciclo.

- [ ] Preparar casos y aserciones: two_ticks_one_open_review; close_twice_one_next_due; next7_days_after_close; full_match_resolves_obsolete_review; review_done_not_search_resolved; internal_review_not_real_client_contact.
- [ ] Escribir pruebas en `tests/server/search-review-tasks.test.mjs`; ejecutar `node --test tests/server/search-review-tasks.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Componer ciclo/tarea/evento en mismo batch; abierta se actualiza, no se recrea a diario. Mantener last_contact/retención salvo acción de contacto real por su módulo.
- [ ] Ejecutar `node --test tests/server/search-review-tasks.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Hasta20alternativas y UI interna

**Files:** Create: server/search-alternatives.js; Modify: server/widen.js, admin/src/ApplicantDetail.jsx; Test: tests/server/search-alternatives.test.mjs.

**Interfaces:** buildInternalAlternatives(env,{applicant_id,criteria_revision,inventory_revision,limit:20})->{items,verification_pending,coverage_pending}.

- [ ] Preparar casos y aserciones: pets_no_not_in_top20; unknown_pets_verification_not_flex; fewer_than20_honest; failures_before_preferences; incomparable_units_not_summed; no_auto_email_or_save.
- [ ] Escribir pruebas en `tests/server/search-alternatives.test.mjs`; ejecutar `node --test tests/server/search-alternatives.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Explicar diferencias/origen/fechas y separar información faltante. Orden por MUSTfallidos y dominancia en mismos criterios; desempate preferencias/claveestable. UIpermite decisión humana sin aplicar Use this automáticamente.
- [ ] Ejecutar `node --test tests/server/search-alternatives.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
