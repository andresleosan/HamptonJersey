# SPR-03 · Captura tras disponibilidad confirmada, ficha compartida y descargas Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Capturar ficha compartida con originales/descargas privados y estado por archivo tras disponibilidad confirmada.

**Architecture:** Servicio de captura por confirmación/versiones; medios externos separados del catálogo público y de aptitud AGE-10.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-state-capture-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** AGE-06, BUS-10, EST-13/16; permiso por fuente BUS-19; NOT-11; AGE-10 consumo posterior.

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

1. two_clients_one_capture; replay_same_fact_no_duplicate; changed_fact_new_version; queued_not_complete; role_photo_vs_document_preserved.
2. permission_revoked_no_fetch; redirect_off_allowlist_denied; stream_over20MiB_aborts; timeout10s_partial; late_result_after_unavailable_discarded; private_target_denied.
3. no_session_no_blob; public_media_route_cannot_serve_capture; safe_zip_names; missing_file_export_not_complete; limit_visible_not_silent_skip; document_not_in_photo_zip.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Manifiesto, episodio y unicidad

**Files:** Create: server/property-captures.js y migración aditiva captures/assets/tasks; Test: tests/server/property-captures.test.mjs.

**Interfaces:** requestPropertyCapture(env,{property_id,operation,confirmation_fact_id,policy_version},actor)->{capture_id,state}; getCaptureManifest(env,id).

- [ ] Preparar casos y aserciones: two_clients_one_capture; replay_same_fact_no_duplicate; changed_fact_new_version; queued_not_complete; role_photo_vs_document_preserved.
- [ ] Escribir pruebas en `tests/server/property-captures.test.mjs`; ejecutar `node --test tests/server/property-captures.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Guardar registros por archivo/procedencia/rights_ref y origen derivado, sin usar media público ni descargar antes de gate.
- [ ] Ejecutar `node --test tests/server/property-captures.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Adquisición acotada y commit vigente

**Files:** Modify: server/property-captures.js y adapter autorizado; Test: tests/server/property-capture-fetch.test.mjs.

**Interfaces:** captureTick(env,now,{limit:5,fetchImpl}); activosstored solo bytes/hash/metadatos íntegros.

- [ ] Preparar casos y aserciones: permission_revoked_no_fetch; redirect_off_allowlist_denied; stream_over20MiB_aborts; timeout10s_partial; late_result_after_unavailable_discarded; private_target_denied.
- [ ] Escribir pruebas en `tests/server/property-capture-fetch.test.mjs`; ejecutar `node --test tests/server/property-capture-fetch.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Usar reader de fuente fijo/validado,5archivos/tick/concurrencia1 y whitelist/magicbytes, no URLs arbitrarias ni ejecución de contenido. Commit compara scope/version/política tras red, fallos por archivo y backoff existente.
- [ ] Ejecutar `node --test tests/server/property-capture-fetch.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Descarga privada y exportación

**Files:** Create: server/routes/property-captures.js, server/private-zip.js, server/property-export.js, tests/server/property-capture-export.test.mjs; Modify: server/api.js.

**Interfaces:** Rutasstaff de manifiesto/assets/export; ZIPsolo fotos<=25archivos/50MiB, JSON/CSVseparados, contenido por stream.

- [ ] Preparar casos y aserciones: no_session_no_blob; public_media_route_cannot_serve_capture; safe_zip_names; missing_file_export_not_complete; limit_visible_not_silent_skip; document_not_in_photo_zip.
- [ ] Escribir pruebas en `tests/server/property-capture-export.test.mjs`; ejecutar `node --test tests/server/property-capture-export.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Implementar ZIPstore/CRC32 o utilidad existente, preflight/revalidación de permisos y version, abort/error parcial si cambia el archivo; attachment/nosniff/no-store, sin URLR2pública ni buffer global.
- [ ] Ejecutar `node --test tests/server/property-capture-export.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 4 · Revisión compartida y ciclo de medios

**Files:** Modify: detalle interno existente/Listings según módulo; Create: tests/property-capture-ui.test.js; Modify: NOT-11 productor.

**Interfaces:** TareaAbrir ficha única por captura, corrección versionada sin sustituir original; AGE-10 decide versiones aptas.

- [ ] Preparar casos y aserciones: partial_file_visible; five_clients_one_review_task; downloaded_not_photo_permission; source_url_safe; photo_purged_state_no_restore.
- [ ] Escribir pruebas en `tests/property-capture-ui.test.js`; ejecutar `node --test tests/property-capture-ui.test.js` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Mostrar complete/partial/fail y descargaindividual/selección, preservar referencia/auditoría mínima y roles de archivo para EST-19. No declarar cierre por placeholder sin captura real permitida.
- [ ] Ejecutar `node --test tests/property-capture-ui.test.js` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.

**Seguridad CSV en tarea3:** csvTextCell(value) prefija apóstrofo a todo texto externo y aplica RFC4180; números solo finitos tipados/validados, headers fijos. JSON mantiene original exacto. Añadir casos csv_formula_equals_plus_minus_at_never_evaluated, leading_controls_bom_formula_safe, multiline_quote_preserved y json_original_unchanged.

**Contrato de exportación de tarea3:** `streamPhotoZip(entries,{signal})->ReadableStream<Uint8Array>` en server/private-zip.js; entry `{asset_id,filename,size,openStream}` obtenido de manifiesto validado, filename generado por servidor sin paths del proveedor. Rutas propuestas staff: GET `/admin/property-captures/:id`, GET `/admin/property-captures/:id/assets/:assetId` y POST `/admin/property-captures/:id/exports` con `{capture_revision,asset_ids,format:'photos_zip'|'data_json'|'data_csv'}`. Solo payloadallowlist y target dentro de captura/scope. Añadir `capture_exports` si se necesita estado durable por manifiesto; completed acredita generación íntegra, no recepción del navegador. Cuerpo de stream cancelado/fallo marca parcial sin emitir éxito artificial. JSON/CSV solo campos de propiedad/evidencia acordados, no ficha personal del cliente.
