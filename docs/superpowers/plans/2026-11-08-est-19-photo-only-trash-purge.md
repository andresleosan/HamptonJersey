# EST-19 · Papelera de no disponibles y purga de archivos a los seis meses Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Purgar a seis meses solo fotografías y derivados del scope en papelera, preservando documentos e historial.

**Architecture:** Intención durable y estado por asset en storage no transaccional; rol/procedencia/versiones impiden borrar medios ajenos o activos.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-state-capture-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** EST-15, SPR-03, BUS-10/EST-18, AUT-07; separación PRE-12retención personal.

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

1. six_calendar_months_end_of_month; photo_and_thumbnail_eligible; pdf_word_csv_snapshot_floorplan_retained; untyped_or_mixed_archive_blocked; own_hampton_media_never_selected.
2. active_shared_blob_not_deleted; reactivation_after_preview_cannot_delete_new_asset; crash_after_delete_idempotent; failed_storage_not_complete; only_three_auto_attempts_then_manual.
3. two_ticks_one_purge; other_operation_files_retained; history_refs_legible; contact_retention_unchanged; old_ad_cannot_reimport_as_new; valid_link_reports_photo_removed.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Preview y vencimiento de seis meses

**Files:** Create: server/property-photo-purge.js; Test: tests/server/photo-purge-policy.test.mjs.

**Interfaces:** previewPhotoPurge(env,{trash_id,version})->{eligible_assets,retained_assets,blocked_assets,bytes}.

- [ ] Preparar casos y aserciones: six_calendar_months_end_of_month; photo_and_thumbnail_eligible; pdf_word_csv_snapshot_floorplan_retained; untyped_or_mixed_archive_blocked; own_hampton_media_never_selected.
- [ ] Escribir pruebas en `tests/server/photo-purge-policy.test.mjs`; ejecutar `node --test tests/server/photo-purge-policy.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Calcular vencimiento por mesesJersey y seleccionar solo photo/origenderivado/ZIPsolo fotos. Conservar el resto; no clasificar por extensión o MIMEimagen.
- [ ] Ejecutar `node --test tests/server/photo-purge-policy.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Intención, referencias y borrado seguro

**Files:** Modify: server/property-photo-purge.js; Test: tests/server/photo-purge-storage.test.mjs.

**Interfaces:** purgePhotoAssets(env,{trash_id,version,run_id},{storage})->{deleted,retained,failed,pending}.

- [ ] Preparar casos y aserciones: active_shared_blob_not_deleted; reactivation_after_preview_cannot_delete_new_asset; crash_after_delete_idempotent; failed_storage_not_complete; only_three_auto_attempts_then_manual.
- [ ] Escribir pruebas en `tests/server/photo-purge-storage.test.mjs`; ejecutar `node --test tests/server/photo-purge-storage.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Reservar versión inactiva/referencias actuales por asset antes de red y reconciliar resultado; reactivación obtiene asset nuevo si había reserva. Mantener task/state parcial y no resucitar bytes desde captura vieja.
- [ ] Ejecutar `node --test tests/server/photo-purge-storage.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Reloj, historial y presentación tras purga

**Files:** Modify: server/jobs.js y consumidor de medios privado; Test: tests/server/photo-purge-integration.test.mjs.

**Interfaces:** Procesado acotado en relojAUT-07 y tombstone/identidadmínima; enlace padre puede seguir válido sin servir foto borrada.

- [ ] Preparar casos y aserciones: two_ticks_one_purge; other_operation_files_retained; history_refs_legible; contact_retention_unchanged; old_ad_cannot_reimport_as_new; valid_link_reports_photo_removed.
- [ ] Escribir pruebas en `tests/server/photo-purge-integration.test.mjs`; ejecutar `node --test tests/server/photo-purge-integration.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Integrar etapa desactivada hasta pruebas/preview y autorización de activación; no cambiar cron ni datos privados del resto de módulos. Mostrar Photo removed by retention y mantener documentos/consultas/visitas.
- [ ] Ejecutar `node --test tests/server/photo-purge-integration.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
