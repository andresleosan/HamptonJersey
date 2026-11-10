# SAP-08 · Ficha del aplicante con pestañas Requirements, Matches, Timeline, Messages y Viewings Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Completar pestañas de conversaciones web/correo y visitas con vínculo explícito a cada búsqueda.

**Architecture:** Vistas de dominio existentes, sin duplicar cuerpos de mensaje o reconstruir historial aplazado.

**Tech Stack:** JavaScript/D1/Workers/React existentes; node:test y runner local del proyecto. R2/stream solo para módulo de medios. Sin nueva infraestructura/modelo/dependencias por este documento.

**Spec:** [Diseño propietario](../specs/2026-11-08-search-state-capture-design.md), [índice y preparación por tarea](2026-11-10-tp05-construction-index.md), [maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** MSG-02/03, AUT-17para correo; vínculo de visitas VIS-17 y REG-17.

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

1. two_searches_same_phone_no_auto_assignment; mismatched_operation_rejected; exact_existing_link_kept; deleted_case_not_restored.
2. contact_link_not_all_messages_permission; chat_deleted_body_not_copied; email_expiry_not_bypassed; no_meta_whatsapp_tab_in_scope.
3. tab_focus_keyboard; back_restores_exact_search; pending_visit_not_confirmed; unsaved_guard_preserved; no_pii_in_url_storage.
4. Actor/origen/búsqueda/operación o versión equivocados no heredan autorización; cubrir en pruebas del dueño de la ruta o confirmación.
5. Borrado/revocación/callback tardío o evidencia externa ausente no restauran datos ni se convierten en integración/activación; probar en regresiones o aceptación real del módulo.

## Tarea 1 · Asociación explícita de visita/búsqueda

**Files:** Modify: server/viewing-store.js y rutas de detalle; Test: tests/server/search-viewing-links.test.mjs.

**Interfaces:** Relación visita/contacto/applicant/property/op validada; legacysolo email/teléfono queda asociación por confirmar.

- [ ] Preparar casos y aserciones: two_searches_same_phone_no_auto_assignment; mismatched_operation_rejected; exact_existing_link_kept; deleted_case_not_restored.
- [ ] Escribir pruebas en `tests/server/search-viewing-links.test.mjs`; ejecutar `node --test tests/server/search-viewing-links.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Conectar contratos de VIS-17 sin reimplementar agenda. No asignar visitas históricas por coincidencia de nombre/contacto como si fueran vínculo acreditado.
- [ ] Ejecutar `node --test tests/server/search-viewing-links.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 2 · Conversaciones bajo su retención/autorización

**Files:** Modify: server/conversations.js al integrar MSG-03 y rutas Applicants; Test: tests/server/search-conversation-links.test.mjs.

**Interfaces:** ConversationRef web/email y relación humana validada; lectura conserva canal/tablafuente.

- [ ] Preparar casos y aserciones: contact_link_not_all_messages_permission; chat_deleted_body_not_copied; email_expiry_not_bypassed; no_meta_whatsapp_tab_in_scope.
- [ ] Escribir pruebas en `tests/server/search-conversation-links.test.mjs`; ejecutar `node --test tests/server/search-conversation-links.test.mjs` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Proyectar conversaciones autorizadas sin copiar texto a applicant ni guardar transcripción en referencias. Canal pendiente se muestra pendiente, no vacío engañoso.
- [ ] Ejecutar `node --test tests/server/search-conversation-links.test.mjs` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Tarea 3 · Pestañas y navegación

**Files:** Modify: admin/src/ApplicantDetail.jsx y App.jsx; Test: tests/search-detail-tabs-ui.test.js.

**Interfaces:** Requirements/Matches/Messages/Viewings, URL técnica por búsqueda; Timelineglobal sigue fuera.

- [ ] Preparar casos y aserciones: tab_focus_keyboard; back_restores_exact_search; pending_visit_not_confirmed; unsaved_guard_preserved; no_pii_in_url_storage.
- [ ] Escribir pruebas en `tests/search-detail-tabs-ui.test.js`; ejecutar `node --test tests/search-detail-tabs-ui.test.js` y comprobar fallo por comportamiento ausente, no por entorno/dependencias. Fixtures sintéticos.
- [ ] Reutilizar listados de mensajes/visitas y selección por ID sin nuevo panel monolítico, validando móvil/zoom/estados.
- [ ] Ejecutar `node --test tests/search-detail-tabs-ui.test.js` hasta PASS y regresiones de rutas/escritores afectados. Transporte/fixture prueba contrato local; no acredita permiso/modelo/entrega real.
- [ ] Revisar diff/evidencia y guardar unidad acotada con archivos concretos; commit inglés cuando el flujo de construcción lo permita. No gitaddgeneral, secretos o relevo privado.

## Cierre futuro

- [ ] Registrar construido/integrado/verificado/activado por separado en ledger propio/task/checklist/ESTADO; no marcar terminado por fixture o por escrito. Si falta módulo dueño, conservar bloqueo concreto.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y regresiones focales. UI: e2e/MCP1280/390, éxito/validación/vacío/error/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validar enlaces/contenido, sin pruebas de producto artificiales.
- [ ] Revisión independiente futura y corregir hallazgos antes de publicación. Activación/cambios de cuenta/infra/servicios/migración/push solo por autorizaciones reales de la sesión ejecutora; este plan no las concede.
