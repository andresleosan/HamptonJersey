# NOT-11 · Avisos con responsable, plazo y preferencias por persona Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Integrar la entrega conservada de tareas compartidas y su variante componible para productores, sin segundo Inbox.

**Architecture:** Continuar f98532a y plan8e65d7a sobre main verificado; conservar notifications y sus receipts/preferencias, extender contrato interno para productores reales.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-state-capture-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** EST-09; antecedente local NOT-11 y plan de continuidad, revisión de integración; NOT-01 consume resultado.

**Readiness:** continuity. Condición de cierre: integrar entrega existente y variante componible; productores solo cuando existan. «defined» significa diseño concreto, no reserva o dependencia ya integrada. Ninguna decisión humana nueva pendiente de esta ronda.

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

1. Verificar hashes fuente f98532afa8a9d414b19a36ab169719e15e89fb00 y8e65d7a84e0039975fab974b6eeb0ef1c0aebb65; listar solapamientos con REG-08/advertisers/eventos actuales sin afirmar integración publicada.
2. domain_failure_rolls_back_task; old_source_version_no_reopen; same_episode_one_history_revision; domain_update_preserves_human_due_and_assignee; wrong_target_rejected. Revisiones monotónicas, sin título/motivo en notification_history ni body en operations.
3. two_take_one_owner; same_operation_different_body_409; response_lost_same_operation_no_repeat; other_actor_preferences_denied; suppressed_reason_not_restored; Advertisers_navigation_preserved.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Preparar integración por comportamiento

**Files:** Read-only: fuentes documentadas en spec §3; Modify futuro: rutas/helpers/Inbox del antecedente; Create: docs/roadmap/work/NOT-11/integration-evidence.md.

**Interfaces:** syncTask(env,{taskKey,eventId,category,title,sourceVersion,resolved,actor})->Promise<number|null>, compatible con contrato conservado.

- [ ] Preparar casos y aserciones: Verificar hashes fuente f98532afa8a9d414b19a36ab169719e15e89fb00 y8e65d7a84e0039975fab974b6eeb0ef1c0aebb65; listar solapamientos con REG-08/advertisers/eventos actuales sin afirmar integración publicada.
- [ ] Contrastar la evidencia/contrato documentados con sus fuentes. Paso de integración documental: no crear tests que solo repitan el archivo ni atribuir resultados históricos como ejecución actual.
- [ ] Recuperar entrega mediante canal de código autorizado preservando clones ajenos. Conservar pruebas/migración fuente, adaptar ordinal libre y resolver solapamientos por comportamiento, sin copiar env/bases/relevo privado ni cherry-pick ciego.
- [ ] Validar contenido, referencias, estados y muestra sintética; registrar dependencias/evidencia faltante sin habilitar servicio ni cambiar estado de otra tarea.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Persistencia y composición atómica

**Files:** Modify: server/notification-tasks.js, migración aditiva de fuente; Create: tests/server/task-statements.test.mjs.

**Interfaces:** taskStatements(env,descriptor)->D1PreparedStatement[]; syncTask conserva wrapper; descriptor camelcase del spec/NOT-01.

- [ ] Preparar casos y aserciones: domain_failure_rolls_back_task; old_source_version_no_reopen; same_episode_one_history_revision; domain_update_preserves_human_due_and_assignee; wrong_target_rejected. Revisiones monotónicas, sin título/motivo en notification_history ni body en operations.
- [ ] Escribir pruebas en `tests/server/task-statements.test.mjs`; ejecutar `node --test tests/server/task-statements.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Extraer sentencias componibles y validar target/dependencias dentro del batch del dominio; conservar changes/last_insert_rowid de sus escritores. Si cambia Descriptor extender campos opcionales sin romper syncTask antiguo.
- [ ] Ejecutar `node --test tests/server/task-statements.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Rutas, preferencias y conflictos existentes

**Files:** Modify: server/routes/notifications.js, server/routes/notification-tasks.js, admin/src/Inbox.jsx, InboxTask.jsx, App.jsx, api.js; Test: tests/server/notification-tasks.test.mjs.

**Interfaces:** POST /admin/notifications; actions take/done/reopen/edit con operation_id/revision; preferences owner/category own; jerseyDeadline manual rechaza gap/fold.

- [ ] Preparar casos y aserciones: two_take_one_owner; same_operation_different_body_409; response_lost_same_operation_no_repeat; other_actor_preferences_denied; suppressed_reason_not_restored; Advertisers_navigation_preserved.
- [ ] Escribir pruebas en `tests/server/notification-tasks.test.mjs`; ejecutar `node --test tests/server/notification-tasks.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Integrar rutas/componentes de fuente y sus pruebas, máximo200 en listado heredado/50 en productores, sin canales nuevos ni idempotencia general de Applicants. Owner por identidad servidor, no body ni email usado como permiso global.
- [ ] Ejecutar `node --test tests/server/notification-tasks.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 4 · Consumidores y recorrido integrado

**Files:** Modify: consumidores nuevos de ciclo/indisponibilidad/captura; Read: NOT-01 existente; Create: tests/notification-tasks-integration.e2e.cjs y acceptance.md.

**Interfaces:** Descriptor interno común; NOT-01 conserva proyector/avisos, no lo construir aquí por inferencia.

- [ ] Preparar casos y aserciones: reply_updates_same_call; review_cycle_same_open_task; capture_partial_updates_same_task; due_does_not_close_search; no_private_content_in_telegram; callback_late_no_restore.
- [ ] Escribir pruebas en `tests/server/task-producer-contracts.test.mjs`; ejecutar `node --test tests/server/task-producer-contracts.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Probar contratos de productores disponibles y conservar los futuros pendientes. UI1280/390/zoom, guardado incierto/navegación/sesión. Cerrar solo integración real de NOT-11 con evidencia propia, no resultados históricos.
- [ ] Ejecutar `node --test tests/server/task-producer-contracts.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.

**Extensión requerida en tarea2:** resolver targets applicant/viewing/contact/property_operation/consultation/capture con resolveTaskTarget del spec y registry cerrado category. Añadir tests property_wrong_operation_denied, consultation_wrong_parent_denied, capture_deleted_parent_no_replay, unavailable_domain_not_live_target y confirmed_viewing_manual_task_not_silently_removed. Mantener tipos nuevos internos hasta revisar ampliación de API manual. Extraer taskStatements sin ampliar guardas antiguas no satisface la tarea.
