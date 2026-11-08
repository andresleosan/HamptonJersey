# Lista 1 match lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Solo planificación en el encargo actual; no ejecutar ni delegar agentes nuevos.

**Goal:** Relacionar interés, descarte, visitas, ofertas y acuerdos con el match canónico conservando historia y búsqueda activa.

**Architecture:** Seguimiento por candidate_id con dimensiones separadas y proyección de hechos de VIS-17/sales/AGE-12; CAS y eventos atómicos. Se conservan enums legacy sin reutilizar rejected del empleado como rechazo del cliente.

**Tech Stack:** ESM/JSDoc, D1, React, node:test existentes.

**Spec:** `docs/superpowers/specs/2026-11-08-l1-match-lifecycle-design.md`.

## Global Constraints

- EST-14 depende EST-13, AGE-12 y VIS-17 pendientes; EST-09 publicado se consume sin reconstruir. No fingir integración por disponer de planes. Alias EST-08 no duplica entrega.
- `match_candidates`/`match_decisions` son frontera propuesta del plan matching; no nueva identidad. Usar candidate_id+property_key+search_version/material_version; material_version es string/TEXT opaco, con igualdad exacta y sin coerción ni ordenación numérica; revision es entero.
- No cambios automáticos de criterios/MUST, disponibilidad global o search_state por interés, visita/oferta/acuerdo. D12 fuera.
- EST-18 nuevo productor usa entity_type applicant vigente y IDs estructurados, sin reconstrucción ni UI timeline. Preservar listingEventStatements al cambiar HE-* por ventas.
- Auth currentAdmin/SameOrigin para panel; VerifiedMatchActor applicant solo desde AGE-12 verificado. Sin datos personales/tokens en browser storage, events o logs.
- CSS panel actual #141414/#fff/#f2efe9/#e2ddd4/#6b665e/#8a6a3b/#1f6b3a/#a32020; Montserrat14/1.5, Tenor Sans H1 26/400; card14/padding24, campo10/#fbfaf8, botón999/10px20px, gaps8–16, tabla10px12px, corte760; foco2px/offset2, disabled.45. Propuestas de paleta/badges DESIGN no son CSS implementado.
- Labels y errores asociados, roles status/alert, teclado/zoom 200%/1280/390, sin toast/librerías/fuentes nuevas, miniaturas dimensionadas/lazy. Ningún fetch de originales para mostrar estado.

## Review Focus

1. Applicant responde a match ajeno o snapshot revocado: cero cambio y error que no filtra existencia (Task 1).
2. Cliente descarta casa en una búsqueda: no cambia criterios, aprobación staff ni otra búsqueda (Task 1).
3. Confirmación visita incompleta, no_show o reprogramación: no mostrar Viewed/Viewing booked falso (Task 2).
4. Oferta legacy sin unidad canónica única o varias ofertas: preservar datos y pedir link review, sin asociación por dirección (Task 2).
5. Cierre búsqueda concurrente o hecho tardío: no iniciar trabajo ni reabrir; sí preservar hecho acreditado histórico (Tasks 1–2).

## File map

Crear `server/match-lifecycle.js` (funciones y statements), `admin/src/MatchLifecycle.jsx` (controles y etiquetas), `tests/server/match-lifecycle.test.mjs`, `tests/match-lifecycle.e2e.cjs`. Modificar `server/routes/matches.js`, `server/routes/sales.js`, `server/routes/inbox.js` (o productor integrado VIS-17), `admin/src/MatchCard.jsx`, `admin/src/Applicants.jsx`, `admin/src/styles.css`; puerto AGE-12 llama internamente sin crear aquí ruta pública. Migración lógica futura `l1_match_lifecycle`: prefijo secuencial se asigna al construir contra main; crear heads/actions/operations/enlaces descritos en spec conservando legacy e índices, coordinar con tablas EST-13/VIS-17. No cambiar CHECK matches.status para mezclar dimensiones.

