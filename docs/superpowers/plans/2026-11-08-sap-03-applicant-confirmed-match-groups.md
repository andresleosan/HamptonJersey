# SAP-03 · Ficha del aplicante con todas las casas encontradas y las confirmadas disponibles Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Separar candidatos encontrados, pendientes y confirmados aptos sin duplicar publicaciones.

**Architecture:** Vista de detalle consume SAP-02/EST-13 y la misma identidad de episodios.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-evaluation-batch-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** EST-13, BUS-01/03, SAP-02 y disponibilidad EST-16.

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

1. same_property_one_group_row; pending_pets_not_available_for_client; approved_enquiry_stays_pending; incompatible_excluded; no_sources_count_as_homes.
2. tab_count_equals_items_total; missing_data_explanation; no_photo_permission_no_present_action; empty_vs_filtered_empty; keyboard_focus.
3. availability_revoked_between_load_and_action; search_closed_while_get_pending; old_group_fetch_not_restore; two_tabs_one_review.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Grupos del detalle con cursor

**Files:** Modify: server/routes/matches.js; Create: tests/server/applicant-match-groups.test.mjs.

**Interfaces:** listSearchCandidates(env,id,{group,after,limit:50})->{items,next_cursor,summary_revision}.

- [ ] Preparar casos y aserciones: same_property_one_group_row; pending_pets_not_available_for_client; approved_enquiry_stays_pending; incompatible_excluded; no_sources_count_as_homes.
- [ ] Escribir pruebas en `tests/server/applicant-match-groups.test.mjs`; ejecutar `node --test tests/server/applicant-match-groups.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Mapear grupos explícitos a estados canónicos, conservar fuente/fecha/publicaciones al expandir y paginación estable.
- [ ] Ejecutar `node --test tests/server/applicant-match-groups.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Tarjetas y grupos accesibles

**Files:** Modify: admin/src/ApplicantDetail.jsx, MatchCard.jsx; Test: tests/applicant-match-groups-ui.test.js.

**Interfaces:** Filtros por grupo con número de SAP-02, evidencias y estados independientes.

- [ ] Preparar casos y aserciones: tab_count_equals_items_total; missing_data_explanation; no_photo_permission_no_present_action; empty_vs_filtered_empty; keyboard_focus.
- [ ] Escribir pruebas en `tests/applicant-match-groups-ui.test.js`; ejecutar `node --test tests/applicant-match-groups-ui.test.js` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Conservar Review/acciones existentes, sin crear ficha pública ni aprobación por arrastrar de grupo.
- [ ] Ejecutar `node --test tests/applicant-match-groups-ui.test.js` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Cambios concurrentes en vista

**Files:** Modify: API/carga del detalle; Create: tests/server/applicant-match-groups-regression.test.mjs.

**Interfaces:** Revision del resumen/grupo y estado de acción guardado.

- [ ] Preparar casos y aserciones: availability_revoked_between_load_and_action; search_closed_while_get_pending; old_group_fetch_not_restore; two_tabs_one_review.
- [ ] Escribir pruebas en `tests/server/applicant-match-groups-regression.test.mjs`; ejecutar `node --test tests/server/applicant-match-groups-regression.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Revalidar en acción y refrescar estado obsoleto conservando entrada; mismo comportamiento legacy/market.
- [ ] Ejecutar `node --test tests/server/applicant-match-groups-regression.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
