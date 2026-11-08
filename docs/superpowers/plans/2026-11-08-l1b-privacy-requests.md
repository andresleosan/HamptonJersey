# PRE-12 email privacy handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Solo documentación ahora, sin construir o delegar construcción.

**Goal:** Tramitar solicitudes de copia/borrado recibidas por email mediante verificación y revisión del equipo, sin portal en la primera entrega.

**Architecture:** Expediente privado con CAS/hold/evidencia de identidad, copia revisada y entrega por flujo autorizado. Reutilizar correo, auth y reloj existentes; ninguna petición ejecuta un DELETE por sí sola.

**Tech Stack:** JavaScript ESM, React, Cloudflare Pages/Workers/D1 y pruebas Node/e2e existentes.

**Spec:** [diseño actualizado](../specs/2026-11-08-l1b-privacy-requests-design.md).

## Global Constraints

- PRE-12 listo en el alcance manual/email acordado. AUT17 operativo solo para el envío real; contenidos y parámetros se introducirán manualmente como confirma Luis. El catálogo histórico se reconciliará con el alcance revisado al construir, sin inventar una reserva o nueva consulta profesional ahora.
- Retención actual12 meses/excepciones activa/needs_review/oferta/sales intacta hasta activación humana de política nueva. NO_SALE hoy retiene toda venta, no purga real a 5 años. Ningún plazo sectorial nuevo ni SLA legal supuesto.
- EST-19 seis meses solo archivos no disponibles, no personas. Solicitud de erasure no ejecuta DELETE ni resuelve search_state; revisión/política/borrado físico requieren entrega autorizada separada.
- Formato JSON es elección técnica del planificador; campos/divulgación se configuran manualmente y se revisan en cada caso. No SELECT* ni decir acceso completo cuando faltan fuentes/cuerpos.
- PRE-10 dueño permisos/RecipientRef; privacy_notice por política aprobada no optinmarketing. AUT-17 no activado; no enviar ni cambiar configuración/DNS.
- CSS real panel #151515/#fff/#f4f3f0/#e3e0da/#6b665e/#a56b3d/#86542d/#2f6b4f/#a32020, field-line #8f8a82; YAML DESIGN antiguo no prevalece. Montserrat 14/1.5, Tenor26/19 peso400, card14/padding24, campo10/padding9px12px, botón 999/10px 20px, gap8–24, página 1240/24px 16px 120px, corte 760/editor 900, foco2/offset2, disabled .45; web 15/1.65/pill999/campo12. Copia completa en spec es restricción aplicable.
- Labels, status/alert, teclado/zoom 200%/1280/390/reduced motion, texto 4.5:1/foco 3:1. No PII en cache/storage/logs/URL ni librerías/fuentes nuevas.

## Review Focus

- Remitente conocido no prueba identidad del titular: recepción pendiente hasta verificación del equipo, Task1.
- Verificación/hold y limpieza concurrentes: todo guard dentro del mismo batch efectivo, Task1.
- Fuente o campo cambia tras revisar copia:409, no servir snapshot antiguo, Task2.
- Accepted/unknown de email no acreditan entrega leída ni justifican duplicado, Tasks2/3.
- No reinstalar portal ni modificar contratos personales/ventas por simplificar trámite, todas las tareas.

## Files and boundaries

Crear `server/privacy-requests.js`, `server/privacy-copy.js`, `server/retention-notices.js`, `server/routes/privacy-requests.js`, `admin/src/PrivacyRequests.jsx`, `tests/server/privacy-requests.test.mjs`, `tests/server/privacy-copy.test.mjs`, `tests/server/retention-notices.test.mjs` y `tests/privacy-requests.e2e.cjs`; migración siguienteNNNN según spec. Modificar `server/api.js`, `server/retention.js`, `server/routes/applicants.js`, `server/jobs.js`, `server/email.js`, `admin/src/App.jsx`, `admin/src/Email.jsx` y clases mínimas de styles.css. No crear privacy-principal.js/siteprivacy-account.js ni rutas/clientauthportal. NOT11/correo son productores existentes o dependencias reales, no stubs de éxito.

### Task1: Recepción, vínculo y revisión de identidad por equipo

**Interfaces:** PrivacyRequestCommand/Receipt y createPrivacyRequest/reviewPrivacyRequest del spec; actor currentAdmin y source_email_id explícito. Campos de identidad no se deducen del body del correo ni del email coincidente.

- [ ] RED `received_request_does_not_delete_or_verify`, `email_from_is_not_identity`, `staff_must_link_exact_contact_and_evidence`, `same_email_kind_reuses_request`, `same_operation_other_hash_409`, `one_assignee_before_review`, `two_reviewers_one_cas_wins`, `hold_and_delete_race`, `deleted_contact_not_recreated`. Afirmar contacto/criterios/actividad sin cambios y ninguna elevación por From.
- [ ] Ejecutar `node --test tests/server/privacy-requests.test.mjs`; RED por módulo/tablas nuevas.
- [ ] Implementar tablas/migración/rutas privadas y batch para recepción/audit/recibo y verificación/hold/audit; integrar DELETE ordinario/manual con guard de hold en su propia transacción. Guard fallido revierte todo. Preservar received_at original; no resetearlo al verificar.
- [ ] Integrar acción de crear/vincular solicitud desde correo del panel y asignación de responsable de admins existentes. Entrada sin política operativa/identidad permanece revisión sin copia disponible ni nuevo borrado. Sin portal o mensajes autónomos de Hermes.
- [ ] Repetir suites de solicitudes/retention/applicants →PASS y registrar regresión de búsquedas active/needs_review/ofertas/ventas. Commit futuro del alcance autorizado.

### Task2: Copia revisada y entrega registrada