### Task 1: Interés canónico, actor y rechazo con motivo

**Files:** crear `server/match-lifecycle.js`, `tests/server/match-lifecycle.test.mjs`; modificar `server/routes/matches.js`; migración lógica `l1_match_lifecycle`.

**Interfaces:** consumir candidate y approval EST-13 integrados, `activeSql/isActive` de server/applicants.js y `availabilityFactsQuery({asOf,policy})` del grupo availability a través EST-13. Producir `recordMatchInterest(env,command:InterestCommand,verifiedActor:VerifiedMatchActor):Promise<{followup:MatchFollowup,event_id:number,replayed:boolean}>`, `matchLifecycleProjection(row,facts):MatchFollowup`. Tipos exactos en spec, actor derivado de autenticación.

- [ ] RED casos `not_interested_requires_reason`, `client_rejection_preserves_staff_approval_and_musts`, `another_match_or_search_unchanged`, `foreign_candidate_rejected_without_existence_leak`, `revoked_grant_cannot_respond`, `replay_and_payload_conflict`, `search_resolved_between_read_write_blocks_interest`, `opaque_material_version_matches_exactly`. Este último acepta token string `material-vA`, rechaza token distinto y el número 1 frente al token string `1`; la guarda CAS conserva comparación string exacta, sin parseInt/Number. Afirmar reason_code obligatorio, search_state active intacto para rechazo propio, other matches unchanged, request_id idéntico devuelve mismo event_id y payload distinto409.
- [ ] Ejecutar `node --test tests/server/match-lifecycle.test.mjs`; esperar FAIL por exports/tablas ausentes.
- [ ] Implementar heads/actions/operations y CAS de revision+search_version; whitelist de actions y motivo códigos price/area/size/condition/other. Validar candidate_id pertenece applicant/property_key/operación y material_version string opaca idéntica a la leída del candidate dentro de la guarda CAS; nunca convertirla a número; snapshot revocado/no presentado se rechaza. Batch con evento applicant y recibo; error rollback íntegro, ningún evento sin cambio. Agregar POST/GET `/api/admin/matches/:candidate_id/lifecycle` protegido conservando PUT review existente.
- [ ] GREEN repetir tests, incluidas auth401/origin403/bad400/noaccess404/conflict409 y SQL parametrizado. Cobrir dos empleados misma versión200/409 y refresh explícito sin perder borrador.
- [ ] Revisar diff y commit futuro del cambio, sin git add/commit ahora.

### Task 2: Productores visita/oferta/acuerdo y proyección lossless

**Files:** modificar `server/match-lifecycle.js`, `server/routes/sales.js`, `server/routes/inbox.js`, productor VIS-17 integrado y `tests/server/match-lifecycle.test.mjs`; enlaces de migración Task 1.

**Interfaces:** producir `matchLifecycleStatements(env,transition:SourceTransition):D1PreparedStatement[]` y `recordMatchLifecycleTransition(env,input:SourceTransition,staffActor:string):Promise<{followup,event_id,replayed}>`; consumir VIS-17 `requestViewingForMatch` con resultado `{viewing_id,state:'requested',revision}` y hechos de confirmaciones completas, offers/sales reales. Los nombres del puerto VIS-17 son propuesta de integración: confrontar con plan/entrega dueño, no construir sustituto. SourceTransition/source_version solo creados por productor interno, no API genérica que acepte hechos del navegador.

