# AUT-20 · Validación integral del recorrido de búsqueda Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Definir y ejecutar después una batería integral A01–A16 y fallos transversales sobre módulos reales integrados.

**Architecture:** Runner/fixtures locales ejercen recorrido real; matriz bloquea aceptación si falta módulo en vez de darverde con mocks.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-review-criteria-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** Todas las dependencias formales del catálogo AUT-20 y VIS-17/NOT-01/08/09; no se construyen esos módulos aquí.

**Readiness:** conditional. Condición de cierre: todos los módulos de recorrido reales integrados antes de aceptación integral. «defined» significa diseño concreto, no reserva o dependencia ya integrada. Ninguna decisión humana nueva pendiente de esta ronda.

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

1. every_A01_A16_present; missing_VIS17_blocks_A10; no_real_credentials_or_prod_DB; no_mock_substitutes_domain_implementation.
2. A01_A16_together; two_staff_two_ticks; material_change_before_send; accepted_lost_ack_no_repeat; partial_capture_purge_retry; Jersey_DST_and_month_end; pets_no_excluded; parking_preferred_kept; review_repeats7d; purge_photos_only.
3. all_required_cases_pass_no_blockers; keyboard_zoom200_states; no_unexplained_console_network_errors; no_hidden_partial_coverage; no_fake_delivery_real_claim.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Matriz de cobertura y fixture reproducible

**Files:** Create: docs/roadmap/work/AUT-20/coverage.json y tests/search-workflow-fixtures.mjs.

**Interfaces:** CaseEvidence={case_id,module_versions,status:pending|passed|failed|blocked,evidence_ref}; A01–A16 exactos del maestro.

- [ ] Preparar casos y aserciones: every_A01_A16_present; missing_VIS17_blocks_A10; no_real_credentials_or_prod_DB; no_mock_substitutes_domain_implementation.
- [ ] Contrastar la evidencia/contrato documentados con sus fuentes. Paso de integración documental: no crear tests que solo repitan el archivo ni atribuir resultados históricos como ejecución actual.
- [ ] Mapear cada caso a implementación/evidencia y preparar fixture sintético de contacto con dos búsquedas, tresfuentesuna propiedad y dosunidadesdistintas, relojescontrolados. No marcar caso pasado por tenerplan.
- [ ] Validar contenido, referencias, estados y muestra sintética; registrar dependencias/evidencia faltante sin habilitar servicio ni cambiar estado de otra tarea.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Recorrido y casos transversales

**Files:** Create: tests/search-workflow.e2e.cjs y tests/server/search-workflow-concurrency.test.mjs.

**Interfaces:** Runnerlocal actual npm test:e2e/E2E_SCRIPT cuando exista, con módulos integrados y transportescontrolados.

- [ ] Preparar casos y aserciones: A01_A16_together; two_staff_two_ticks; material_change_before_send; accepted_lost_ack_no_repeat; partial_capture_purge_retry; Jersey_DST_and_month_end; pets_no_excluded; parking_preferred_kept; review_repeats7d; purge_photos_only.
- [ ] Escribir pruebas en `tests/server/search-workflow-concurrency.test.mjs`; ejecutar `node --test tests/server/search-workflow-concurrency.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Ejercitar escrituras/lecturas de módulos reales con proveedor de transporte falso en borde autorizado; aserciones de historial/no duplicados/decisión humana. Si falta dominio, registrarblocked y no sustituirlo porstub.
- [ ] Ejecutar `node --test tests/server/search-workflow-concurrency.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Evidencia visual y cierre real

**Files:** Create: docs/roadmap/work/AUT-20/acceptance.md y evidence-index.json; Modify: documentación del recorrido.

**Interfaces:** Resultado porcaso/commit/release, capturasMCP1280/390 y fallosabiertos; activaciónexterna separada.

- [ ] Preparar casos y aserciones: all_required_cases_pass_no_blockers; keyboard_zoom200_states; no_unexplained_console_network_errors; no_hidden_partial_coverage; no_fake_delivery_real_claim.
- [ ] Contrastar la evidencia/contrato documentados con sus fuentes. Paso de integración documental: no crear tests que solo repitan el archivo ni atribuir resultados históricos como ejecución actual.
- [ ] Ejecutar suites/build/release y MCP cuando módulos estén; corregir y repetir solo lo afectado. Cierreintegral requiere evidencia efectiva y ninguna incidencia que invalide recorrido, no publicar/migrar automáticamente.
- [ ] Validar contenido, referencias, estados y muestra sintética; registrar dependencias/evidencia faltante sin habilitar servicio ni cambiar estado de otra tarea.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
