# BUS-18 · Seguimiento por casa de los aplicantes que la buscan en alquiler o en venta Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Ver todas las búsquedas de una propiedad por operación con consulta/disponibilidad/interés/visita separados.

**Architecture:** Proyección sobre relaciones existentes sin duplicar contactos ni inferir una única búsqueda por persona.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-state-capture-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** BUS-10, AGE-03, EST-13; módulos de visitas según integración.

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

1. same_contact_two_searches_two_rows; sale_rent_separate; multiple_publications_one_candidate; rejected_not_unavailable_global; historical_closed_private_visible.
2. no_public_applicant_projection; other_scope_not_leaked; missing_visit_pending_not_booked; one_closed_case_does_not_close_shared_query.
3. keyboard_open_exact_search; partial_state_label; shared_query_context_visible; no_inferred_client_identity_by_name.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Relaciones tipadas y paginadas

**Files:** Create: server/property-search-relations.js; Test: tests/server/property-search-relations.test.mjs.

**Interfaces:** listPropertySearchRelations(env,{property_id,operation,after,limit:50})->{items,next_cursor,revision}.

- [ ] Preparar casos y aserciones: same_contact_two_searches_two_rows; sale_rent_separate; multiple_publications_one_candidate; rejected_not_unavailable_global; historical_closed_private_visible.
- [ ] Escribir pruebas en `tests/server/property-search-relations.test.mjs`; ejecutar `node --test tests/server/property-search-relations.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Agrupar por búsqueda/CandidateKey y enlazar consulta compartida con caso sin mezclar hogares, cantidades ni IDs de tablas diferentes.
- [ ] Ejecutar `node --test tests/server/property-search-relations.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Estado y enlaces seguros del seguimiento

**Files:** Modify: ruta de detalle de propiedad; Test: tests/server/property-search-followup-routes.test.mjs.

**Interfaces:** Proyección de evaluación/decisión/consulta/availability/interés/visita sin registro de comisiones.

- [ ] Preparar casos y aserciones: no_public_applicant_projection; other_scope_not_leaked; missing_visit_pending_not_booked; one_closed_case_does_not_close_shared_query.
- [ ] Escribir pruebas en `tests/server/property-search-followup-routes.test.mjs`; ejecutar `node --test tests/server/property-search-followup-routes.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Validar sesión/contexto y referenciar por ID exacto, sin copiar datos a Telegram ni exigir acuerdos de comisión.
- [ ] Ejecutar `node --test tests/server/property-search-followup-routes.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Superficie de seguimiento existente

**Files:** Modify: detalle privado de propiedad y enlaces ApplicantDetail; Test: tests/property-search-followup-ui.test.js.

**Interfaces:** Tabla/lista por operación y búsqueda, con badges independientes/fechas/origen.

- [ ] Preparar casos y aserciones: keyboard_open_exact_search; partial_state_label; shared_query_context_visible; no_inferred_client_identity_by_name.
- [ ] Escribir pruebas en `tests/property-search-followup-ui.test.js`; ejecutar `node --test tests/property-search-followup-ui.test.js` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Reutilizar pantalla privada y layout denso/legible en390/1280, sin publicación de mercado externo o Timelineglobal.
- [ ] Ejecutar `node --test tests/property-search-followup-ui.test.js` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.


## Contrato vigente de continuidad TP-05

[Forma exacta de referencias, dependencias y aceptación](../specs/2026-11-10-tp05-continuity-scope-design.md). Prevalece sobre la redacción histórica incompatible: no repositorio/archivos/llaves/bancos ADM-05 ni comisiones OFE-08. No nuevo servicio de documentos bajo otro nombre.