**Interfaces:** readPrivacySubjectSnapshot/buildAccountCopy/readStaffPrivacyCopy/recordPrivacyDelivery exactos del spec. Snapshot y documento parten de mismas rows de un DB.batch; copy JSONschema1, máximo5MiB, datos propios y política de campos aprobada.

- [ ] RED `copy_requires_verified_assigned_request`, `unapproved_or_third_party_fields_not_exported`, `no_select_star_or_inferred_rental_link`, `purged_content_not_recreated`, `source_changed_after_review_409`, `oversize_not_truncated`, `staff_download_no_store`, `delivery_requires_verified_destination`, `accepted_not_auto_fulfilled`, `no_public_privacy_endpoint`.
- [ ] Ejecutar `node --test tests/server/privacy-copy.test.mjs`; RED específico.
- [ ] Implementar snapshot/hash/manifest/descarga staff, con verificación de caso/identidad/política en cada lectura. Sin URLs firmadas públicas, grants de cliente o cache. Cambio de fuentes exige regenerar/revisar, sin salida parcial silenciosa.
- [ ] Implementar revisión y registro de entrega por email autorizado/entrega manual documentada; adjunto no se envía por construir la copia. Reutilizar PRE10/AUT17 con finalidad privacy_notice, sin optinnews ni ignorar supresión/pausa. Estado unknown no dispara reintento ni fulfilled.
- [ ] GREEN suites focales y `E2E_SCRIPT=tests/privacy-requests.e2e.cjs npm run test:e2e`: correo fixture→caso→asignar/verificar→revisar copia→registrar entrega;401/403/409/errores/teclado1280/390/zoom200%. No datos reales ni portal de prueba.

### Task3: Aviso mes11 con revisión ante resultados inciertos

**Interfaces:** prepareRetentionNotice y guard/fence PRE10 del spec; fuente EXEMPT/EXPIRING existente, máximo50 por tick, no nuevo cron. Q05 aprobada: aviso fallido/incierto bloquea borrado del contacto y genera tarea; períodos sectoriales configurables de entrada manual.

- [ ] RED `month11_same_exemptions`, `notice_does_not_touch_activity`, `two_ticks_one_notice`, `new_activity_cancels_old_notice`, `changed_destination_rechecks_permission`, `unknown_not_auto_retried`, `provider_accepted_not_delivered`, `failed_or_unknown_notice_blocks_subject_delete`, `suppressed_notice_opens_review`, `task_write_failure_still_denies_delete`, `two_ticks_one_review_task`, `done_task_is_not_delete_authorization`, `unaffected_contact_rule_unchanged`.
- [ ] Ejecutar `node --test tests/server/retention-notices.test.mjs`; RED por productor nuevo.
- [ ] Implementar preparación/eligibilidad/claim/pre-call con versiones y política validada; conservar pausa/supresión/cuota100Jersey. Con fallo o política ausente, mostrar estado real y dejar el comportamiento destructivo nuevo deshabilitado, sin inventar gracia.
- [ ] Repetir focales →PASS; ejecutar `npm test`, `npm run build`, `npm run check:release`, e2e y MCP1280/390 sobre cambios locales. Revisión independiente y corrección de hallazgos antes de preparar SHA; migrar/publicar aparte.

## Self-review

A/F→Task1; B→Task2; C→Tasks2/3; D/E→restricciones y regresiones. Q02 resuelta por gestión manual/email; no preguntar cuenta/login/formatos de implementación. Los datos definitivos se añadirán manualmente; no se fabrican plazos/contenido ni se vuelve a pedir al abogado dentro de este plan. Todas las casillas son futuras: no hay tests de aplicación ejecutados durante la entrevista.

## Ajuste de Task3 por Q05 aprobada

- [ ] Incorporar retention_notice_reviews y reviewRetentionNoticeFailure del spec, identidad única por contacto/actividad/episodio y tarea NOT11 única. Registro de fallo+evento+tarea con statements componibles; no callback de segundo batch como garantía.
- [ ] Añadir al DELETE ordinario un guard de resultado verificable de aviso/hold/versión en la propia transacción; no borrado si el resultado es failed/unknown/suppressed o inaccesible. Probar crash antes de materializar tarea y carrera de dos ticks. Resolver tarea o registrar accepted no se interpreta como leído; revalidar evidencia y demás excepciones de dominio.
- [ ] Ejecutar tests focales de retention-notices, retention y search-lifecycle: fallo del aviso protege solo sujeto afectado, no reinicia actividad, no modifica otras búsquedas ni reglas de EST19. Q05 es decisión de operación aprobada; parámetros sectoriales se cargarán manualmente por Hampton.

## Cierre final: entrada manual fuera de trámites del maestro

Luis confirma que ya tiene los datos del abogado y los añadirá manualmente. Construir los campos de configuración, su validación y la tramitación por equipo; no un gestor de expedientes profesionales ni un trámite adicional de aprobación. Conservar revisiones, evidencia de identidad, selección de campos propios/terceros y protección de solicitudes, sin inventar los textos/periodos que aún no se han introducido. Q05 sigue operativa: aviso fallido/incierto bloquea el borrado del contacto y crea tarea; ninguna nueva purga sectorial se habilita por escribir el plan. Nombre institucional Hampton Estates LTD; el registro JOIC queda fuera del alcance vigente.

- [ ] En Q05 implementar notice_gate(E) exacto del spec: resultado cierto vigente O revisión manual_notice_documented resuelta con evidencia y liberación CAS del hold de aviso. Probar failed→manualnotice→reevaluación ordinaria, y que keep_for_review/Done de tarea/evidencia de otra versión/hold de privacidad distinto no autorizan DELETE. La acción de revisión no borra ni mueve actividad ficticiamente.
