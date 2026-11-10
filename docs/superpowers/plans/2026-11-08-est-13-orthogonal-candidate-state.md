# EST-13 · Estados independientes de evaluación, aprobación, disponibilidad y consulta Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Proyectar evaluación, decisión, disponibilidad, consulta e interés como estados independientes.

**Architecture:** Servicio de lectura compuesto, no otro status único que sobrescriba hechos.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-state-capture-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** BUS-12/15/10/EST-09; hechos EST-16 y dominios de consulta/visita.

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

1. approved_not_available; available_not_interested; viewing_not_resolved; one_case_closed_other_unchanged; clarification_pending_not_complete.
2. stale_fact_before_send_denies; known_unavailable_blocks_proposal; pending_case_not_presented; shared_consultation_survives_other_close; payload_cannot_force_available.
3. multiple_labels_visible; source_conflict_pending; field_errors_text; keyboard_details; actor_not_exposed_public.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Estado por candidato y búsqueda

**Files:** Create: server/candidate-state.js; Test: tests/server/candidate-state.test.mjs.

**Interfaces:** getCandidateState(env,{applicant_id,candidate_key})->{evaluation,staff_decision,publication,availability,case_conditions,consultation,client_interest,viewing,revision}.

- [ ] Preparar casos y aserciones: approved_not_available; available_not_interested; viewing_not_resolved; one_case_closed_other_unchanged; clarification_pending_not_complete.
- [ ] Escribir pruebas en `tests/server/candidate-state.test.mjs`; ejecutar `node --test tests/server/candidate-state.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Resolver por identidad/scope y versiones reales sin duplicar autoridades; datos ausentes explícitos, no campos booleanos de fallback.
- [ ] Ejecutar `node --test tests/server/candidate-state.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Guardias de transición por consumidor

**Files:** Modify: servicios consulta/presentación/matches cuando existan; Test: tests/server/candidate-state-guards.test.mjs.

**Interfaces:** Snapshot de dimensiones con source versions consumido por acción, validado antes de mutar.

- [ ] Preparar casos y aserciones: stale_fact_before_send_denies; known_unavailable_blocks_proposal; pending_case_not_presented; shared_consultation_survives_other_close; payload_cannot_force_available.
- [ ] Escribir pruebas en `tests/server/candidate-state-guards.test.mjs`; ejecutar `node --test tests/server/candidate-state-guards.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Implementar guardias servidor y coordinar eventos sin usar render de UI como autoridad; fallo a mitad de batch revierte cambio y evento.
- [ ] Ejecutar `node --test tests/server/candidate-state-guards.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Presentación del estado compuesto

**Files:** Modify: admin/src/MatchCard.jsx, ApplicantDetail.jsx y detalle de inmueble existente; Test: tests/candidate-state-ui.test.js.

**Interfaces:** Etiquetas por dimensión y evidencia/fecha, no convertir aprobación en confirmación.

- [ ] Preparar casos y aserciones: multiple_labels_visible; source_conflict_pending; field_errors_text; keyboard_details; actor_not_exposed_public.
- [ ] Escribir pruebas en `tests/candidate-state-ui.test.js`; ejecutar `node --test tests/candidate-state-ui.test.js` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Reutilizar badges y copy inglesa para conocimiento/acción distintos, sin nueva Timelineglobal.
- [ ] Ejecutar `node --test tests/candidate-state-ui.test.js` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