- [ ] RED `request_viewing_never_confirms`, `all_participants_required_for_booked`, `no_show_is_not_viewed`, `reschedule_updates_same_viewing`, `cancelled_viewing_preserves_interest`, `offer_acceptance_links_exact_candidate`, `legacy_ambiguous_link_requires_review`, `sales_mapping_retains_all_fields_and_ids`, `late_fact_is_history_only_for_resolved_search`, `duplicate_source_event_once`, `stale_source_event_cannot_regress_projection`.
- [ ] Ejecutar `node --test tests/server/match-lifecycle.test.mjs`; esperar FAIL de productores/proyección, no usar stubs para declarar dependencia real lista.
- [ ] Integrar statements al mismo env.DB.batch que modifica visita/offer/sale y listing events, con source_event_id/candidate_id únicos y guard de versiones. Si entrega upstream requiere outbox, guardar durable, mostrar pending y comprobar replay; no afterSave ignorado como cumplimiento. Oferta por operación sale usa servicios actuales; operación no soportada solo registra hecho acreditado sin crear sale/tenancy falsa. Backfill liga solo única identidad verificable y marca revisión para ambigüedad.
- [ ] Implementar labels a partir de dimensiones: Interested; Viewing booked solo confirmed con aceptaciones; Viewed solo completed; Offer pending/countered; Agreed accepted/in_progress acreditado. No sobreescribir status originario ni stage/search_state por proyección. Al cerrar/cancelar conservar acciones y permitir nuevos hechos con revisión explícita.
- [ ] GREEN repetir tests y rollback: si falla seguimiento/evento se revierte modificación de oferta/visita/listing; si llega hecho tardío se conserva sin nueva tarea ni reapertura. Afirmar otros clientes/consultas siguen activos.
- [ ] Revisar diff y commit futuro; no marcar AGE-12/VIS-17/EST-13 completos por adapters.

### Task 3: Interfaz de seguimiento y aceptación EST-14

**Files:** crear `admin/src/MatchLifecycle.jsx`, `tests/match-lifecycle.e2e.cjs`; modificar `admin/src/MatchCard.jsx`, `admin/src/Applicants.jsx`, `admin/src/styles.css` y `tests/server/match-lifecycle.test.mjs`.

**Interfaces:** `MatchLifecycle({match,followup,onAction,onReload})`, `onAction(InterestCommand):Promise<receipt>`; `match` conserva evaluación/aprobación EST-13 y `followup` de GET Task 1. Acciones Record offer/Request viewing abren productores existentes y no aceptan una etiqueta libre.

- [ ] RED recorrido e2e futuro: interesado→pedir visita=Requested; motivos de descarte requerido; booked solo tras confirmaciones VIS-17; viewed/offer/agreed con IDs correctos; búsqueda sigue active, MUST y otra búsqueda idénticos. Repetir action tras timeout devuelve recibo original;409 conserva formulario y exige Reload.
- [ ] Ejecutar `node tests/match-lifecycle.e2e.cjs` según harness vigente; esperar FAIL por componente ausente en entorno local autorizado.
- [ ] Implementar controles separados de evaluación/disponibilidad, texto inglés, labels/errores/foco, carga textual, vacío con causa y error inline. No añadir timeline. Motivo Other no inserta texto en events. Presentar disponibilidad afectada sin transformarla por rechazo cliente.
- [ ] GREEN pruebas focales + e2e; Playwright local1280/390 y zoom 200%, teclado/foco/cancelación/sesión caducada/errores, red/consola, sin overflow ni originales en lista. Medir consultas: usar joins por candidate_id e índices; no N+1 ni un historial completo por tarjeta.
- [ ] Ejecutar validación futura `npm test`, `npm run build`, `npm run check:release` y e2e general requerido; registrar resultados verdaderos, fallos previos y bloqueos. Revisar código y commit futuro con catálogo/ESTADO por dueño global; publicación aparte.

## Self-review

Spec EST-14/alias08 cubiertos en Tasks 1–3, EST-18 productor en Tasks 1–2, EST-09 invariante en cada task. Cada Review Focus tiene caso nombrado; interfaces usan el mismo candidate_id, ninguna tabla de match paralela. Plan no atribuye dependencias integradas ni decisiones nuevas a Luis. No producto/test/instalación/commit ejecutados en esta entrega.
