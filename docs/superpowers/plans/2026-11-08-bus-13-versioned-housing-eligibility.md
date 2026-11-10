# BUS-13 · Filtro por estatus de residencia según la categoría de vivienda de Jersey Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Separar la tabla de elegibilidad de vivienda, versión y evidencia, sin interpretar casos legales por inferencia.

**Architecture:** Extraer regla existente y validar diferencias con fuente primaria/responsable antes de activarlas; datos ausentes no se etiquetan compatibles.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-evaluation-batch-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** Motor BUS-12; validación competente de reglas vigentes y categorías de fichas aportadas por equipo.

**Readiness:** conditional. Condición de cierre: reglas y datos de vivienda con evidencia/validación competente antes de activar diferencias. «defined» significa diseño concreto, no reserva o dependencia ya integrada. Ninguna decisión humana nueva pendiente de esta ronda.

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

1. unapproved_rule_unknown; missing_category_unknown; unknown_status_not_entitled; unmatched_cell_needs_review; revoked_rules_not_applied.
2. Fuentes gov.je enlazadas en spec fechadas; ningún caso pareja/tenencia desconocido se convierte en permiso; llenar categoría por evidencia, no para ajustar score.
3. housing_unknown_not_full_match; excluded_not_clarification_candidate; label_alias_preserves_id; same_rules_version_replay_no_transition.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Adapter y matriz de comparación

**Files:** Create: server/housing-eligibility.js; Modify: server/matching.js; Test: tests/server/housing-eligibility.test.mjs.

**Interfaces:** evaluateHousingEligibility(search,candidate,ruleSet)->{result,evidence_refs,rule_version,needs_review}.

- [ ] Preparar casos y aserciones: unapproved_rule_unknown; missing_category_unknown; unknown_status_not_entitled; unmatched_cell_needs_review; revoked_rules_not_applied.
- [ ] Escribir pruebas en `tests/server/housing-eligibility.test.mjs`; ejecutar `node --test tests/server/housing-eligibility.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Extraer sin cambiar silenciosamente decisiones normativas. Crear matriz de diferencias contra código legado, incluyendo tenencias/operaciones/estatus, y separar fixture técnico de tabla legal aprobada.
- [ ] Ejecutar `node --test tests/server/housing-eligibility.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Expediente de reglas y datos faltantes

**Files:** Create: docs/roadmap/work/BUS-13/rule-matrix.md y approval-evidence.md.

**Interfaces:** HousingRuleSet={version,status,source_refs,review_ref,cells}; categorías verificadas por ficha, sin ID personal.

- [ ] Preparar casos y aserciones: Fuentes gov.je enlazadas en spec fechadas; ningún caso pareja/tenencia desconocido se convierte en permiso; llenar categoría por evidencia, no para ajustar score.
- [ ] Contrastar la evidencia/contrato documentados con sus fuentes. Paso de integración documental: no crear tests que solo repitan el archivo ni atribuir resultados históricos como ejecución actual.
- [ ] Documentar diferencias y resultado requerido del responsable competente; no pedir a Luis que invente tabla ni emitir dictamen aquí. Mantener pendiente de validación/categoría por caso.
- [ ] Validar contenido, referencias, estados y muestra sintética; registrar dependencias/evidencia faltante sin habilitar servicio ni cambiar estado de otra tarea.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Integración y legibilidad de la incertidumbre

**Files:** Modify: server/search-evaluation.js, admin/src/MatchCard.jsx; Test: tests/server/housing-eligibility-integration.test.mjs.

**Interfaces:** check vivienda con versión/fuente y resultado; UI muestra Needs verification, no decisión jurídica final.

- [ ] Preparar casos y aserciones: housing_unknown_not_full_match; excluded_not_clarification_candidate; label_alias_preserves_id; same_rules_version_replay_no_transition.
- [ ] Escribir pruebas en `tests/server/housing-eligibility-integration.test.mjs`; ejecutar `node --test tests/server/housing-eligibility-integration.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Activar diferencias solo con evidencia requerida y release autorizado. Comprobar que ningún modo/score salta incertidumbre; no reconstruir reglas de retorno sobre inferencias del plan.
- [ ] Ejecutar `node --test tests/server/housing-eligibility-integration.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
