# SAP-02 · Número de casas con match y cuántas están confirmadas, en la lista de aplicantes Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Contar candidatos, aprobaciones y disponibilidad como dimensiones distintas por búsqueda.

**Architecture:** Única proyección comparte números con ficha/grupos; no deducir disponibilidad de Shortlisted.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-evaluation-batch-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** EST-13, BUS-10/12, episodios BUS-01 y hechos EST-16.

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

1. three_sources_one_count; rent_buy_separate; shortlisted_not_available; available_pending_must_not_fully_matched; pet_no_excluded_from_found; rejected_declined_or_stale_not_fully_matched.
2. count_detail_same_snapshot; unknown_not_zero; unauth_denied; stale_snapshot_marked; no_cross_contact_counts.
3. confirmed_not_ambiguous; loading_not_zero; approval_without_availability_distinct; partial_coverage_hint; screen_reader_labels.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Contadores por identidad/op

**Files:** Create: server/search-projections.js; Test: tests/server/search-match-summary.test.mjs.

**Interfaces:** getSearchMatchSummary(env,id)->{revision,found,approved,availability_confirmed,fully_matched,pending,alternatives,coverage_pending}.

- [ ] Preparar casos y aserciones: three_sources_one_count; rent_buy_separate; shortlisted_not_available; available_pending_must_not_fully_matched; pet_no_excluded_from_found; rejected_declined_or_stale_not_fully_matched.
- [ ] Escribir pruebas en `tests/server/search-match-summary.test.mjs`; ejecutar `node --test tests/server/search-match-summary.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Usar isFullAvailableCandidate del módulo común de BUS-12; definir SQL/reductor sobre estados vigentes con misma revisión; alternativas aparte, excluidas/rechazadas/no disponibles no vuelven Found.
- [ ] Ejecutar `node --test tests/server/search-match-summary.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · API y filtros coherentes

**Files:** Modify: server/routes/applicants.js; Test: tests/server/applicant-summary-routes.test.mjs.

**Interfaces:** Agregar resumen a lectura privada sin volcar anuncios/contactos; límites/preparación por página.

- [ ] Preparar casos y aserciones: count_detail_same_snapshot; unknown_not_zero; unauth_denied; stale_snapshot_marked; no_cross_contact_counts.
- [ ] Escribir pruebas en `tests/server/applicant-summary-routes.test.mjs`; ejecutar `node --test tests/server/applicant-summary-routes.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Exponer números y causas de pending, sin consulta global por fila ni nuevo registro de estado duplicado.
- [ ] Ejecutar `node --test tests/server/applicant-summary-routes.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Copy explícita en Applicants

**Files:** Modify: admin/src/Applicants.jsx, ApplicantDetail.jsx; Test: tests/applicant-match-counts-ui.test.js.

**Interfaces:** Found/Approved/Availability confirmed/Fully matched con definiciones del spec.

- [ ] Preparar casos y aserciones: confirmed_not_ambiguous; loading_not_zero; approval_without_availability_distinct; partial_coverage_hint; screen_reader_labels.
- [ ] Escribir pruebas en `tests/applicant-match-counts-ui.test.js`; ejecutar `node --test tests/applicant-match-counts-ui.test.js` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Reutilizar componentes/tipografía vigentes y mostrar fuente/fecha al abrir detalle. No usar Ready como reemplazo de la marca humana AUT-18.
- [ ] Ejecutar `node --test tests/applicant-match-counts-ui.test.js` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
