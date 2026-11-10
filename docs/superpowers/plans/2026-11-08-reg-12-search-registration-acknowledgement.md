# REG-12 · Confirmación de alta y activación de búsqueda sin promesas de disponibilidad Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Confirmar alta/búsqueda con texto veraz y sin exponer coincidencias de contactos previos.

**Architecture:** Reutilizar alta pública/privada existente y progreso BUS-01; portal privado no bloquea el acuse.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-evaluation-batch-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** BUS-01/EST-09; validación/Turnstile y flujo REG-11 existentes.

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

1. duplicate_contact_no_match_count_leak; invalid_turnstile_no_active_claim; successful_new_active_no_property_promise; queue_pending_not_completed_search.
2. confirmation_focus; error_preserves_inputs; accepted_not_viewing_booking; slow_comparison_no_false_zero; repeat_generic_copy.
3. one_missing_field_one_cause; registration_notice_not_duplicated; active_search_stays_active; no_email_or_telegram_pii.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Respuesta pública mínima y repetición segura

**Files:** Modify: server/routes/public.js; Test: tests/server/registration-ack.test.mjs.

**Interfaces:** Acuse genérico; solo nueva solicitud puede informar actividad confirmada sin datos previos.

- [ ] Preparar casos y aserciones: duplicate_contact_no_match_count_leak; invalid_turnstile_no_active_claim; successful_new_active_no_property_promise; queue_pending_not_completed_search.
- [ ] Escribir pruebas en `tests/server/registration-ack.test.mjs`; ejecutar `node --test tests/server/registration-ack.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Mantener anti-enumeración y no devolver nombre/criterios/visitas de búsqueda previa; distinguir aceptación del formulario de resultado de matching.
- [ ] Ejecutar `node --test tests/server/registration-ack.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Confirmación accesible del formulario

**Files:** Modify: site/apply.js; Test: tests/registration-ack-ui.test.js.

**Interfaces:** Texto exacto de nueva búsqueda activa: Your search is active. Our team will review the details and suitable options.

- [ ] Preparar casos y aserciones: confirmation_focus; error_preserves_inputs; accepted_not_viewing_booking; slow_comparison_no_false_zero; repeat_generic_copy.
- [ ] Escribir pruebas en `tests/registration-ack-ui.test.js`; ejecutar `node --test tests/registration-ack-ui.test.js` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Usar componente confirm actual/aria-live y copy según resultado real; no pedir rehacer solicitud ni bloquear por AGE-12/IA.
- [ ] Ejecutar `node --test tests/registration-ack-ui.test.js` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Pendientes al equipo sin contacto nuevo automático

**Files:** Modify: server/search-progress.js y notificación de alta; Test: tests/server/registration-team-pending.test.mjs.

**Interfaces:** essential_pending por campo y tarea de revisión del alta ya existente.

- [ ] Preparar casos y aserciones: one_missing_field_one_cause; registration_notice_not_duplicated; active_search_stays_active; no_email_or_telegram_pii.
- [ ] Escribir pruebas en `tests/server/registration-team-pending.test.mjs`; ejecutar `node --test tests/server/registration-team-pending.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Conectar proyección al equipo y conservar tarea que corresponda; no revelar resultado al visitante mediante ruta técnica o polling anónimo.
- [ ] Ejecutar `node --test tests/server/registration-team-pending.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
