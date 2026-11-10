# EST-10 · Cola de trabajo con varias etiquetas a la vez, más Viewing booked y No matches a 7 días Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Mostrar varias etiquetas de trabajo sin mezclar actividad, visitas y revisión21días.

**Architecture:** Mismo getSearchWorkLabels de EST-04, ampliado con productores/ciclo; no etiquetaobsoleta de7días.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-review-criteria-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** EST-09, BUS-17, VIS-17 y progresoevaluación.

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

1. review_and_waiting_together; no_7day_no_matches_rule; ready_not_search_resolved; missing_essential_unknown; no_visit_confirmation_from_request.
2. visit_unlinked_pending_not_booked; review7_days_after_close; missing_provider_pending_not_zero; late_source_event_not_rollback.
3. multiple_badges_wrap_mobile; text_not_color_only; count_state_same_revision; filter_no_pii_storage.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Etiquetas composibles

**Files:** Modify: server/search-work-labels.js; Test: tests/server/search-work-labels.test.mjs.

**Interfaces:** Labels independientes de matching/review/in_process/essential_pending/viewing/review21 con revision.

- [ ] Preparar casos y aserciones: review_and_waiting_together; no_7day_no_matches_rule; ready_not_search_resolved; missing_essential_unknown; no_visit_confirmation_from_request.
- [ ] Escribir pruebas en `tests/server/search-work-labels.test.mjs`; ejecutar `node --test tests/server/search-work-labels.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Derivar por hecho/ciclo, sin precedencia que suprima alertas útiles o convierta etapaPaused en búsqueda cerrada.
- [ ] Ejecutar `node --test tests/server/search-work-labels.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Plazos y visitas reales

**Files:** Modify: proyección/ciclo/contratoVIS-17; Test: tests/server/search-label-sources.test.mjs.

**Interfaces:** Fuente por label con ID/versión, visita pendiente/confirmada según vínculo real.

- [ ] Preparar casos y aserciones: visit_unlinked_pending_not_booked; review7_days_after_close; missing_provider_pending_not_zero; late_source_event_not_rollback.
- [ ] Escribir pruebas en `tests/server/search-label-sources.test.mjs`; ejecutar `node --test tests/server/search-label-sources.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Conectar productoresintegrados, mantener dependencia deVIS-17 explícita para confirmaciónexterna y no reconstruir agenda confixture.
- [ ] Ejecutar `node --test tests/server/search-label-sources.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Lista/filtros consistentes

**Files:** Modify: Applicants/ApplicantDetail; Test: tests/search-work-labels-ui.test.js.

**Interfaces:** Múltiples badges con texto/hints y filtros por causa, sin nueva pantalla.

- [ ] Preparar casos y aserciones: multiple_badges_wrap_mobile; text_not_color_only; count_state_same_revision; filter_no_pii_storage.
- [ ] Escribir pruebas en `tests/search-work-labels-ui.test.js`; ejecutar `node --test tests/search-work-labels-ui.test.js` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Conservar navegación de estado a tarea exacta y comparar390/1280/zoom, sin cerrar búsqueda por un badge.
- [ ] Ejecutar `node --test tests/search-work-labels-ui.test.js` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
