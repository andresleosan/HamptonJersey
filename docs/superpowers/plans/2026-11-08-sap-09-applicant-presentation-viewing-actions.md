# SAP-09 · Acciones rápidas Send shortlist y Book viewing en la ficha del aplicante Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Conectar acciones rápidas a presentación revisada y propuesta de visita con sus confirmaciones.

**Architecture:** Atajos llaman servicios dueños; no nuevos envíos ni reservas directas que eludan aprobaciones.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-state-capture-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** AGE-11/12, VIS-17 y REG-17; EST-13.

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

1. pending_pets_not_presented; clarification_approval_not_presentation_approval; photo_rights_missing_denied; changed_snapshot_invalidates.
2. local_slot_not_agency_confirmation; two_searches_exact_target; stale_availability_denied; request_not_booked; conflicts_same_slot_one_winner.
3. double_click_no_duplicate; revoke_while_dialog_open_denies; focus_returns_to_match; search_stays_active; no_send_on_navigation.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Preparar presentación sin enviar

**Files:** Modify: server/private-presentations.js/ruta y ApplicantDetail; Test: tests/server/search-presentation-action.test.mjs.

**Interfaces:** preparePresentation existente recibe target/version; botón abre revisión extra del empleado.

- [ ] Preparar casos y aserciones: pending_pets_not_presented; clarification_approval_not_presentation_approval; photo_rights_missing_denied; changed_snapshot_invalidates.
- [ ] Escribir pruebas en `tests/server/search-presentation-action.test.mjs`; ejecutar `node --test tests/server/search-presentation-action.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Conectar atajo al flujo AGE-11 conservando enlace sin caducidad hasta revocación y datos mínimos; no envío por abrir diálogo.
- [ ] Ejecutar `node --test tests/server/search-presentation-action.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Preparar visita y franjas

**Files:** Modify: integración VIS-17/SlotPicker; Test: tests/server/search-viewing-action.test.mjs.

**Interfaces:** Acción de propuesta de visita con match/búsqueda/property/op y availability_preferences vigentes.

- [ ] Preparar casos y aserciones: local_slot_not_agency_confirmation; two_searches_exact_target; stale_availability_denied; request_not_booked; conflicts_same_slot_one_winner.
- [ ] Escribir pruebas en `tests/server/search-viewing-action.test.mjs`; ejecutar `node --test tests/server/search-viewing-action.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Usar servicio VIS-17cuando esté integrado; ausencia bloquea ese atajo, no el resto. No implementar de nuevo servidor de agenda ni Calendar.
- [ ] Ejecutar `node --test tests/server/search-viewing-action.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Acciones accesibles/versionadas

**Files:** Modify: admin/src/ApplicantDetail.jsx, MatchCard.jsx; Test: tests/search-quick-actions-ui.test.js.

**Interfaces:** Prepare presentation/Request viewing según estado, detalle y porqué está deshabilitado.

- [ ] Preparar casos y aserciones: double_click_no_duplicate; revoke_while_dialog_open_denies; focus_returns_to_match; search_stays_active; no_send_on_navigation.
- [ ] Escribir pruebas en `tests/search-quick-actions-ui.test.js`; ejecutar `node --test tests/search-quick-actions-ui.test.js` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Mostrar siguiente paso real con estado/conflicto, conservar borrador ante fallo y no revelar contacto a otro caso.
- [ ] Ejecutar `node --test tests/search-quick-actions-ui.test.js` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
